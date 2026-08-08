import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser tests share a single browser instance, must run sequentially
    fileParallelism: false,
    pool: 'forks',
    // Only run .mjs test files (project is CommonJS, tests are ESM)
    include: ['tests/**/*.test.mjs'],
    // Long timeouts for browser operations
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
