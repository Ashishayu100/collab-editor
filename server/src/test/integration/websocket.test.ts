import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { messageYjsSyncStep2, readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import * as Y from 'yjs';
import { prisma } from '../../config/database';
import { createTestUser, createTestDocument, addCollaborator } from '../helpers';
import { CollabWebSocketServer } from '../../websocket/WebSocketServer';
import { RedisPubSub } from '../../services/RedisPubSub';
import { RedisDocumentTracker } from '../../services/RedisDocumentTracker';
import { createRedisClient } from '../../config/redis';

// Mirrors the private MessageType enum in websocket/WebSocketServer.ts (not exported) and the
// identical copy in client/src/lib/WebSocketProvider.ts.
const MessageType = {
  SYNC: 0,
  AWARENESS: 1,
  SAVE_CONFIRMED: 2,
  PING: 3,
  DOCUMENT_RESTORED: 4,
  ROLE_UPDATED: 5,
  ACCESS_REVOKED: 6,
  COMMENT_EVENT: 7,
} as const;

async function waitUntil(check: () => boolean, timeoutMs = 8000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!check()) {
    throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
  }
}

/** Minimal Yjs-over-WebSocket client mimicking client/src/lib/WebSocketProvider.ts's protocol
 *  handling closely enough to exercise the real server, without any of its browser-only bits
 *  (reconnect, visibility, save-indicator state). */
class TestWsClient {
  ws: WebSocket;
  ydoc = new Y.Doc();
  awareness: Awareness;
  syncedOnce = false;
  lastPingEcho: Uint8Array | null = null;

  private openResolvers: Array<() => void> = [];
  private openRejecters: Array<(err: Error) => void> = [];
  private opened = false;
  private openError: Error | null = null;
  private requestedInitialSync = false;

  constructor(url: string) {
    this.awareness = new Awareness(this.ydoc);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.on('open', () => {
      this.opened = true;
      this.openResolvers.forEach((resolve) => resolve());
      this.openResolvers = [];
    });

    const fail = (err: Error) => {
      if (this.opened) return;
      this.openError = err;
      this.openRejecters.forEach((reject) => reject(err));
      this.openRejecters = [];
    };
    this.ws.on('unexpected-response', (_req, res) => fail(new Error(`unexpected-response: ${res.statusCode}`)));
    this.ws.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));

    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      if (this.ws.readyState !== WebSocket.OPEN) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.SYNC);
      writeUpdate(encoder, update);
      this.ws.send(encoding.toUint8Array(encoder));
    });

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === this) return;
        // Awareness's own internal timer renews the local clock every ~15s for as long as the
        // instance is alive (see y-protocols/awareness.js), independent of whether the socket
        // is still open — guard against sending on a closed/closing connection rather than
        // relying on every caller to destroy() this instance at exactly the right time.
        if (this.ws.readyState !== WebSocket.OPEN) return;
        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.AWARENESS);
        encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, changed));
        this.ws.send(encoding.toUint8Array(encoder));
      }
    );

    this.ws.on('message', (data: ArrayBuffer) => {
      // The server sends its own unprompted sync-step1 (plus an Awareness snapshot — the
      // y-protocols Awareness constructor always registers a `{}` local state for the room's
      // own Y.Doc clientID) immediately after accepting the connection, but only attaches its
      // own `message` listener a few statements later — so requesting our step1 eagerly, right
      // on 'open', can race ahead of that and get silently dropped over loopback. Requesting it
      // the moment we've received anything at all from the server sidesteps the race: by then
      // the server has necessarily already finished the async room setup that precedes it
      // wiring up its listener.
      if (!this.requestedInitialSync) {
        this.requestedInitialSync = true;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC);
        writeSyncStep1(encoder, this.ydoc);
        this.ws.send(encoding.toUint8Array(encoder));
      }

      const bytes = new Uint8Array(data);
      const decoder = decoding.createDecoder(bytes);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MessageType.SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MessageType.SYNC);
          const syncType = readSyncMessage(decoder, encoder, this.ydoc, this);
          if (encoding.length(encoder) > 1) {
            this.ws.send(encoding.toUint8Array(encoder));
          }
          if (syncType === messageYjsSyncStep2) {
            this.syncedOnce = true;
          }
          break;
        }
        case MessageType.AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          applyAwarenessUpdate(this.awareness, update, this);
          break;
        }
        case MessageType.PING: {
          this.lastPingEcho = bytes;
          break;
        }
        default:
          break;
      }
    });
  }

  waitForOpen(timeoutMs = 5000): Promise<void> {
    if (this.opened) return Promise.resolve();
    if (this.openError) return Promise.reject(this.openError);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('open timeout')), timeoutMs);
      this.openResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
      this.openRejecters.push((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  waitForInitialSync(timeoutMs = 5000): Promise<void> {
    return waitUntil(() => this.syncedOnce, timeoutMs);
  }

  /** Sends a raw SYNC/update frame directly, bypassing this client's own ydoc — used to simulate
   *  a stale/malicious client (e.g. a VIEWER) pushing an update it shouldn't be able to apply. */
  sendRawUpdate(update: Uint8Array): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SYNC);
    writeUpdate(encoder, update);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  sendPing(payload = 'ping'): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.PING);
    encoding.writeVarString(encoder, payload);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      // Awareness's internal setInterval (renewing the local clock every ~15s) otherwise
      // outlives the socket for the rest of the process — destroy() clears it and nulls the
      // local state, matching what a real client's teardown does on disconnect.
      this.awareness.destroy();
      this.ydoc.destroy();
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

