import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import { documentSharingRoutes, shareAcceptRoutes } from './routes/sharing';
import { CollabWebSocketServer } from './websocket/WebSocketServer';
import { setWebSocketServer } from './websocket/registry';

const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', documentSharingRoutes);
app.use('/api/share', shareAcceptRoutes);
app.use('/api/folders', folderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);
const collabServer = new CollabWebSocketServer(httpServer);
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

  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
