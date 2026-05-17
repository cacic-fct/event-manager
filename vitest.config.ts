import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.spec.ts',
        '**/*.stories.ts',
        '**/main.ts',
        '**/main.server.ts',
        '**/test-setup.ts',
      ],
    },
  },
});
