import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['libs/shared-permissions/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: '../../coverage/libs/shared-permissions',
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts'],
    },
  },
});
