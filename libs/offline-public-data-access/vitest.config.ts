import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cacic-fct/event-manager-public-contracts': `${workspaceRoot}/libs/event-manager-public-contracts/src/index.ts`,
      '@cacic-fct/shared-data-types': `${workspaceRoot}/libs/shared-data-types/src/index.ts`,
      '@cacic-fct/shared-utils': `${workspaceRoot}/libs/shared-utils/src/index.ts`,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/offline-public-data-access/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: '../../coverage/libs/offline-public-data-access',
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.stories.ts'],
    },
  },
});
