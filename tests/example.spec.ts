import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://fctapp.cacic.dev.br/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/FCT App/);
});
