import type { Page } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import axe from 'axe-core';

declare global {
  interface Window {
    adminAuditAxe: typeof axe;
  }
}

const storybookURL = process.env['STORYBOOK_URL'];
const views = [
  { story: 'admin-settings-preferences--playground', selector: '.workspace-tab-shell', width: 840 },
  { story: 'admin-people-people--playground', selector: '.workspace-tab-shell', width: 1280 },
  { story: 'admin-registration-subscriptions--playground', selector: '.workspace-tab', width: 1280 },
  { story: 'admin-attendance-workspace--playground', selector: '.attendance-shell', width: 1280 },
  { story: 'admin-event-management-publication--playground', selector: '.publication-shell', width: 1280 },
  { story: 'admin-sports-tournaments--playground', selector: '.sports-workspace', width: 1280 },
  { story: 'admin-dashboard-home--playground', selector: 'app-home', width: 1560 },
] as const;

async function expectSupportingTextToFit(page: Page) {
  await expect
    .poll(() =>
      page.locator('mat-hint:visible, mat-error:visible').evaluateAll((messages) =>
        messages.flatMap((message) => {
          const field = message.closest('mat-form-field');
          if (!field) return [];

          const messageBox = message.getBoundingClientRect();
          const fieldBox = field.getBoundingClientRect();
          return messageBox.bottom > fieldBox.bottom + 1
            ? [{ text: message.textContent?.trim(), overflow: messageBox.bottom - fieldBox.bottom }]
            : [];
        }),
      ),
    )
    .toEqual([]);
}

test.describe('admin view widths', () => {
  test.skip(!storybookURL, 'Set STORYBOOK_URL to an already running admin Storybook.');

  test.beforeEach(async ({ page }) => {
    const workerUrl = `${storybookURL}/mockServiceWorker.js`;
    await page.goto(workerUrl);
    await page.evaluate(async (url) => {
      await navigator.serviceWorker.register(url, { scope: new URL('./', url).pathname });
      await navigator.serviceWorker.ready;
    }, workerUrl);
  });

  test('permission management follows the active tab column count', async ({ page }) => {
    await page.setViewportSize({ width: 3440, height: 1000 });
    await page.goto(
      `${storybookURL}/iframe.html?id=admin-access-permissions-management--playground&viewMode=story&embed=true`,
      { waitUntil: 'domcontentloaded' },
    );
    const container = page.locator('app-permission-management-page');
    await expect.poll(async () => (await container.boundingBox())?.width).toBe(1280);
    await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
    await expect.poll(async () => (await container.boundingBox())?.width).toBe(840);
    await page.getByRole('tab', { name: 'Grupos', exact: true }).click();
    await expect.poll(async () => (await container.boundingBox())?.width).toBe(1280);
  });

  for (const view of views) {
    test(`${view.story} stays bounded on ultrawide and fits mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 3440, height: 1000 });
      await page.goto(`${storybookURL}/iframe.html?id=${view.story}&viewMode=story&embed=true`, {
        waitUntil: 'domcontentloaded',
      });
      if (view.story === 'admin-sports-tournaments--playground') {
        await page.getByText('Jogos Universitários 2026', { exact: true }).click();
      }
      const container = page.locator(view.selector).first();
      await expect(container).toBeVisible();
      await expect.poll(async () => (await container.boundingBox())?.width).toBe(view.width);
      const desktopBox = await container.boundingBox();
      expect(desktopBox).not.toBeNull();
      expect(Math.abs((desktopBox?.x ?? NaN) - (3440 - view.width) / 2)).toBeLessThanOrEqual(20);
      await expectSupportingTextToFit(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(async () => (await container.boundingBox())?.width).toBeLessThanOrEqual(390);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expectSupportingTextToFit(page);

      await page.addScriptTag({ content: `${axe.source}\nwindow.adminAuditAxe = window.axe;` });
      const violations = await page.evaluate(async () => {
        const result = await window.adminAuditAxe.run(document.querySelector('#storybook-root') ?? document.body, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
      });
      expect(violations).toEqual([]);
    });
  }

  for (const theme of ['light', 'dark']) {
    test(`people search keeps wrapped hints clear of the next control in ${theme} mode`, async ({ page }) => {
      await page.goto(
        `${storybookURL}/iframe.html?id=admin-people-people--long-names&viewMode=story&embed=true&globals=theme:${theme}`,
        { waitUntil: 'domcontentloaded' },
      );
      const hint = page.getByText('Nome, e-mail principal ou secundário, telefone, documento ou RA', { exact: true });
      const searchField = page.locator('mat-form-field').filter({ has: hint });
      const nextControl = searchField.locator('xpath=following-sibling::*[1]');
      await expect(hint).toBeVisible();

      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await expectSupportingTextToFit(page);
        await expect
          .poll(async () => {
            const hintBox = await hint.boundingBox();
            const nextBox = await nextControl.boundingBox();
            if (!hintBox || !nextBox) return false;
            return (
              hintBox.y + hintBox.height <= nextBox.y ||
              hintBox.x + hintBox.width <= nextBox.x ||
              nextBox.x + nextBox.width <= hintBox.x
            );
          })
          .toBe(true);
      }
    });
  }
});
