import Redis from 'ioredis';
import { createRedisPublisher, createRedisSubscriber } from '../config/redis';
import { CommentEvent } from '../types/comment';

/**
 * Message categories that flow through Redis pub/sub. These are distinct from the WebSocket
 * binary message-type registry (see MessageType in websocket/WebSocketServer.ts) — Redis
 * messages are JSON, and binary Yjs/awareness payloads are base64-encoded within them.
 */
export type RedisMessageType = 'yjs-sync' | 'yjs-awareness' | 'comment-event';

export interface RedisMessage {
  /** Which server instance originated this message — lets every instance skip its own echo. */
  serverId: string;
  documentId: string;
  type: RedisMessageType;
  /**
   * - yjs-sync / yjs-awareness: base64-encoded Yjs/awareness update bytes.
   * - comment-event: JSON-stringified CommentEvent.
   */
  payload: string;
  timestamp: number;
}

export type RedisMessageHandler = (message: RedisMessage) => void;

/**
 * Cross-server message bus for the WebSocket layer. Each server instance publishes local Yjs
 * updates, awareness updates, and comment events to a per-document Redis channel; every other
 * instance subscribed to that channel replays them into its own local room. This is what lets
 * multiple server processes serve the same document room without clients needing to share a
 * single process/connection.
 *
 * Deliberately degrades to a no-op when Redis is unreachable — single-instance collaboration
 * must keep working even with no Redis at all (see `isConnected`).
 */
export class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;
  private serverId: string;
  private channelHandlers: Map<string, RedisMessageHandler> = new Map();
  private isShuttingDown = false;

  constructor() {
    this.serverId = `server-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.publisher = createRedisPublisher();
    this.subscriber = createRedisSubscriber();

    this.subscriber.on('message', (channel: string, rawMessage: string) => {
      if (this.isShuttingDown) return;

      try {
        const message = JSON.parse(rawMessage) as RedisMessage;

        // Skip messages this exact server instance published — every other instance's
        // subscriber will still see it, but this one already applied the change locally.
        if (message.serverId === this.serverId) return;

        const handler = this.channelHandlers.get(channel);
        handler?.(message);
      } catch (err) {
        console.error(`[Redis] failed to parse message on channel ${channel}:`, err);
      }
    });

    // ioredis reconnects its own socket automatically, but a fresh connection starts with no
    // subscriptions — replay whatever channels rooms had registered before the outage so
    // cross-server sync resumes without waiting for every room to be recreated.
    this.subscriber.on('ready', () => {
      const channels = Array.from(this.channelHandlers.keys());
      if (channels.length === 0) return;
      this.subscriber
        .subscribe(...channels)
        .then(() => console.log(`[Redis] resubscribed to ${channels.length} channel(s) after reconnect`))
        .catch((err) => console.error('[Redis] failed to resubscribe after reconnect:', err));
    });

    console.log(`[Redis] RedisPubSub initialized with serverId: ${this.serverId}`);
  }

  /** Redis is a performance/scaling enhancement, not a hard dependency — treat anything short
   *  of both connections being ready as "unavailable" and silently no-op public methods. */
  private get isConnected(): boolean {
    return this.publisher.status === 'ready' && this.subscriber.status === 'ready' && !this.isShuttingDown;
  }

  private getChannelName(documentId: string): string {
    return `doc:${documentId}`;
  }

  /** Subscribes to updates for a document room — called when the first local client joins. */
  async subscribe(documentId: string, handler: RedisMessageHandler): Promise<void> {
    const channel = this.getChannelName(documentId);
    this.channelHandlers.set(channel, handler);

    if (!this.isConnected) return;

    try {
      await this.subscriber.subscribe(channel);
      console.log(`[Redis] subscribed to channel ${channel}`);
    } catch (err) {
      console.error(`[Redis] failed to subscribe to channel ${channel}:`, err);
    }
  }

  /** Unsubscribes from a document room — called when the last local client leaves. */
  async unsubscribe(documentId: string): Promise<void> {
    const channel = this.getChannelName(documentId);
    if (!this.channelHandlers.has(channel)) return;
    this.channelHandlers.delete(channel);

    if (!this.isConnected) return;

    try {
      await this.subscriber.unsubscribe(channel);
      console.log(`[Redis] unsubscribed from channel ${channel}`);
    } catch (err) {
      console.error(`[Redis] failed to unsubscribe from channel ${channel}:`, err);
    }
  }

  private async publish(documentId: string, type: RedisMessageType, payload: string): Promise<void> {
    if (!this.isConnected) return;

    const channel = this.getChannelName(documentId);
    const message: RedisMessage = {
      serverId: this.serverId,
      documentId,
      type,
      payload,
      timestamp: Date.now(),
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      console.error(`[Redis] publish failed on channel ${channel}:`, err);
    }
  }

  async publishYjsSync(documentId: string, update: Uint8Array): Promise<void> {
    await this.publish(documentId, 'yjs-sync', Buffer.from(update).toString('base64'));
  }

  async publishAwareness(documentId: string, update: Uint8Array): Promise<void> {
    await this.publish(documentId, 'yjs-awareness', Buffer.from(update).toString('base64'));
  }

  async publishCommentEvent(documentId: string, event: CommentEvent): Promise<void> {
    await this.publish(documentId, 'comment-event', JSON.stringify(event));
  }

  getServerId(): string {
    return this.serverId;
  }

  async healthCheck(): Promise<boolean> {
    try {
      return (await this.publisher.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    console.log('[Redis] RedisPubSub shutting down...');

    try {
      const channels = Array.from(this.channelHandlers.keys());
      if (channels.length > 0 && this.subscriber.status === 'ready') {
        await this.subscriber.unsubscribe(...channels);
      }
    } catch (err) {
      console.error('[Redis] error unsubscribing during shutdown:', err);
    }
    this.channelHandlers.clear();

    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
    console.log('[Redis] RedisPubSub shutdown complete');
  }
}
