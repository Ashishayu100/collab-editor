import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { Duplex } from 'stream';
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import { WebSocket, WebSocketServer as WSServer } from 'ws';
import * as Y from 'yjs';
import { prisma } from '../config/database';
import { checkDocumentAccess } from '../services/document.service';
import { verifyAccessToken } from '../utils/jwt';

enum MessageType {
  SYNC = 0,
  AWARENESS = 1,
}

const SAVE_DEBOUNCE_MS = 5000;
const PERIODIC_SAVE_INTERVAL_MS = 30000;

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  userColor: string;
  documentId: string;
}

interface DocumentRoom {
  docId: string;
  ydoc: Y.Doc;
  clients: Map<WebSocket, ClientConnection>;
  saveTimeout: ReturnType<typeof setTimeout> | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}

export class CollabWebSocketServer {
  private wss: WSServer;
  private rooms: Map<string, DocumentRoom> = new Map();
  private periodicSaveInterval: ReturnType<typeof setInterval>;

  constructor(httpServer: HTTPServer) {
    this.wss = new WSServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });

    this.periodicSaveInterval = setInterval(() => {
      this.rooms.forEach((room) => {
        if (room.hasUnsavedChanges) {
          void this.saveDocument(room);
        }
      });
    }, PERIODIC_SAVE_INTERVAL_MS);
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const documentId = url.searchParams.get('documentId');
    const token = url.searchParams.get('token');

    if (!documentId || !token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      await checkDocumentAccess(payload.userId, documentId);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true, avatarColor: true },
      });

      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, documentId, payload.userId, user.name, user.avatarColor);
      });
    } catch (error) {
      console.error('[WS] Auth failed during upgrade:', error);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  private async getOrCreateRoom(documentId: string): Promise<DocumentRoom> {
    const existing = this.rooms.get(documentId);
    if (existing) return existing;

    const ydoc = new Y.Doc();

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { content: true },
    });

    if (doc?.content) {
      try {
        Y.applyUpdate(ydoc, new Uint8Array(doc.content));
      } catch (error) {
        console.error(`[WS] Failed to load existing state for document ${documentId}:`, error);
      }
    }

    const room: DocumentRoom = {
      docId: documentId,
      ydoc,
      clients: new Map(),
      saveTimeout: null,
      hasUnsavedChanges: false,
      isSaving: false,
    };

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.SYNC);
      writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      room.clients.forEach((client, ws) => {
        if (ws !== origin && ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });

      room.hasUnsavedChanges = true;
      this.scheduleSave(room);
    });

    this.rooms.set(documentId, room);
    console.log(`[WS] Room created for document ${documentId}`);
    return room;
  }

  private handleConnection(
    ws: WebSocket,
    documentId: string,
    userId: string,
    userName: string,
    userColor: string
  ): void {
    void this.setupClient(ws, documentId, userId, userName, userColor);
  }

  private async setupClient(
    ws: WebSocket,
    documentId: string,
    userId: string,
    userName: string,
    userColor: string
  ): Promise<void> {
    const room = await this.getOrCreateRoom(documentId);

    if (ws.readyState !== WebSocket.OPEN) return;

    const client: ClientConnection = { ws, userId, userName, userColor, documentId };
    room.clients.set(ws, client);

    console.log(`[WS] Client connected: userId=${userId}, documentId=${documentId} (room has ${room.clients.size} clients)`);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SYNC);
    writeSyncStep1(encoder, room.ydoc);
    ws.send(encoding.toUint8Array(encoder));

    ws.on('message', (data: ArrayBuffer) => {
      try {
        this.handleMessage(room, client, new Uint8Array(data));
      } catch (error) {
        console.error(`[WS] Error handling message from userId=${userId}:`, error);
        ws.close();
      }
    });

    ws.on('close', () => {
      void this.handleDisconnect(room, ws, userId);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Socket error for userId=${userId}:`, error);
    });
  }

  private handleMessage(room: DocumentRoom, client: ClientConnection, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MessageType.SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC);

        readSyncMessage(decoder, encoder, room.ydoc, client.ws);

        if (encoding.length(encoder) > 1) {
          client.ws.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MessageType.AWARENESS: {
        this.broadcastToOthers(room, client.ws, data);
        break;
      }
      default:
        break;
    }
  }

  private broadcastToOthers(room: DocumentRoom, sender: WebSocket, data: Uint8Array): void {
    room.clients.forEach((_client, ws) => {
      if (ws !== sender && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  private async handleDisconnect(room: DocumentRoom, ws: WebSocket, userId: string): Promise<void> {
    room.clients.delete(ws);
    console.log(`[WS] Client disconnected: userId=${userId}, documentId=${room.docId} (room has ${room.clients.size} clients remaining)`);

    if (room.clients.size === 0) {
      if (room.saveTimeout) {
        clearTimeout(room.saveTimeout);
        room.saveTimeout = null;
      }
      if (room.hasUnsavedChanges) {
        await this.saveDocument(room);
      }
      this.rooms.delete(room.docId);
      room.ydoc.destroy();
      console.log(`[WS] Room destroyed for document ${room.docId}`);
    }
  }

  private scheduleSave(room: DocumentRoom): void {
    if (room.saveTimeout) {
      clearTimeout(room.saveTimeout);
    }
    room.saveTimeout = setTimeout(() => {
      room.saveTimeout = null;
      void this.saveDocument(room);
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveDocument(room: DocumentRoom): Promise<void> {
    if (room.isSaving) return;
    room.isSaving = true;

    try {
      const state = Y.encodeStateAsUpdate(room.ydoc);

      await prisma.document.update({
        where: { id: room.docId },
        data: { content: Buffer.from(state) },
      });

      room.hasUnsavedChanges = false;
      console.log(`[WS] Saved document ${room.docId} (${state.byteLength} bytes)`);
    } catch (error) {
      console.error(`[WS] Failed to save document ${room.docId}:`, error);
    } finally {
      room.isSaving = false;
    }
  }

  public close(): void {
    clearInterval(this.periodicSaveInterval);
    this.rooms.forEach((room) => {
      if (room.saveTimeout) clearTimeout(room.saveTimeout);
      room.ydoc.destroy();
    });
    this.rooms.clear();
    this.wss.close();
  }
}
