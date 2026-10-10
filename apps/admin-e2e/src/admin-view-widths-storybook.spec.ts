import { expect, test } from './support/e2e-test';
import axe from 'axe-core';

declare global {
  interface Window { adminAuditAxe: typeof axe }
}

const storybookURL = process.env['STORYBOOK_URL'];
const views = [
  { story: 'cacic-eventos-workspace-tabs-preferences-workspace-preferences-tab--playground', selector: '.workspace-tab-shell', width: 840 },
  { story: 'cacic-eventos-workspace-tabs-people-workspace-people-tab--playground', selector: '.workspace-tab-shell', width: 1280 },
  { story: 'cacic-eventos-workspace-tabs-subscriptions-page--playground', selector: '.workspace-tab', width: 1280 },
  { story: 'cacic-eventos-workspace-tabs-attendances-page--playground', selector: '.attendance-shell', width: 1280 },
  { story: 'cacic-eventos-workspace-tabs-publicação--playground', selector: '.publication-shell', width: 1280 },
  { story: 'cacic-eventos-workspace-tabs-sports-workspace-sports-tab--playground', selector: '.sports-workspace', width: 1280 },
  { story: 'cacic-eventos-workspace-home-home--playground', selector: 'app-home', width: 1560 },
] as const;

test.describe('admin view widths', () => {
  test.skip(!storybookURL, 'Set STORYBOOK_URL to an already running admin Storybook.');

  test('permission management follows the active tab column count', async ({ page }) => {
    await page.setViewportSize({ width: 3440, height: 1000 });
    await page.goto(`${storybookURL}/iframe.html?id=cacic-eventos-workspace-permissões-gerenciamento--playground&viewMode=story`, { waitUntil: 'domcontentloaded' });
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
      await page.goto(`${storybookURL}/iframe.html?id=${view.story}&viewMode=story`, { waitUntil: 'domcontentloaded' });
      const container = page.locator(view.selector).first();
      await expect(container).toBeVisible();
      await expect.poll(async () => (await container.boundingBox())?.width).toBe(view.width);
      const desktopBox = await container.boundingBox();
      expect(desktopBox).not.toBeNull();
      expect(Math.abs((desktopBox?.x ?? NaN) - (3440 - view.width) / 2)).toBeLessThanOrEqual(20);

      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(async () => (await container.boundingBox())?.width).toBeLessThanOrEqual(390);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

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
});
