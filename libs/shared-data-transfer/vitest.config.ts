import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@cacic-fct/shared-event-preparation': fileURLToPath(
        new URL('../shared-event-preparation/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['libs/shared-data-transfer/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-data-transfer',
      include: ['libs/shared-data-transfer/src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.type-test.ts', '**/testing.ts'],
    },
  },
});
