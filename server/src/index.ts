import { createServer } from 'http';
import { createApp } from './app';
import { createRedisClient } from './config/redis';
import { env } from './config/env';
import { MetricsHistoryService } from './services/MetricsHistoryService';
import { MetricsService } from './services/MetricsService';
import { RedisDocumentTracker } from './services/RedisDocumentTracker';
import { RedisPubSub } from './services/RedisPubSub';
import { setDocumentTracker } from './services/documentTrackerRegistry';
import { CollabWebSocketServer } from './websocket/WebSocketServer';
import { setWebSocketServer } from './websocket/registry';

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

const app = createApp({ redisPubSub });

const httpServer = createServer(app);
const collabServer = new CollabWebSocketServer(httpServer, redisPubSub, documentTracker);
setWebSocketServer(collabServer);

const metrics = MetricsService.getInstance();
metrics.setServerId(redisPubSub.getServerId());
metrics.startPeriodicCleanup(() => collabServer.getConnectedUserIds());
MetricsHistoryService.getInstance().start();

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

  MetricsHistoryService.getInstance().stop();
  metrics.stopPeriodicCleanup();

  await collabServer.shutdown();

  await documentTracker.cleanupServer();
  await redisPubSub.shutdown();
  await redisClient.quit().catch(() => undefined);

  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
