import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/public/workbox/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/apps/public-workbox',
      include: ['apps/public/workbox/**/*.{ts,mjs}'],
      exclude: ['**/*.spec.ts', '**/vitest.config.ts', '**/build-public-workbox.mjs'],
    },
  },
});
