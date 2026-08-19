import rateLimit, { ipKeyGenerator, RateLimitRequestHandler } from 'express-rate-limit';
import { Request } from 'express';
import RedisStore, { RedisReply } from 'rate-limit-redis';
import { env } from '../config/env';
import { createRateLimitRedisClient } from '../config/redis';

// A dedicated connection for the rate-limit counters — kept separate from the pub/sub and
// presence-tracking clients (see config/redis.ts) so a burst of INCR traffic here can never
// interfere with, or be starved by, those.
const redisClient = createRateLimitRedisClient();

/** express-rate-limit forbids reusing one Store instance across multiple limiters (it tracks
 *  per-store state internally) — each limiter below gets its own RedisStore, distinguished by
 *  prefix, all sharing the one underlying connection above. */
function makeStore(name: string): RedisStore {
  return new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as Promise<RedisReply>,
    prefix: `ratelimit:${name}:`,
  });
}

/** IP-based key for routes with no authenticated user yet (signup/login/refresh). */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/** Per-user key where the caller is already authenticated (requireAuth ran first), falling back
 *  to IP for the rare case a route applies this before auth resolves. */
function userOrIpKey(req: Request): string {
  return req.user?.userId ?? ipKeyGenerator(req.ip ?? 'unknown');
}

const sharedOptions = {
  standardHeaders: true as const,
  legacyHeaders: false,
  // Redis is a scaling nicety here too — if it's unreachable, fail OPEN (let the request
  // through) rather than 500ing every API call or blocking on a hung store call.
  passOnStoreError: true,
  // Load-test runs come from one IP and would otherwise be rejected by the auth limiter within
  // seconds, measuring the limiter instead of the app. See LOAD_TEST_MODE in config/env.ts.
  skip: () => env.LOAD_TEST_MODE,
};

/** General API guard: 100 requests/minute per user (or IP pre-auth). Applied to all of /api/. */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  ...sharedOptions,
  store: makeStore('general'),
  windowMs: 60 * 1000,
  limit: 100,
  message: { error: 'Too many requests. Please try again later.', retryAfter: 60 },
  keyGenerator: userOrIpKey,
});

/** Brute-force guard on login/signup/refresh: 10 attempts/15min per IP. */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  ...sharedOptions,
  store: makeStore('auth'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.', retryAfter: 900 },
  keyGenerator: ipKey,
});

/** Document-creation spam guard: 20 documents/hour per user. */
export const documentCreateLimiter: RateLimitRequestHandler = rateLimit({
  ...sharedOptions,
  store: makeStore('doc-create'),
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: 'Document creation limit reached. Try again later.', retryAfter: 3600 },
  keyGenerator: userOrIpKey,
});

/** Export guard: PDF export runs headless Chromium (puppeteer) per request — expensive enough
 *  to cap independent of the general limiter. 10 exports/10min per user. */
export const exportLimiter: RateLimitRequestHandler = rateLimit({
  ...sharedOptions,
  store: makeStore('export'),
  windowMs: 10 * 60 * 1000,
  limit: 10,
  message: { error: 'Export limit reached. Please wait before exporting again.', retryAfter: 600 },
  keyGenerator: userOrIpKey,
});

/** Comment-spam guard: 30 comments (or replies)/minute per user. */
export const commentLimiter: RateLimitRequestHandler = rateLimit({
  ...sharedOptions,
  store: makeStore('comment'),
  windowMs: 60 * 1000,
  limit: 30,
  message: { error: 'Too many comments. Slow down.', retryAfter: 60 },
  keyGenerator: userOrIpKey,
});
