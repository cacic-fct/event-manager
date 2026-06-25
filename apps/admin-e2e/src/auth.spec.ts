import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
});

test('login page starts the backend auth redirect with the admin return path', async ({ page }) => {
  let loginRedirect: URL | null = null;
  await mockAdminApi(page, {
    user: null,
    onLoginRedirect: (url) => {
      loginRedirect = url;
    },
  });

  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Event Manager' })).toBeVisible();

  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect.poll(() => loginRedirect?.pathname).toBe('/api/auth/login/redirect');
  await expect.poll(() => loginRedirect?.searchParams.get('returnTo')).toBe('/admin/');
});

async function preventSilentSso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
}

async function mockAdminApi(
  page: Page,
  options: {
    user: Record<string, unknown> | null;
    onLoginRedirect?: (url: URL) => void;
  },
): Promise<void> {
  await page.route('https://unleash.cacic.dev.br/api/frontend/**', (route) =>
    route.fulfill({
      status: 304,
      body: '',
    }),
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: options.user ? 200 : 403,
        contentType: 'application/json',
        body: JSON.stringify(options.user ?? { message: 'User is not authenticated.' }),
      });
      return;
    }

    if (url.pathname === '/api/auth/login/redirect') {
      options.onLoginRedirect?.(url);
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Auth redirect captured</title>',
      });
      return;
    }

    if (url.pathname === '/api/auth/permissions/evaluate') {
      await route.fulfill({
        status: options.user ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: options.user ? ['event#read'] : [] }),
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });
}
