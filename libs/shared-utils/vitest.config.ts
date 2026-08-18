import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cacic-fct/event-manager-public-testing': `${workspaceRoot}/libs/event-manager-public-testing/src/index.ts`,
      '@cacic-fct/event-manager-public-contracts': `${workspaceRoot}/libs/event-manager-public-contracts/src/index.ts`,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/shared-utils/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-utils',
      include: ['libs/shared-utils/src/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.stories.ts'],
    },
  },
});
