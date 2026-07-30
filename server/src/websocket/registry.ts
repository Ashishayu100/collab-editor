import { CollabWebSocketServer } from './WebSocketServer';

let instance: CollabWebSocketServer | null = null;

/** Set once at server startup, after the WebSocket server is constructed. */
export function setWebSocketServer(server: CollabWebSocketServer): void {
  instance = server;
}

/** Read anywhere (e.g. REST controllers) that needs to know who's actively connected. */
export function getWebSocketServer(): CollabWebSocketServer | null {
  return instance;
}
