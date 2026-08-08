import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Route-level rate limiters are backed by a real Redis connection constructed at import time
// (see middleware/rateLimiter.ts) and are keyed per-IP/per-user with production-sized windows
// (e.g. 10 auth attempts/15min) — real limits that integration tests would blow through in a
// handful of requests. Replacing the module with pass-through middleware avoids both the
// unrelated Redis dependency and cross-test rate-limit bleed-through; rate-limiting behavior
// itself is not what these tests are validating. (vi.mock calls are hoisted above every import
// in this file by Vitest's transform, so this must stay self-contained — it can't reference
// anything declared below.)
vi.mock('../middleware/rateLimiter', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void): void => next();
  return {
    generalLimiter: passthrough,
    authLimiter: passthrough,
    documentCreateLimiter: passthrough,
    exportLimiter: passthrough,
    commentLimiter: passthrough,
  };
});

// Must run before anything imports `config/env.ts` (which reads these once, at import time via
// zod) — dotenv.config() there never overrides variables already present in process.env, so
// setting them here first is what makes the whole app point at the test database/secrets. Since
// `import` declarations are hoisted above ordinary statements in ES modules, this has to happen
// in its own step, before the `config/database` import below, rather than relying on textual
// order alone.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/collab_test') ||
  'postgresql://collab_user:collab_pass@localhost:5432/collab_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// eslint-disable-next-line import/first
import { prisma } from '../config/database';

beforeAll(async () => {
  const { execSync } = await import('child_process');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    cwd: process.cwd(),
    stdio: 'pipe',
  });
});

beforeEach(async () => {
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT LIKE '_prisma%'
  `;

  for (const { tablename } of tablenames) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
