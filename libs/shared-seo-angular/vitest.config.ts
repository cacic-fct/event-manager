import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/shared-seo-angular/src/**/*.spec.ts'],
    setupFiles: ['libs/shared-seo-angular/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'json'],
      reportsDirectory: 'coverage/libs/shared-seo-angular',
      include: ['libs/shared-seo-angular/src/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.stories.ts'],
    },
  },
});
