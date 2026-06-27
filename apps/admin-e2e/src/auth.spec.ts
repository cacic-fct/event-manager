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

test('authenticated users are redirected away from the local login page', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedUserFixture(),
  });

  await page.goto('/admin/login');

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByText('admin@example.edu')).toBeVisible();
  await expect(page.getByRole('heading', { name: /boa madrugada|bom dia|boa tarde|boa noite/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
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

    if (url.pathname === '/api/graphql') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: graphqlData(route.request().postDataJSON() as unknown) }),
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
    sub: 'admin-1',
    preferredUsername: 'admin',
    email: 'admin@example.edu',
    roles: [],
    permissions: ['event#read'],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Admin Teste',
      email: 'admin@example.edu',
      picture: null,
    },
  };
}

function graphqlData(body: unknown): Record<string, unknown> {
  const query = isRecord(body) && typeof body['query'] === 'string' ? body['query'] : '';

  if (query.includes('query WorkspaceDashboardInsights')) {
    return {
      workspaceDashboardInsights: emptyDashboardInsights(),
    };
  }

  return {};
}

function emptyDashboardInsights(): Record<string, unknown> {
  return {
    generatedAt: '2026-06-26T12:00:00.000Z',
    suggestions: [],
    calendarEvents: [],
    pendingReceiptValidationsCount: 0,
    pendingReceiptMajorEvents: [],
    pendingOfflineAttendancesCount: 0,
    pendingOfflineAttendanceEvents: [],
    pendingCertificates: [],
    duplicatePeopleCount: 0,
    inconsistencies: [],
    weatherAlerts: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
