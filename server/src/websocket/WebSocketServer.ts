import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { Duplex } from 'stream';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  messageYjsSyncStep1,
  readSyncMessage,
  readSyncStep1,
  writeSyncStep1,
  writeUpdate,
} from 'y-protocols/sync';
import { WebSocket, WebSocketServer as WSServer } from 'ws';
import * as Y from 'yjs';
import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { checkDocumentAccess } from '../services/document.service';
import { RedisDocumentTracker } from '../services/RedisDocumentTracker';
import { RedisMessage, RedisPubSub } from '../services/RedisPubSub';
import { createVersion, shouldAutoSnapshot } from '../services/versionService';
import { verifyAccessToken } from '../utils/jwt';
import { CommentEvent } from '../types/comment';

/** Tag applied to Y.Doc/Awareness updates applied from a Redis message, so the `update`
 *  listeners below know not to republish them (which would echo the change back and forth
 *  between server instances forever). */
const REDIS_ORIGIN = 'redis';

// Message type registry (shared with client/src/lib/WebSocketProvider.ts):
//   0 = Yjs sync (sync step 1 / sync step 2 / update, per y-protocols/sync)
//   1 = awareness (cursors, presence, "typing" flag)
//   2 = save-confirmed (server -> client only, sent after a debounced/periodic DB save)
//   3 = ping/pong (latency probe — echoed back verbatim, no decoding needed)
//   4 = document-restored (server -> client only, sent after a version restore completes)
//   5 = role-updated (server -> client only, sent when the caller's role on this doc changes)
//   6 = access-revoked (server -> client only, sent when the caller loses access entirely)
//   7 = comment-event (server -> client only, sent after a comment REST mutation, JSON payload)
enum MessageType {
  SYNC = 0,
  AWARENESS = 1,
  SAVE_CONFIRMED = 2, // server -> client only
  PING = 3,
  DOCUMENT_RESTORED = 4, // server -> client only
  ROLE_UPDATED = 5, // server -> client only
  ACCESS_REVOKED = 6, // server -> client only
  COMMENT_EVENT = 7, // server -> client only
}

const SAVE_DEBOUNCE_MS = 5000;
const PERIODIC_SAVE_INTERVAL_MS = 30000;
const EMPTY_ROOM_CLEANUP_MS = 60000;
const MAX_CONSECUTIVE_SAVE_FAILURES = 5;
const DOCUMENT_SIZE_WARNING_BYTES = 5 * 1024 * 1024; // 5MB

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  userColor: string;
  documentId: string;
  /** Resolved at connect time; updated in place if the server pushes a live role change. */
  role: Role;
  /** Awareness clientIds this connection introduced — used to clean up on disconnect. */
  ownedClientIds: Set<number>;
}

interface DocumentRoom {
  docId: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  clients: Map<WebSocket, ClientConnection>;
  saveTimeout: ReturnType<typeof setTimeout> | null;
  /** Set once a client disconnects leaving the room empty; cancelled if someone rejoins. */
  emptyRoomTimeout: ReturnType<typeof setTimeout> | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  /** State vector as of the last successful save — lets us skip no-op writes. */
  lastSavedStateVector: Uint8Array | null;
  consecutiveSaveFailures: number;
  /** Who most recently pushed a doc update — used to attribute auto-created version snapshots. */
  lastEditorUserId: string | null;
}

export interface ActiveUser {
  name: string;
  color: string;
}

function stateVectorsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class CollabWebSocketServer {
  private wss: WSServer;
  private rooms: Map<string, DocumentRoom> = new Map();
  private periodicSaveInterval: ReturnType<typeof setInterval>;
  private redisPubSub: RedisPubSub;
  private documentTracker: RedisDocumentTracker;

  constructor(httpServer: HTTPServer, redisPubSub: RedisPubSub, documentTracker: RedisDocumentTracker) {
    this.wss = new WSServer({ noServer: true });
    this.redisPubSub = redisPubSub;
    this.documentTracker = documentTracker;

    httpServer.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });

    this.periodicSaveInterval = setInterval(() => {
      this.rooms.forEach((room) => {
        if (room.hasUnsavedChanges) {
          void this.saveDocument(room);
        }
        // Keeps the cross-server active-user hash alive well within its 120s TTL — a server
        // that crashes without running its shutdown handler just stops refreshing, so its
        // entries age out on their own instead of lingering forever.
        void this.documentTracker.refreshTTL(room.docId);
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
      const { role } = await checkDocumentAccess(payload.userId, documentId);

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
        this.handleConnection(ws, documentId, payload.userId, user.name, user.avatarColor, role);
      });
    } catch (error) {
      console.error('[WS] Auth failed during upgrade:', error);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  private async getOrCreateRoom(documentId: string): Promise<DocumentRoom> {
    const existing = this.rooms.get(documentId);
    if (existing) {
      // A client reconnected before the empty-room grace period elapsed — keep the room alive.
      if (existing.emptyRoomTimeout) {
        clearTimeout(existing.emptyRoomTimeout);
        existing.emptyRoomTimeout = null;
      }
      return existing;
    }

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
      awareness: new Awareness(ydoc),
      clients: new Map(),
      saveTimeout: null,
      emptyRoomTimeout: null,
      hasUnsavedChanges: false,
      isSaving: false,
      lastSavedStateVector: doc?.content ? Y.encodeStateVector(ydoc) : null,
      consecutiveSaveFailures: 0,
      lastEditorUserId: null,
    };

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin instanceof WebSocket) {
        const originClient = room.clients.get(origin);
        if (originClient) {
          room.lastEditorUserId = originClient.userId;
        }
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.SYNC);
      writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      room.clients.forEach((_client, ws) => {
        if (ws !== origin && ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });

      room.hasUnsavedChanges = true;
      this.scheduleSave(room);

      // Updates replayed from Redis (origin === REDIS_ORIGIN) must not be published back —
      // that would echo the change between server instances forever.
      if (origin !== REDIS_ORIGIN) {
        this.redisPubSub.publishYjsSync(room.docId, update).catch((err) => {
          console.error(`[WS] Redis sync publish failed for doc ${room.docId}:`, err);
        });
      }
    });

    room.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        // Attribute newly-introduced/removed clientIds to whichever connection caused the
        // change, so we know what to clean up when that connection disconnects.
        if (origin instanceof WebSocket) {
          const originClient = room.clients.get(origin);
          if (originClient) {
            added.forEach((id) => originClient.ownedClientIds.add(id));
            removed.forEach((id) => originClient.ownedClientIds.delete(id));
          }
        }

        const changedClients = added.concat(updated, removed);
        if (changedClients.length === 0) return;

        const awarenessUpdate = encodeAwarenessUpdate(room.awareness, changedClients);

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessUpdate);
        const message = encoding.toUint8Array(encoder);

        room.clients.forEach((_client, ws) => {
          if (ws !== origin && ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        });

        if (origin !== REDIS_ORIGIN) {
          this.redisPubSub.publishAwareness(room.docId, awarenessUpdate).catch((err) => {
            console.error(`[WS] Redis awareness publish failed for doc ${room.docId}:`, err);
          });
        }
      }
    );

    this.rooms.set(documentId, room);

    await this.redisPubSub.subscribe(documentId, (message) => this.handleRedisMessage(documentId, message));

    console.log(`[WS] Room created for document ${documentId}`);
    return room;
  }

  /** Applies a message published by another server instance to this server's local room state. */
  private handleRedisMessage(documentId: string, message: RedisMessage): void {
    const room = this.rooms.get(documentId);
    if (!room) return; // Room was destroyed locally between publish and delivery — nothing to apply.

    switch (message.type) {
      case 'yjs-sync': {
        const update = new Uint8Array(Buffer.from(message.payload, 'base64'));
        Y.applyUpdate(room.ydoc, update, REDIS_ORIGIN);
        break;
      }
      case 'yjs-awareness': {
        const update = new Uint8Array(Buffer.from(message.payload, 'base64'));
        applyAwarenessUpdate(room.awareness, update, REDIS_ORIGIN);
        break;
      }
      case 'comment-event': {
        const event = JSON.parse(message.payload) as CommentEvent;
        this.broadcastCommentEventToLocalClients(documentId, event);
        break;
      }
      default:
        break;
    }
  }

  private handleConnection(
    ws: WebSocket,
    documentId: string,
    userId: string,
    userName: string,
    userColor: string,
    role: Role
  ): void {
    void this.setupClient(ws, documentId, userId, userName, userColor, role);
  }

  private async setupClient(
    ws: WebSocket,
    documentId: string,
    userId: string,
    userName: string,
    userColor: string,
    role: Role
  ): Promise<void> {
    const room = await this.getOrCreateRoom(documentId);

    if (ws.readyState !== WebSocket.OPEN) return;

    const client: ClientConnection = { ws, userId, userName, userColor, documentId, role, ownedClientIds: new Set() };
    room.clients.set(ws, client);

    void this.documentTracker.addActiveUser(documentId, userId, userName);

    console.log(`[WS] Client connected: userId=${userId}, documentId=${documentId} (room has ${room.clients.size} clients)`);

    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MessageType.SYNC);
    writeSyncStep1(syncEncoder, room.ydoc);
    ws.send(encoding.toUint8Array(syncEncoder));

    // Bring the new client up to speed on everyone already present in the room.
    const existingClientIds = Array.from(room.awareness.getStates().keys());
    if (existingClientIds.length > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MessageType.AWARENESS);
      encoding.writeVarUint8Array(awarenessEncoder, encodeAwarenessUpdate(room.awareness, existingClientIds));
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }

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

        if (client.role === 'VIEWER') {
          // Read-only: still answer "what do you have that I don't" (sync step 1) so a viewer's
          // own Y.Doc gets caught up, but silently drop anything that would mutate the room's
          // doc (sync step 2 / update) — a viewer pushing edits, whether from a modified client
          // or a stale session, must never actually change the document.
          const syncType = decoding.readVarUint(decoder);
          if (syncType === messageYjsSyncStep1) {
            readSyncStep1(decoder, encoder, room.ydoc);
            if (encoding.length(encoder) > 1) {
              client.ws.send(encoding.toUint8Array(encoder));
            }
          }
          break;
        }

        readSyncMessage(decoder, encoder, room.ydoc, client.ws);

        if (encoding.length(encoder) > 1) {
          client.ws.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MessageType.AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        applyAwarenessUpdate(room.awareness, update, client.ws);
        break;
      }
      case MessageType.PING: {
        // Echo the exact bytes back so the client can measure round-trip latency.
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(data);
        }
        break;
      }
      default:
        break;
    }
  }

  private async handleDisconnect(room: DocumentRoom, ws: WebSocket, userId: string): Promise<void> {
    const client = room.clients.get(ws);
    room.clients.delete(ws);

    if (client && client.ownedClientIds.size > 0) {
      removeAwarenessStates(room.awareness, Array.from(client.ownedClientIds), null);
    }

    // Only clear this user's tracker entry once none of their other tabs/connections remain in
    // this room — a second open tab on the same document must not make them vanish from "N editing".
    const stillConnected = Array.from(room.clients.values()).some((c) => c.userId === userId);
    if (!stillConnected) {
      void this.documentTracker.removeActiveUser(room.docId, userId);
    }

    console.log(`[WS] Client disconnected: userId=${userId}, documentId=${room.docId} (room has ${room.clients.size} clients remaining)`);

    if (room.clients.size === 0) {
      // Persist promptly — don't make an unsaved edit wait out the full cleanup grace period.
      if (room.hasUnsavedChanges) {
        await this.saveDocument(room);
      }

      if (room.emptyRoomTimeout) {
        clearTimeout(room.emptyRoomTimeout);
      }
      room.emptyRoomTimeout = setTimeout(() => {
        void this.cleanupEmptyRoom(room);
      }, EMPTY_ROOM_CLEANUP_MS);
    }
  }

  /** Destroys a room that's been empty for the full grace period — a quick reconnect cancels this. */
  private async cleanupEmptyRoom(room: DocumentRoom): Promise<void> {
    if (room.clients.size > 0) return;

    if (room.hasUnsavedChanges) {
      await this.saveDocument(room);
    }

    if (this.rooms.get(room.docId) === room) {
      this.rooms.delete(room.docId);
    }
    room.ydoc.destroy();

    await this.redisPubSub.unsubscribe(room.docId);
    await this.documentTracker.removeAllServerUsers(room.docId);

    console.log(`[WS] Room destroyed for document ${room.docId} (empty for ${EMPTY_ROOM_CLEANUP_MS / 1000}s)`);
  }

  /**
   * The true current content of a document, if it's live in memory right now — always more
   * up to date than Postgres, which only reflects the room's last debounced/periodic save (up
   * to SAVE_DEBOUNCE_MS / PERIODIC_SAVE_INTERVAL_MS stale). Callers that need "the document's
   * content right now" (manual snapshots, the pre-restore safety snapshot) should prefer this
   * over reading `document.content` directly, falling back to the DB only when no room is live.
   */
  public getLiveDocumentState(documentId: string): Buffer | null {
    const room = this.rooms.get(documentId);
    if (!room) return null;
    return Buffer.from(Y.encodeStateAsUpdate(room.ydoc));
  }

  /** Snapshot of who currently has the document open, for the REST API / dashboard. */
  public getActiveUsers(documentId: string): ActiveUser[] {
    const room = this.rooms.get(documentId);
    if (!room) return [];

    const users: ActiveUser[] = [];
    room.awareness.getStates().forEach((state) => {
      const user = state?.user as { name?: unknown; color?: unknown } | undefined;
      if (user && typeof user.name === 'string' && typeof user.color === 'string') {
        users.push({ name: user.name, color: user.color });
      }
    });
    return users;
  }

  /**
   * Apply a version-restore's content to a live room (if one exists), merging it into the
   * room's actual Y.Doc via a transaction so the change flows through the normal update
   * pipeline — broadcasting to connected clients and scheduling a save exactly like any other
   * edit. Returns whether a live room was updated; if not, the caller's direct DB write (see
   * versionService.restoreVersion) is the only persistence needed, since the next time someone
   * opens the document a fresh room will be loaded from that DB state.
   */
  public applyRestoredState(documentId: string, restoredState: Buffer): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    const restoredDoc = new Y.Doc();
    Y.applyUpdate(restoredDoc, new Uint8Array(restoredState));

    const liveFragment = room.ydoc.getXmlFragment('default');
    const restoredFragment = restoredDoc.getXmlFragment('default');

    room.ydoc.transact(() => {
      liveFragment.delete(0, liveFragment.length);
      const clonedContent = restoredFragment
        .toArray()
        .filter((item): item is Y.XmlElement | Y.XmlText => item instanceof Y.XmlElement || item instanceof Y.XmlText)
        .map((item) => item.clone());
      liveFragment.insert(0, clonedContent);
    });

    restoredDoc.destroy();
    return true;
  }

  /**
   * Notify everyone currently connected to a document that it was just restored to an earlier
   * version, so clients can show a "Document restored to Version N by X" toast. Purely
   * informational — the actual content change is delivered separately via applyRestoredState.
   * Returns whether a live room existed to notify; if not, nobody is connected to see it anyway.
   */
  public notifyVersionRestored(
    documentId: string,
    payload: { versionNum: number; restoredBy: string; label: string | null }
  ): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.DOCUMENT_RESTORED);
    encoding.writeVarUint(encoder, payload.versionNum);
    encoding.writeVarString(encoder, payload.restoredBy);
    encoding.writeVarString(encoder, payload.label ?? '');
    const message = encoding.toUint8Array(encoder);

    room.clients.forEach((_client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });

    return true;
  }

  /**
   * Push a live role change to whichever of a user's connections are open on this document, so
   * an already-open session reflects it immediately (e.g. becomes read-only) instead of staying
   * stale until they refresh or reconnect. Also updates the stored per-connection role so the
   * SYNC-message gate above takes effect on the very next message, not just future connections.
   */
  public notifyRoleChanged(documentId: string, userId: string, newRole: Role): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    let notified = false;
    room.clients.forEach((client, ws) => {
      if (client.userId !== userId) return;
      client.role = newRole;
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.ROLE_UPDATED);
        encoding.writeVarString(encoder, newRole);
        ws.send(encoding.toUint8Array(encoder));
        notified = true;
      }
    });
    return notified;
  }

  /**
   * A collaborator was just removed — tell any of their open connections on this document that
   * their access is gone and close the socket, rather than leaving them silently connected
   * (still receiving broadcasts, still able to attempt syncStep1) until they happen to reload.
   */
  public revokeAccess(documentId: string, userId: string): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    let revoked = false;
    room.clients.forEach((client, ws) => {
      if (client.userId !== userId) return;
      revoked = true;
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.ACCESS_REVOKED);
        ws.send(encoding.toUint8Array(encoder));
        ws.close(4001, 'Access revoked');
      }
    });
    return revoked;
  }

  /**
   * Broadcast a comment REST mutation (create/reply/edit/delete/resolve/unresolve) to everyone
   * currently connected to the document, so the CommentsPanel updates in real time without
   * polling. Returns whether a live room existed to notify.
   */
  public broadcastCommentEvent(documentId: string, event: CommentEvent): boolean {
    const delivered = this.broadcastCommentEventToLocalClients(documentId, event);

    this.redisPubSub.publishCommentEvent(documentId, event).catch((err) => {
      console.error(`[WS] Redis comment publish failed for doc ${documentId}:`, err);
    });

    return delivered;
  }

  /** Sends a comment event to this server's own connected clients only — used both for local
   *  REST mutations (via broadcastCommentEvent above) and for events replayed from Redis, which
   *  must never be re-published or every instance would echo them back and forth forever. */
  private broadcastCommentEventToLocalClients(documentId: string, event: CommentEvent): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.COMMENT_EVENT);
    encoding.writeVarString(encoder, JSON.stringify(event));
    const message = encoding.toUint8Array(encoder);

    room.clients.forEach((_client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });

    return true;
  }

  /**
   * Apply a Yjs state received out-of-band (the REST content-save fallback used when a
   * client's WebSocket is down) into a live room, if one exists, via the room's own Y.Doc —
   * so it flows through the normal update pipeline (broadcast to connected clients, scheduled
   * save) exactly like any other edit, and later merges are commutative regardless of arrival
   * order. Returns whether a live room absorbed it; if not, the caller must persist directly
   * since nobody has this document open over WebSocket right now.
   */
  public applyExternalUpdate(documentId: string, state: Buffer): boolean {
    const room = this.rooms.get(documentId);
    if (!room) return false;

    room.ydoc.transact(() => {
      Y.applyUpdate(room.ydoc, new Uint8Array(state));
    }, 'rest-fallback');

    return true;
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

    const currentStateVector = Y.encodeStateVector(room.ydoc);
    if (room.lastSavedStateVector && stateVectorsEqual(currentStateVector, room.lastSavedStateVector)) {
      // Nothing has actually changed since the last successful save (e.g. an edit that was
      // immediately undone) — skip the write.
      room.hasUnsavedChanges = false;
      return;
    }

    room.isSaving = true;

    try {
      const state = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));

      if (state.byteLength > DOCUMENT_SIZE_WARNING_BYTES) {
        console.warn(`[WS] Document ${room.docId} content is ${state.byteLength} bytes — exceeds the 5MB warning threshold`);
      }

      const editorId = room.lastEditorUserId;
      const shouldSnapshot = await shouldAutoSnapshot(room.docId, state.byteLength);

      await prisma.$transaction(async (tx) => {
        await tx.document.update({ where: { id: room.docId }, data: { content: state } });

        if (shouldSnapshot && editorId) {
          await createVersion(room.docId, state, editorId, { client: tx });
        }
      });

      room.hasUnsavedChanges = false;
      room.lastSavedStateVector = currentStateVector;
      room.consecutiveSaveFailures = 0;
      console.log(`[WS] Saved document ${room.docId} (${state.byteLength} bytes)`);
      this.broadcastSaveConfirmed(room);
    } catch (error) {
      room.consecutiveSaveFailures++;
      console.error(`[WS] Failed to save document ${room.docId} (failure ${room.consecutiveSaveFailures}):`, error);
      if (room.consecutiveSaveFailures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
        console.error(
          `[WS] CRITICAL: document ${room.docId} has failed to save ${room.consecutiveSaveFailures} consecutive times`
        );
      }
    } finally {
      room.isSaving = false;
    }
  }

  private broadcastSaveConfirmed(room: DocumentRoom): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SAVE_CONFIRMED);
    encoding.writeVarString(encoder, new Date().toISOString());
    const message = encoding.toUint8Array(encoder);

    room.clients.forEach((_client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  /** Save every room with unsaved changes. Used on process shutdown so nothing is lost. */
  public async shutdown(): Promise<void> {
    console.log(`[WS] Shutting down — saving ${this.rooms.size} room(s)...`);
    clearInterval(this.periodicSaveInterval);

    const savePromises: Promise<void>[] = [];
    this.rooms.forEach((room) => {
      if (room.saveTimeout) {
        clearTimeout(room.saveTimeout);
        room.saveTimeout = null;
      }
      if (room.emptyRoomTimeout) {
        clearTimeout(room.emptyRoomTimeout);
        room.emptyRoomTimeout = null;
      }
      if (room.hasUnsavedChanges) {
        savePromises.push(this.saveDocument(room));
      }
    });

    await Promise.allSettled(savePromises);
    console.log('[WS] Shutdown save complete');
  }

  public close(): void {
    clearInterval(this.periodicSaveInterval);
    this.rooms.forEach((room) => {
      if (room.saveTimeout) clearTimeout(room.saveTimeout);
      if (room.emptyRoomTimeout) clearTimeout(room.emptyRoomTimeout);
      room.ydoc.destroy();
    });
    this.rooms.clear();
    this.wss.close();
  }
}
