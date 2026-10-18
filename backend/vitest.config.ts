import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Tests talk to the real Postgres configured in .env (same as the app).
    setupFiles: ['dotenv/config'],
    // API tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
