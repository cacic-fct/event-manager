import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['libs/shared-event-preparation/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-event-preparation',
      include: ['libs/shared-event-preparation/src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
    },
  },
});
