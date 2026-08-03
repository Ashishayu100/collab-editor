import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { messageYjsSyncStep2, readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import * as Y from 'yjs';
import { getUserColor } from './colors';

// Message type registry (shared with server/src/websocket/WebSocketServer.ts):
//   0 = Yjs sync (sync step 1 / sync step 2 / update, per y-protocols/sync)
//   1 = awareness (cursors, presence, "typing" flag)
//   2 = save-confirmed (server -> client only, sent after a debounced/periodic DB save)
//   3 = ping/pong (latency probe, echoed verbatim by the server)
//   4 = document-restored (server -> client only, sent after a version restore completes)
//   5 = role-updated (server -> client only, sent when the caller's role on this doc changes)
//   6 = access-revoked (server -> client only, sent when the caller loses access entirely)
//   7 = comment-event (server -> client only, sent after a comment REST mutation, JSON payload)
enum MessageType {
  SYNC = 0,
  AWARENESS = 1,
  SAVE_CONFIRMED = 2,
  PING = 3,
  DOCUMENT_RESTORED = 4,
  ROLE_UPDATED = 5,
  ACCESS_REVOKED = 6,
  COMMENT_EVENT = 7,
}

export interface DocumentRestoredEvent {
  versionNum: number;
  restoredBy: string;
  label: string | null;
}

export type DocumentRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export type CommentEventType =
  | 'comment:created'
  | 'comment:replied'
  | 'comment:edited'
  | 'comment:deleted'
  | 'comment:resolved'
  | 'comment:unresolved';

export interface CommentEvent {
  type: CommentEventType;
  comment?: unknown;
  commentId?: string;
  parentId?: string;
}

export enum ConnectionStatus {
  /** WebSocket handshake in progress (first connection attempt). */
  CONNECTING = 'connecting',
  /** WebSocket open, Yjs sync handshake in progress. */
  SYNCING = 'syncing',
  /** WebSocket open and Yjs sync step 2 received — fully caught up with the server. */
  CONNECTED = 'connected',
  /** Clean disconnect, or the initial state before the first connection attempt. */
  DISCONNECTED = 'disconnected',
  /** Attempting to reconnect after an unexpected drop, with exponential backoff. */
  RECONNECTING = 'reconnecting',
  /** navigator.onLine is false, or reconnect attempts were exhausted while offline. */
  OFFLINE = 'offline',
  /** Unrecoverable — e.g. no auth token available. Requires a manual retry or re-login. */
  FAILED = 'failed',
}

export interface WebSocketProviderStats {
  messagesSent: number;
  messagesReceived: number;
  reconnectAttempts: number;
  lastMessageAt: Date | null;
}

export interface SaveIndicatorState {
  /** True from the moment a local edit is sent until the server confirms it's persisted. */
  pending: boolean;
  lastSavedAt: Date | null;
  /** Local doc updates seen since the last save-confirmed — a proxy for "unsynced edit count". */
  pendingCount: number;
}

export interface WebSocketProviderOptions {
  ydoc: Y.Doc;
  documentId: string;
  getToken: () => string;
  /** Shared with the TipTap CollaborationCaret extension so cursors/selections use the same instance. */
  awareness: Awareness;
  userId: string;
  userName: string;
}

const PING_INTERVAL_VISIBLE_MS = 30000;
const PING_INTERVAL_HIDDEN_MS = 120000;
const SYNC_WATCHDOG_MS = 10000;
const STALE_TAB_THRESHOLD_MS = 30 * 60 * 1000;

export class WebSocketProvider {
  private ws: WebSocket | null = null;
  private ydoc: Y.Doc;
  private documentId: string;
  private getToken: () => string;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private statsListeners: Set<(stats: WebSocketProviderStats) => void> = new Set();
  private latencyListeners: Set<(latencyMs: number) => void> = new Set();
  private offlineEditsSyncedListeners: Set<() => void> = new Set();
  private staleTabListeners: Set<() => void> = new Set();
  private documentRestoredListeners: Set<(event: DocumentRestoredEvent) => void> = new Set();
  private roleUpdatedListeners: Set<(role: DocumentRole) => void> = new Set();
  private accessRevokedListeners: Set<() => void> = new Set();
  private commentEventListeners: Set<(event: CommentEvent) => void> = new Set();
  private _status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private destroyed = false;

  private messagesSent = 0;
  private messagesReceived = 0;
  private lastMessageAt: Date | null = null;

  private saveStateListeners: Set<(state: SaveIndicatorState) => void> = new Set();
  private saveIndicatorState: SaveIndicatorState = { pending: false, lastSavedAt: null, pendingCount: 0 };

  /** Set on any local doc update received while not CONNECTED; cleared (and reported) once we resync. */
  private hadOfflineEdits = false;

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private syncWatchdogTimeout: ReturnType<typeof setTimeout> | null = null;
  private _latency: number | null = null;

  /** While the tab is hidden we stop broadcasting our own awareness changes (cursor position etc). */
  private awarenessPaused = false;
  private hiddenSince: number | null = null;

  /** Public so the TipTap CollaborationCaret extension (which expects `provider.awareness`) can read it. */
  public readonly awareness: Awareness;

  constructor(options: WebSocketProviderOptions) {
    this.ydoc = options.ydoc;
    this.documentId = options.documentId;
    this.getToken = options.getToken;
    this.awareness = options.awareness;

    const { color, colorLight } = getUserColor(options.userId);
    // Awareness.setLocalStateField() silently no-ops if the local state is currently null —
    // which it will be if a previous provider on this same Awareness instance called
    // destroy() (e.g. React StrictMode's mount->cleanup->mount). setLocalState() sets the
    // base state unconditionally, so our identity is always established.
    this.awareness.setLocalState({
      ...(this.awareness.getLocalState() ?? {}),
      user: { name: options.userName, color, colorLight },
    });

    this.ydoc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.connect();
  }

  private buildUrl(token: string): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    return `${wsProtocol}//${wsHost}/ws?documentId=${this.documentId}&token=${encodeURIComponent(token)}`;
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status === status) return;
    this._status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get stats(): WebSocketProviderStats {
    return {
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt,
    };
  }

  get latency(): number | null {
    return this._latency;
  }

  /** Whether the local Y.Doc has edits the server hasn't confirmed persisting yet. */
  get hasPendingChanges(): boolean {
    return this.saveIndicatorState.pendingCount > 0;
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onStatsChange(listener: (stats: WebSocketProviderStats) => void): () => void {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  onLatencyChange(listener: (latencyMs: number) => void): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  /** Fires once, right after reconnecting, if the local doc had edits made while disconnected. */
  onOfflineEditsSynced(listener: () => void): () => void {
    this.offlineEditsSyncedListeners.add(listener);
    return () => this.offlineEditsSyncedListeners.delete(listener);
  }

  /** Fires when the tab becomes visible after being hidden & disconnected for a long stretch. */
  onStaleTab(listener: () => void): () => void {
    this.staleTabListeners.add(listener);
    return () => this.staleTabListeners.delete(listener);
  }

  /** Fires whenever the server reports this document was restored to an earlier version. */
  onDocumentRestored(listener: (event: DocumentRestoredEvent) => void): () => void {
    this.documentRestoredListeners.add(listener);
    return () => this.documentRestoredListeners.delete(listener);
  }

  /** Fires when the owner changes this connection's role on the document (e.g. Editor -> Viewer). */
  onRoleUpdated(listener: (role: DocumentRole) => void): () => void {
    this.roleUpdatedListeners.add(listener);
    return () => this.roleUpdatedListeners.delete(listener);
  }

  /** Fires when this connection's access to the document is revoked entirely (e.g. removed as a collaborator). */
  onAccessRevoked(listener: () => void): () => void {
    this.accessRevokedListeners.add(listener);
    return () => this.accessRevokedListeners.delete(listener);
  }

  /** Fires whenever a comment is created/replied/edited/deleted/resolved/unresolved on this document. */
  onCommentEvent(listener: (event: CommentEvent) => void): () => void {
    this.commentEventListeners.add(listener);
    return () => this.commentEventListeners.delete(listener);
  }

  private emitStats() {
    this.statsListeners.forEach((listener) => listener(this.stats));
  }

  get saveState(): SaveIndicatorState {
    return this.saveIndicatorState;
  }

  onSaveStateChange(listener: (state: SaveIndicatorState) => void): () => void {
    this.saveStateListeners.add(listener);
    return () => this.saveStateListeners.delete(listener);
  }

  private setSaveState(state: SaveIndicatorState) {
    this.saveIndicatorState = state;
    this.saveStateListeners.forEach((listener) => listener(state));
  }

  private connect() {
    if (this.destroyed) return;

    if (!navigator.onLine) {
      this.setStatus(ConnectionStatus.OFFLINE);
      return;
    }

    const token = this.getToken();
    if (!token) {
      console.error('[WS Provider] No auth token available — cannot connect');
      this.setStatus(ConnectionStatus.FAILED);
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? ConnectionStatus.RECONNECTING : ConnectionStatus.CONNECTING);

    try {
      const ws = new WebSocket(this.buildUrl(token));
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.setStatus(ConnectionStatus.SYNCING);
        this.startSyncWatchdog();
        this.startPing();
        console.log(`[WS Provider] Connected to document ${this.documentId}`);

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC);
        writeSyncStep1(encoder, this.ydoc);
        this.send(encoding.toUint8Array(encoder));

        // Re-announce our presence: on a fresh reconnect the server (and any other clients)
        // may have no record of our awareness clientId even though our local state is unchanged.
        if (this.awareness.getLocalState() !== null) {
          this.sendAwarenessUpdate([this.awareness.clientID]);
        }
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        this.messagesReceived++;
        this.lastMessageAt = new Date();
        this.emitStats();
        this.handleServerMessage(data);
      };

      ws.onclose = (event) => {
        this.connected = false;
        this.ws = null;
        this.stopPing();
        this.clearSyncWatchdog();
        console.log(`[WS Provider] Disconnected (code: ${event.code})`);

        if (!this.destroyed) {
          this.setStatus(ConnectionStatus.DISCONNECTED);
          this.scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('[WS Provider] Error:', error);
      };
    } catch (error) {
      console.error('[WS Provider] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  private send(data: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(data as unknown as ArrayBuffer);
    this.messagesSent++;
    this.emitStats();
  }

  private sendAwarenessUpdate(clientIds: number[]) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.AWARENESS);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, clientIds));
    this.send(encoding.toUint8Array(encoder));
  }

  private handleServerMessage(data: Uint8Array) {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MessageType.SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC);

        const syncMessageType = readSyncMessage(decoder, encoder, this.ydoc, this);

        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }

        if (syncMessageType === messageYjsSyncStep2) {
          this.clearSyncWatchdog();
          if (this._status === ConnectionStatus.SYNCING) {
            this.setStatus(ConnectionStatus.CONNECTED);
          }
          if (this.hadOfflineEdits) {
            this.hadOfflineEdits = false;
            this.offlineEditsSyncedListeners.forEach((listener) => listener());
          }
        }
        break;
      }
      case MessageType.AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        applyAwarenessUpdate(this.awareness, update, this);
        break;
      }
      case MessageType.SAVE_CONFIRMED: {
        const timestamp = decoding.readVarString(decoder);
        this.setSaveState({ pending: false, lastSavedAt: new Date(timestamp), pendingCount: 0 });
        break;
      }
      case MessageType.PING: {
        const sentAt = decoding.readFloat64(decoder);
        this._latency = Date.now() - sentAt;
        this.latencyListeners.forEach((listener) => listener(this._latency!));
        break;
      }
      case MessageType.DOCUMENT_RESTORED: {
        const versionNum = decoding.readVarUint(decoder);
        const restoredBy = decoding.readVarString(decoder);
        const label = decoding.readVarString(decoder);
        const event: DocumentRestoredEvent = { versionNum, restoredBy, label: label || null };
        this.documentRestoredListeners.forEach((listener) => listener(event));
        break;
      }
      case MessageType.ROLE_UPDATED: {
        const role = decoding.readVarString(decoder) as DocumentRole;
        this.roleUpdatedListeners.forEach((listener) => listener(role));
        break;
      }
      case MessageType.ACCESS_REVOKED: {
        this.accessRevokedListeners.forEach((listener) => listener());
        break;
      }
      case MessageType.COMMENT_EVENT: {
        const raw = decoding.readVarString(decoder);
        try {
          const event = JSON.parse(raw) as CommentEvent;
          this.commentEventListeners.forEach((listener) => listener(event));
        } catch (error) {
          console.error('[WS Provider] Failed to parse comment event:', error);
        }
        break;
      }
      default:
        break;
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SYNC);
    writeUpdate(encoder, update);
    this.send(encoding.toUint8Array(encoder));

    if (this._status !== ConnectionStatus.CONNECTED) {
      this.hadOfflineEdits = true;
    }

    this.setSaveState({
      ...this.saveIndicatorState,
      pending: true,
      pendingCount: this.saveIndicatorState.pendingCount + 1,
    });
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    // Skip changes we just applied ourselves from an incoming server message — no need to echo them back.
    if (origin === this) return;
    // Skip broadcasting our own state while the tab is hidden — nobody is looking at our cursor anyway.
    if (this.awarenessPaused) return;

    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;
    this.sendAwarenessUpdate(changedClients);
  };

  private startSyncWatchdog() {
    this.clearSyncWatchdog();
    this.syncWatchdogTimeout = setTimeout(() => {
      if (this._status === ConnectionStatus.SYNCING) {
        console.warn(
          `[WS Provider] No sync step 2 received within ${SYNC_WATCHDOG_MS}ms of reconnect for document ${this.documentId} — connection may still work for incremental updates`
        );
      }
    }, SYNC_WATCHDOG_MS);
  }

  private clearSyncWatchdog() {
    if (this.syncWatchdogTimeout) {
      clearTimeout(this.syncWatchdogTimeout);
      this.syncWatchdogTimeout = null;
    }
  }

  private startPing() {
    this.stopPing();
    const intervalMs = document.hidden ? PING_INTERVAL_HIDDEN_MS : PING_INTERVAL_VISIBLE_MS;
    this.pingInterval = setInterval(() => this.sendPing(), intervalMs);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendPing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.PING);
    encoding.writeFloat64(encoder, Date.now());
    this.send(encoding.toUint8Array(encoder));
  }

  private handleOnline = () => {
    console.log('[WS Provider] Browser reports online');

    // The 'offline' event forces status to OFFLINE defensively, but the underlying socket
    // may never have actually dropped (browsers can fire online/offline based on OS-level
    // network interface changes that don't sever an already-established connection). If it's
    // still open, just restore the status instead of opening a second, duplicate connection —
    // but still report any edits made during the "offline" window as synced, since this is
    // the only code path that recovers CONNECTED status in that scenario (no fresh sync step
    // 2 arrives to trigger the usual check, because we never actually reconnected).
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.setStatus(ConnectionStatus.CONNECTED);
      if (this.hadOfflineEdits) {
        this.hadOfflineEdits = false;
        this.offlineEditsSyncedListeners.forEach((listener) => listener());
      }
      return;
    }

    if (
      this._status === ConnectionStatus.OFFLINE ||
      this._status === ConnectionStatus.RECONNECTING ||
      this._status === ConnectionStatus.FAILED ||
      this._status === ConnectionStatus.DISCONNECTED
    ) {
      this.retryConnection();
    }
  };

  private handleOffline = () => {
    console.log('[WS Provider] Browser reports offline');
    // Don't close the WebSocket — it may still work on some networks (captive portals,
    // flaky detection). Just stop burning retries and reflect the state honestly.
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.setStatus(ConnectionStatus.OFFLINE);
  };

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.hiddenSince = Date.now();
      this.awarenessPaused = true;
      this.startPing(); // restart at the slower, hidden-tab cadence
    } else {
      const wasHiddenSince = this.hiddenSince;
      this.hiddenSince = null;
      this.awarenessPaused = false;
      this.startPing(); // restart at the normal cadence

      // Re-announce our current state immediately now that someone might be looking again.
      if (this.awareness.getLocalState() !== null) {
        this.sendAwarenessUpdate([this.awareness.clientID]);
      }

      const wasStaleOffline =
        wasHiddenSince !== null &&
        Date.now() - wasHiddenSince > STALE_TAB_THRESHOLD_MS &&
        this._status !== ConnectionStatus.CONNECTED;

      if (wasStaleOffline) {
        this.staleTabListeners.forEach((listener) => listener());
        this.retryConnection();
      }
    }
  };

  private scheduleReconnect() {
    if (this.destroyed) return;

    if (!navigator.onLine) {
      this.setStatus(ConnectionStatus.OFFLINE);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS Provider] Max reconnection attempts reached');
      this.setStatus(ConnectionStatus.FAILED);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.setStatus(ConnectionStatus.RECONNECTING);
    this.emitStats();

    console.log(`[WS Provider] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /** Reset reconnect attempts and try again immediately (e.g. user clicked "Retry connection"). */
  retryConnection() {
    if (this.destroyed) return;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  destroy() {
    this.destroyed = true;
    this.ydoc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.setLocalState(null);

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.stopPing();
    this.clearSyncWatchdog();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.statusListeners.clear();
    this.statsListeners.clear();
    this.saveStateListeners.clear();
    this.latencyListeners.clear();
    this.offlineEditsSyncedListeners.clear();
    this.staleTabListeners.clear();
    this.documentRestoredListeners.clear();
    this.roleUpdatedListeners.clear();
    this.accessRevokedListeners.clear();
    this.commentEventListeners.clear();
    this.connected = false;
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }
}
