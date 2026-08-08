import compression from 'compression';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { prisma } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import { documentSharingRoutes, shareAcceptRoutes } from './routes/sharing';
import type { RedisPubSub } from './services/RedisPubSub';

export interface CreateAppOptions {
  /**
   * Used by /api/health to report real Redis connectivity. Omitted in tests (and anywhere else
   * that doesn't want a live Redis connection) — the health endpoint just reports Redis as
   * disconnected, which is otherwise harmless since Redis is never a hard dependency.
   */
  redisPubSub?: RedisPubSub;
}

/**
 * Builds the Express app (middleware + routes) without binding a port or touching the
 * WebSocket/Redis layer — so it can be `supertest`ed directly. Production startup (index.ts)
 * still owns the HTTP server, WebSocket server, and Redis lifecycle.
 */
export function createApp(options: CreateAppOptions = {}): Express {
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

  app.get('/api/health', async (_req, res) => {
    const redisHealthy = (await options.redisPubSub?.healthCheck()) ?? false;
    const dbHealthy = await prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    const status = redisHealthy && dbHealthy ? 'healthy' : 'degraded';

    res.status(status === 'healthy' ? 200 : 503).json({
      status,
      serverId: options.redisPubSub?.getServerId() ?? null,
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

  return app;
}
