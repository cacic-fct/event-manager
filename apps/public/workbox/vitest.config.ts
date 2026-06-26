import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/public/workbox/**/*.spec.ts'],
  },
});
