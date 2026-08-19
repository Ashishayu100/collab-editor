import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  PORT: z.coerce.number().default(3001),
  CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Comma-separated emails granted access to /api/admin/*. Empty in development falls back to
  // "whoever signed up first" (see routes/admin.ts's requireAdmin) so the dashboard is reachable
  // without any setup; production should always set this explicitly.
  ADMIN_EMAILS: z.string().optional().default(''),
  // Opt-in escape hatch for load testing (see loadtest/README.md). Every rate limit in this app
  // is keyed by IP or by user, and a load generator is a single IP creating throwaway users —
  // so without this the auth limiter (10 attempts/15min per IP) and the per-IP WebSocket
  // connection guards reject nearly every request and the run measures the rate limiter rather
  // than the app. Disables the express-rate-limit middleware and the WS per-IP concurrency/rate
  // checks; nothing else. Off unless set to the literal string "true".
  // NEVER leave this on for a deployment exposed to the internet — it removes brute-force and
  // connection-flood protection entirely.
  // Deliberately permissive rather than a strict enum: only the exact string "true" enables it,
  // and any other value (including a typo) falls back to the safe default instead of taking the
  // whole server down at boot on a failed env parse.
  LOAD_TEST_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
