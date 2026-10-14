import { defineConfig } from 'vitest/config';

export default defineConfig({
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
