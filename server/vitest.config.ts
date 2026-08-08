import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Deliberately no global setupFiles: unit tests (src/test/unit/**) touch no database and
    // must stay fast and infra-free. Integration/WebSocket tests instead pull in the Prisma
    // migrate/truncate lifecycle themselves, transitively, by importing `../setup` (directly,
    // or via `../helpers`) — see src/test/setup.ts.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    // Integration/WebSocket test files all truncate the same shared Postgres test database in
    // beforeEach. Running multiple test files concurrently (vitest's default) means their
    // TRUNCATE ... CASCADE statements race and deadlock against each other. Test FILES run
    // sequentially instead; tests within a file still run in declaration order as usual.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/test/**', 'src/**/*.test.ts', 'src/types/**', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
