import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';
const startServer = process.env['E2E_START_SERVER'] === 'true';
const startStaticServer = process.env['E2E_PUBLIC_STATIC_SERVER'] === 'true';
const serviceWorkerTestMatch = /.*service-worker-offline\.spec\.ts/;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    serviceWorkers: 'block',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  ...(startServer
    ? {
        webServer: {
          command: startStaticServer ? 'bunx nx run public:serve-static' : 'bunx nx run public:serve',
          url: baseURL,
          reuseExistingServer: true,
          cwd: workspaceRoot,
        },
      }
    : {}),
  projects: [
    {
      name: 'chromium',
      testIgnore: serviceWorkerTestMatch,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      testIgnore: serviceWorkerTestMatch,
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      testIgnore: serviceWorkerTestMatch,
      use: { ...devices['Desktop Safari'] },
    },

    {
      name: 'service-worker-chromium',
      testMatch: serviceWorkerTestMatch,
      use: {
        ...devices['Desktop Chrome'],
        serviceWorkers: 'allow',
      },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