let httpServer: HTTPServer;
let wsServer: CollabWebSocketServer;
let redisPubSub: RedisPubSub;
let documentTracker: RedisDocumentTracker;
let baseUrl: string;

beforeAll(async () => {
  httpServer = createServer();
  redisPubSub = new RedisPubSub();
  const redisClient = createRedisClient();
  documentTracker = new RedisDocumentTracker(redisClient, redisPubSub.getServerId());
  wsServer = new CollabWebSocketServer(httpServer, redisPubSub, documentTracker);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(async () => {
  wsServer.close();
  await redisPubSub.shutdown();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function wsUrl(documentId: string, token: string): string {
  return `${baseUrl}?documentId=${documentId}&token=${encodeURIComponent(token)}`;
}

describe('WebSocket connection auth', () => {
  it('rejects a connection with no token', async () => {
    const owner = await createTestUser();
    const doc = await createTestDocument(owner.id);

    const client = new TestWsClient(`${baseUrl}?documentId=${doc.id}`);
    await expect(client.waitForOpen()).rejects.toBeTruthy();
  });

  it('rejects a connection for a user with no access to the document', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const doc = await createTestDocument(owner.id);

    const client = new TestWsClient(wsUrl(doc.id, stranger.accessToken));
    await expect(client.waitForOpen()).rejects.toBeTruthy();
  });
});

describe('WebSocket sync', () => {
  it('a connecting client completes the initial Yjs sync handshake', async () => {
    const owner = await createTestUser();
    const doc = await createTestDocument(owner.id);

    const client = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    await client.waitForOpen();
    await client.waitForInitialSync();

    await client.close();
  });

  it('propagates a local edit from one client to another connected to the same document', async () => {
    const owner = await createTestUser();
    const editor = await createTestUser();
    const doc = await createTestDocument(owner.id);
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const clientA = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    const clientB = new TestWsClient(wsUrl(doc.id, editor.accessToken));
    await Promise.all([clientA.waitForOpen(), clientB.waitForOpen()]);
    await Promise.all([clientA.waitForInitialSync(), clientB.waitForInitialSync()]);

    clientA.ydoc.getText('content').insert(0, 'Hello from A');

    await waitUntil(() => clientB.ydoc.getText('content').toString() === 'Hello from A');
    expect(clientB.ydoc.getText('content').toString()).toBe('Hello from A');

    await Promise.all([clientA.close(), clientB.close()]);
  });
});

describe('WebSocket viewer read-only enforcement', () => {
  it("does not apply or broadcast a VIEWER's attempted edit", async () => {
    const owner = await createTestUser();
    const viewerUser = await createTestUser();
    const doc = await createTestDocument(owner.id);
    await addCollaborator(doc.id, viewerUser.id, 'VIEWER');

    const viewerClient = new TestWsClient(wsUrl(doc.id, viewerUser.accessToken));
    await viewerClient.waitForOpen();
    await viewerClient.waitForInitialSync();

    // Craft an update representing an edit and push it directly, simulating a VIEWER client
    // (modified or stale) trying to write despite the UI not offering an editable surface.
    const scratchDoc = new Y.Doc();
    scratchDoc.getText('content').insert(0, 'viewer should not be able to write this');
    viewerClient.sendRawUpdate(Y.encodeStateAsUpdate(scratchDoc));

    // Give the server a moment to (not) process it, then connect a fresh OWNER client and
    // confirm the room's actual content never picked up the viewer's edit.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const ownerClient = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    await ownerClient.waitForOpen();
    await ownerClient.waitForInitialSync();

    expect(ownerClient.ydoc.getText('content').toString()).toBe('');

    await Promise.all([viewerClient.close(), ownerClient.close()]);
  });
});

describe('WebSocket ping/pong', () => {
  it('echoes a ping message back verbatim', async () => {
    const owner = await createTestUser();
    const doc = await createTestDocument(owner.id);

    const client = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    await client.waitForOpen();
    await client.waitForInitialSync();

    client.sendPing('latency-probe');
    await waitUntil(() => client.lastPingEcho !== null);

    const decoder = decoding.createDecoder(client.lastPingEcho!);
    expect(decoding.readVarUint(decoder)).toBe(MessageType.PING);
    expect(decoding.readVarString(decoder)).toBe('latency-probe');

    await client.close();
  });
});

describe('WebSocket awareness', () => {
  it("broadcasts one client's awareness state to another", async () => {
    const owner = await createTestUser();
    const editor = await createTestUser();
    const doc = await createTestDocument(owner.id);
    await addCollaborator(doc.id, editor.id, 'EDITOR');

    const clientA = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    const clientB = new TestWsClient(wsUrl(doc.id, editor.accessToken));
    await Promise.all([clientA.waitForOpen(), clientB.waitForOpen()]);
    await Promise.all([clientA.waitForInitialSync(), clientB.waitForInitialSync()]);

    clientA.awareness.setLocalStateField('user', { name: 'Owner Cursor', color: '#ff0000' });

    await waitUntil(() => clientB.awareness.getStates().get(clientA.awareness.clientID)?.user !== undefined);

    const seenState = clientB.awareness.getStates().get(clientA.awareness.clientID) as {
      user: { name: string; color: string };
    };
    expect(seenState.user.name).toBe('Owner Cursor');

    await Promise.all([clientA.close(), clientB.close()]);
  });
});

describe('WebSocket persistence', () => {
  it('saves the document to Postgres once the room becomes empty after an edit', async () => {
    const owner = await createTestUser();
    const doc = await createTestDocument(owner.id);

    const client = new TestWsClient(wsUrl(doc.id, owner.accessToken));
    await client.waitForOpen();
    await client.waitForInitialSync();

    client.ydoc.getText('content').insert(0, 'persisted via websocket');
    // Let the update actually leave the client and get applied server-side before disconnecting
    // — otherwise the room may still be empty-handed when handleDisconnect's immediate save fires.
    await new Promise((resolve) => setTimeout(resolve, 500));

    await client.close();

    let persisted = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !persisted) {
      const row = await prisma.document.findUnique({ where: { id: doc.id }, select: { content: true } });
      if (row?.content) {
        const check = new Y.Doc();
        Y.applyUpdate(check, new Uint8Array(row.content));
        if (check.getText('content').toString() === 'persisted via websocket') {
          persisted = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(persisted).toBe(true);
  });
});
