import Redis from 'ioredis';
import { REDIS_KEY_PREFIX } from '../config/redis';

const ACTIVE_USERS_TTL_SECONDS = 120;

export interface TrackedActiveUser {
  userId: string;
  userName: string;
}

/**
 * Cross-server presence tracking via a Redis Hash per document: `active:<documentId>`, with one
 * field per `<serverId>:<userId>` connected anywhere in the cluster. Unlike the in-memory
 * Awareness state a single server holds for its own rooms, this is visible to every instance —
 * so the dashboard's "N editing" badge stays correct even when a document's editors are
 * connected to a different server instance than the one serving the list request.
 *
 * The hash carries a TTL (refreshed periodically by the caller) rather than being cleaned up
 * solely on disconnect, so a crashed server's entries still expire instead of lingering forever.
 * Every method degrades to a safe empty/zero result if Redis is unreachable — this is a
 * presence nicety, never a hard dependency for collaboration itself.
 */
export class RedisDocumentTracker {
  private redis: Redis;
  private serverId: string;

  constructor(redis: Redis, serverId: string) {
    this.redis = redis;
    this.serverId = serverId;
  }

  private key(documentId: string): string {
    return `active:${documentId}`;
  }

  private field(userId: string): string {
    return `${this.serverId}:${userId}`;
  }

  async addActiveUser(documentId: string, userId: string, userName: string): Promise<void> {
    try {
      const key = this.key(documentId);
      const value = JSON.stringify({ userId, userName, serverId: this.serverId, joinedAt: Date.now() });
      await this.redis.hset(key, this.field(userId), value);
      await this.redis.expire(key, ACTIVE_USERS_TTL_SECONDS);
    } catch (err) {
      console.error(`[Redis] addActiveUser failed for document ${documentId}:`, err);
    }
  }

  async removeActiveUser(documentId: string, userId: string): Promise<void> {
    try {
      await this.redis.hdel(this.key(documentId), this.field(userId));
    } catch (err) {
      console.error(`[Redis] removeActiveUser failed for document ${documentId}:`, err);
    }
  }

  /** Removes every field this server instance owns for a document — called when its local room is destroyed. */
  async removeAllServerUsers(documentId: string): Promise<void> {
    try {
      const key = this.key(documentId);
      const allFields = await this.redis.hkeys(key);
      const serverFields = allFields.filter((f) => f.startsWith(`${this.serverId}:`));
      if (serverFields.length > 0) {
        await this.redis.hdel(key, ...serverFields);
      }
    } catch (err) {
      console.error(`[Redis] removeAllServerUsers failed for document ${documentId}:`, err);
    }
  }

  async getActiveUserCount(documentId: string): Promise<number> {
    try {
      return await this.redis.hlen(this.key(documentId));
    } catch (err) {
      console.error(`[Redis] getActiveUserCount failed for document ${documentId}:`, err);
      return 0;
    }
  }

  /** Batch variant of getActiveUserCount for list views — one round trip per document, run in parallel. */
  async getActiveUserCounts(documentIds: string[]): Promise<Map<string, number>> {
    const counts = await Promise.all(
      documentIds.map(async (id) => [id, await this.getActiveUserCount(id)] as const)
    );
    return new Map(counts);
  }

  async getActiveUsers(documentId: string): Promise<TrackedActiveUser[]> {
    try {
      const allValues = await this.redis.hvals(this.key(documentId));
      return allValues.map((v) => {
        const parsed = JSON.parse(v) as { userId: string; userName: string };
        return { userId: parsed.userId, userName: parsed.userName };
      });
    } catch (err) {
      console.error(`[Redis] getActiveUsers failed for document ${documentId}:`, err);
      return [];
    }
  }

  /** Refreshes the hash's TTL — called periodically for every room still open on this server. */
  async refreshTTL(documentId: string): Promise<void> {
    try {
      await this.redis.expire(this.key(documentId), ACTIVE_USERS_TTL_SECONDS);
    } catch (err) {
      console.error(`[Redis] refreshTTL failed for document ${documentId}:`, err);
    }
  }

  /**
   * Removes every field this server instance owns across ALL documents — called on graceful
   * shutdown so a clean exit doesn't wait out the TTL before other instances see accurate counts.
   */
  async cleanupServer(): Promise<void> {
    try {
      let cursor = '0';
      do {
        // SCAN's MATCH pattern is not key-prefixed by ioredis's `keyPrefix` option (unlike
        // HSET/HDEL/etc., whose key argument it rewrites automatically), so it must be spelled
        // out here — and the keys it returns must have that same prefix stripped before being
        // passed back into hkeys/hdel, which will otherwise double-prefix them.
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${REDIS_KEY_PREFIX}active:*`, 'COUNT', 100);
        cursor = nextCursor;

        for (const rawKey of keys) {
          const key = rawKey.startsWith(REDIS_KEY_PREFIX) ? rawKey.slice(REDIS_KEY_PREFIX.length) : rawKey;
          const allFields = await this.redis.hkeys(key);
          const serverFields = allFields.filter((f) => f.startsWith(`${this.serverId}:`));
          if (serverFields.length > 0) {
            await this.redis.hdel(key, ...serverFields);
          }
        }
      } while (cursor !== '0');
    } catch (err) {
      console.error('[Redis] cleanupServer failed:', err);
    }
  }
}
