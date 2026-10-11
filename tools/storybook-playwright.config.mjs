import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'storybook-controls.spec.mjs',
  outputDir: '../tmp/storybook-controls',
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  reporter: 'list',
  use: {
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
