import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

export const REDIS_KEY_PREFIX = 'collab:';

// Retries forever, capped at 5s between attempts — Redis here is a scaling/presence nicety (see
// RedisPubSub/RedisDocumentTracker's graceful degradation), so a long outage must never turn
// into a *permanent* disconnect: an operator restarting Redis has to see every client reconnect
// on its own, however long it was down for, without a process restart.
function retryStrategy(times: number): number {
  const delay = Math.min(times * 100, 5000);
  if (times === 1 || times % 10 === 0) {
    console.log(`[Redis] reconnecting in ${delay}ms (attempt ${times})`);
  }
  return delay;
}

const baseConfig: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  keyPrefix: REDIS_KEY_PREFIX,
  retryStrategy,
};

// ioredis requires a client in subscriber mode to be dedicated to subscribing — it can't issue
// other commands — so publish and subscribe each need their own connection.
export function createRedisSubscriber(): Redis {
  const client = new Redis({
    ...baseConfig,
    // Required for pub/sub: a subscribe()/unsubscribe() issued while reconnecting must queue and
    // resend once the connection is back, not reject — RedisPubSub's own `isConnected` check
    // (not this) is what keeps callers from invoking it in the first place during an outage.
    maxRetriesPerRequest: null,
  });
  client.on('connect', () => console.log('[Redis] subscriber connected'));
  client.on('error', (err) => console.error('[Redis] subscriber error:', err.message));
  return client;
}

// The publisher and general-purpose client are command-oriented (publish/ping/hset/...), where a
// hung promise is worse than a fast failure — RedisPubSub/RedisDocumentTracker are built to
// degrade gracefully on a rejected command, not to wait out however long Redis stays down.
const commandConfig: RedisOptions = {
  ...baseConfig,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
};

export function createRedisPublisher(): Redis {
  const client = new Redis(commandConfig);
  client.on('connect', () => console.log('[Redis] publisher connected'));
  client.on('error', (err) => console.error('[Redis] publisher error:', err.message));
  return client;
}

/** General-purpose client for key-value operations (e.g. RedisDocumentTracker). */
export function createRedisClient(): Redis {
  const client = new Redis(commandConfig);
  client.on('connect', () => console.log('[Redis] client connected'));
  client.on('error', (err) => console.error('[Redis] client error:', err.message));
  return client;
}

/**
 * Client for the rate-limit counters (see middleware/rateLimiter.ts). Deliberately keeps the
 * default offline queue (unlike `commandConfig` above): rate-limit-redis loads its Lua scripts
 * via `store.init()` the instant each limiter is constructed, at module-load time — before this
 * client's connection handshake has necessarily finished. With `enableOfflineQueue: false` that
 * first script-load command rejects immediately (the socket isn't open yet), and since
 * `RedisStore` caches that rejected promise forever, every rate-limit check for the rest of the
 * process's life would then hit the same cached failure — silently disabling rate limiting
 * entirely, even long after Redis is fully connected. Queueing that first command instead (the
 * default) lets it wait the few milliseconds for the handshake and succeed normally.
 * `maxRetriesPerRequest` stays low so a *genuine* live outage still fails fast, same as elsewhere.
 */
export function createRateLimitRedisClient(): Redis {
  const client = new Redis({ ...baseConfig, maxRetriesPerRequest: 1 });
  client.on('connect', () => console.log('[Redis] rate-limit client connected'));
  client.on('error', (err) => console.error('[Redis] rate-limit client error:', err.message));
  return client;
}
