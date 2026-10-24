import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    pool: 'forks',
    testTimeout: 15000,
  },
});
