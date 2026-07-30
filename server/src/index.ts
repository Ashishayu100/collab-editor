import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
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

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);
setWebSocketServer(new CollabWebSocketServer(httpServer));

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${env.PORT}/ws`);
});
