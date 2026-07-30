import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import * as Y from 'yjs';
import { getUserColor } from './colors';

enum MessageType {
  SYNC = 0,
  AWARENESS = 1,
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface WebSocketProviderStats {
  messagesSent: number;
  messagesReceived: number;
  reconnectAttempts: number;
  lastMessageAt: Date | null;
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
  private _status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private destroyed = false;

  private messagesSent = 0;
  private messagesReceived = 0;
  private lastMessageAt: Date | null = null;

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

    this.connect();
  }

  private buildUrl(): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const token = this.getToken();
    return `${wsProtocol}//${wsHost}/ws?documentId=${this.documentId}&token=${encodeURIComponent(token)}`;
  }

  private setStatus(status: ConnectionStatus) {
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

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onStatsChange(listener: (stats: WebSocketProviderStats) => void): () => void {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  private emitStats() {
    this.statsListeners.forEach((listener) => listener(this.stats));
  }

  private connect() {
    if (this.destroyed) return;

    this.setStatus(ConnectionStatus.CONNECTING);

    try {
      const ws = new WebSocket(this.buildUrl());
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.setStatus(ConnectionStatus.CONNECTED);
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
        console.log(`[WS Provider] Disconnected (code: ${event.code})`);

        if (!this.destroyed) {
          this.setStatus(ConnectionStatus.DISCONNECTED);
          this.scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('[WS Provider] Error:', error);
        this.setStatus(ConnectionStatus.ERROR);
      };
    } catch (error) {
      console.error('[WS Provider] Connection failed:', error);
      this.setStatus(ConnectionStatus.ERROR);
      this.scheduleReconnect();
    }
  }

  private send(data: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(data);
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

        readSyncMessage(decoder, encoder, this.ydoc, this);

        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MessageType.AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        applyAwarenessUpdate(this.awareness, update, this);
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
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    // Skip changes we just applied ourselves from an incoming server message — no need to echo them back.
    if (origin === this) return;

    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;
    this.sendAwarenessUpdate(changedClients);
  };

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WS Provider] Max reconnection attempts reached');
        this.setStatus(ConnectionStatus.ERROR);
      }
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
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

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.statusListeners.clear();
    this.statsListeners.clear();
    this.connected = false;
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }
}
