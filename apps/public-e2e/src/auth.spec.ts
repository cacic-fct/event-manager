import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
});

test('protected public routes start backend login with the requested return path', async ({ page }) => {
  let loginRedirect: URL | null = null;
  await mockPublicApi(page, {
    user: null,
    onLoginRedirect: (url) => {
      loginRedirect = url;
    },
  });

  await page.goto('/preferences');

  await expect.poll(() => loginRedirect?.pathname).toBe('/api/auth/login/redirect');
  await expect.poll(() => loginRedirect?.searchParams.get('returnTo')).toBe('/preferences');
});

test('authenticated public users keep their local session and see account actions', async ({ page }) => {
  await mockPublicApi(page, {
    user: authenticatedUserFixture(),
  });

  await page.goto('/menu');

  await expect(page.getByText('Usuário Teste')).toBeVisible();
  await expect(page.getByLabel('Sair da conta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
});

async function preventSilentSso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
}

async function mockPublicApi(
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

    if (url.pathname === '/api/graphql') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });
}

function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'usuario.teste',
    email: 'usuario.teste@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Usuário Teste',
      picture: null,
    },
  };
}
