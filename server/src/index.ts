import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { createRedisClient } from './config/redis';
import { env } from './config/env';
import { prisma } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import { documentSharingRoutes, shareAcceptRoutes } from './routes/sharing';
import { RedisDocumentTracker } from './services/RedisDocumentTracker';
import { RedisPubSub } from './services/RedisPubSub';
import { setDocumentTracker } from './services/documentTrackerRegistry';
import { CollabWebSocketServer } from './websocket/WebSocketServer';
import { setWebSocketServer } from './websocket/registry';

const app = express();

// Content-Security-Policy is left off — the client relies on inline styles (Tailwind's JIT
// output, TipTap's inline node styles) that a default CSP would block; cross-origin embedder
// policy is also off since it's irrelevant to this API/WS-only origin.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache the preflight for 24h — CORS config here changes rarely.
  })
);
app.use(
  compression({
    threshold: 1024, // Skip compressing tiny responses — not worth the CPU.
    filter: (req, res) => (req.headers.upgrade ? false : compression.filter(req, res)),
  })
);
// The export endpoints receive full document HTML in the request body, which can exceed the
// default 100kb — everything else stays on the tighter 1mb ceiling.
app.use('/api/documents/:id/export', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use('/api/', (req, res, next) => (req.path === '/health' ? next() : generalLimiter(req, res, next)));

// Redis is a scaling/presence enhancement, never a hard dependency — a single instance with no
// Redis at all keeps working (see RedisPubSub/RedisDocumentTracker's internal graceful degradation).
const redisPubSub = new RedisPubSub();
const redisClient = createRedisClient();
const documentTracker = new RedisDocumentTracker(redisClient, redisPubSub.getServerId());
setDocumentTracker(documentTracker);

// Deferred so the initial connection handshake (typically well under a second) has a chance to
// finish first — checking at t=0 would otherwise almost always report "unavailable" against a
// perfectly healthy Redis that just hasn't connected yet.
setTimeout(() => {
  void redisPubSub.healthCheck().then((healthy) => {
    if (!healthy) {
      console.warn('[Redis] unavailable — running in single-server mode. Cross-server collaboration disabled.');
    }
  });
}, 1500);

app.get('/api/health', async (_req, res) => {
  const redisHealthy = await redisPubSub.healthCheck();
  const dbHealthy = await prisma
    .$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);

  const status = redisHealthy && dbHealthy ? 'healthy' : 'degraded';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    serverId: redisPubSub.getServerId(),
    redis: redisHealthy ? 'connected' : 'disconnected',
    database: dbHealthy ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', documentSharingRoutes);
app.use('/api/share', shareAcceptRoutes);
app.use('/api/folders', folderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);
const collabServer = new CollabWebSocketServer(httpServer, redisPubSub, documentTracker);
setWebSocketServer(collabServer);

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${env.PORT}/ws`);
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Server] Received ${signal} — shutting down gracefully...`);

  // Force-exit if a save or the server close hangs, so a stuck DB connection can't block deploys.
  const forceExitTimeout = setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  await collabServer.shutdown();

  await documentTracker.cleanupServer();
  await redisPubSub.shutdown();
  await redisClient.quit().catch(() => undefined);

  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
