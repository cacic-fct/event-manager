import type { Page } from '@playwright/test';
import { expect, test } from './support/e2e-test';

const storybookURL = process.env['STORYBOOK_URL'];
const storyId = 'admin-event-management-event-workspace-record';
const title = 'Oficina de acessibilidade';
const description = 'Minicurso, no Auditório da FCT, com 24 participantes';

test.describe('Workspace record accessible interactions', () => {
  test.skip(!storybookURL, 'Set STORYBOOK_URL to the already running admin Storybook.');

  for (const device of [
    { name: 'desktop', width: 1280, height: 900, theme: 'light' },
    { name: 'mobile', width: 390, height: 844, theme: 'dark' },
  ] as const) {
    test.describe(`${device.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(device);
        await page.emulateMedia({ colorScheme: device.theme });
      });

      test('keeps the name concise and supports row clicks and independent secondary actions', async ({ page }) => {
        await page.goto(
          `${storybookURL}/iframe.html?id=${storyId}--interaction-feedback&viewMode=story&embed=true&globals=theme:${device.theme}`,
        );
        const primary = page.getByRole('button', { name: title, exact: true });
        await expect(primary).toHaveAccessibleName(title);
        await expect(primary).toHaveAccessibleDescription(description);
        await clickDescription(page);
        await expect(page.getByRole('status')).toHaveText('Seleções: 1. Ações secundárias: 0.');
        await expect(primary).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status')).toHaveText('Seleções: 2. Ações secundárias: 0.');
        await page.keyboard.press('Space');
        await expect(page.getByRole('status')).toHaveText('Seleções: 3. Ações secundárias: 0.');
        await page.keyboard.press('Tab');
        const secondary = page.getByRole('button', { name: 'Mais ações', exact: true });
        await expect(secondary).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status')).toHaveText('Seleções: 3. Ações secundárias: 1.');
        await page.keyboard.press('Shift+Tab');
        await expect(primary).toBeFocused();
      });

      test('exposes a native link with a separate description', async ({ page }) => {
        await page.goto(
          `${storybookURL}/iframe.html?id=${storyId}--deep-link&viewMode=story&embed=true&globals=theme:${device.theme}`,
        );
        const link = page.getByRole('link', { name: title, exact: true });
        await expect(link).toHaveAccessibleDescription(description);
        await expect(link).toHaveAttribute('href', '#/forms/form-1?eventId=event-1');
        await page.keyboard.press('Tab');
        await expect(link).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/#\/forms\/form-1\?eventId=event-1$/);
      });

      test('does not activate a disabled record through its metadata', async ({ page }) => {
        await page.goto(
          `${storybookURL}/iframe.html?id=${storyId}--interaction-feedback&viewMode=story&embed=true&args=disabled:true&globals=theme:${device.theme}`,
        );
        await expect(page.getByRole('button', { name: title, exact: true })).toBeDisabled();
        await clickDescription(page);
        await expect(page.getByRole('status')).toHaveText('Seleções: 0. Ações secundárias: 0.');
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Mais ações', exact: true })).toBeFocused();
      });

      test('keeps read-only content readable without a primary tab stop', async ({ page }) => {
        await page.goto(
          `${storybookURL}/iframe.html?id=${storyId}--read-only&viewMode=story&embed=true&globals=theme:${device.theme}`,
        );
        await expect(page.getByText(title)).toBeVisible();
        await expect(page.getByText(description, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Mais ações', exact: true })).toBeFocused();
      });
    });
  }
});

async function clickDescription(page: Page): Promise<void> {
  const bounds = await page.getByText(description, { exact: true }).boundingBox();
  if (!bounds) {
    throw new Error('The record description must be visible before clicking its row target.');
  }
  // Exercise browser hit testing: the primary control intentionally covers this area.
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
