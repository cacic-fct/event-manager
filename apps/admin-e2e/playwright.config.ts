import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { isAbsolute, resolve } from 'node:path';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';
const startServer = process.env['E2E_START_SERVER'] === 'true';
const collectCoverage = process.env['E2E_COVERAGE'] === 'true';
const coverageOutputPath = process.env['E2E_COVERAGE_OUTPUT_DIR'] || 'coverage/admin-e2e';
const coverageOutputDir = isAbsolute(coverageOutputPath)
  ? coverageOutputPath
  : resolve(workspaceRoot, coverageOutputPath);

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
  ...(collectCoverage
    ? {
        reporter: [
          ['list'],
          [
            'monocart-reporter',
            {
              name: 'Admin E2E coverage',
              outputFile: `${coverageOutputDir}/index.html`,
              coverage: {
                reports: ['lcovonly'],
                outputDir: coverageOutputDir,
                sourceFilter: (sourcePath: string) =>
                  /(^|\/)apps\/admin\/src\/.+\.ts$/.test(sourcePath) &&
                  !/(\.spec|\.test|\.stories|\.ngtypecheck)\.ts$/.test(sourcePath),
              },
            },
          ],
        ],
      }
    : {}),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  ...(startServer
    ? {
        webServer: {
          command: 'bunx nx run admin:serve',
          url: baseURL,
          reuseExistingServer: true,
          cwd: workspaceRoot,
        },
      }
    : {}),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
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
