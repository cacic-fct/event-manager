import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cacic-fct/shared-data-types/sports-metadata': `${workspaceRoot}/libs/shared-data-types/src/lib/sports-metadata.ts`,
      '@cacic-fct/shared-utils': `${workspaceRoot}/libs/shared-utils/src/index.ts`,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/shared-angular/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-angular',
      include: ['libs/shared-angular/src/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.stories.ts'],
    },
  },
});
