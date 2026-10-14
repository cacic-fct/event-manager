import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@cacic-fct/event-manager-public-contracts/types': fileURLToPath(
        new URL('../event-manager-public-contracts/src/lib/types/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['libs/shared-event-participation/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-event-participation',
      include: ['libs/shared-event-participation/src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
    },
  },
});
