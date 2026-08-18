import { expect, test as base } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

type CoverageFixtures = {
  collectCoverage: void;
};

const coverageEnabled = process.env['E2E_COVERAGE'] === 'true';

export const test = base.extend<CoverageFixtures>({
  collectCoverage: [
    async ({ page }, use) => {
      const shouldCollectCoverage = coverageEnabled && test.info().project.name === 'chromium';
      if (shouldCollectCoverage) {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }

      await use();

      if (!shouldCollectCoverage) {
        return;
      }

      // Some flows deliberately close the page before switching users. In that
      // case there is no target left from which Chromium can return coverage.
      if (page.isClosed()) {
        return;
      }

      try {
        const coverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(coverage, test.info());
      } catch (error) {
        if (!page.isClosed()) {
          throw error;
        }
      }
    },
    {
      auto: true,
    },
  ],
});

export { expect };
