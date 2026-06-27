import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
});

test('login page starts the backend auth redirect with the admin return path from the SSO button', async ({ page }) => {
  let loginRedirect: URL | null = null;
  await mockAdminApi(page, {
    user: null,
    onLoginRedirect: (url) => {
      loginRedirect = url;
    },
  });

  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Event Manager' })).toBeVisible();

  await page.getByRole('button', { name: 'Entrar com SSO' }).click();

  await expect.poll(() => loginRedirect?.pathname).toBe('/api/auth/login/redirect');
  await expect.poll(() => loginRedirect?.searchParams.get('returnTo')).toBe('/admin/');
});

test('login page submits development password credentials without a real Keycloak redirect', async ({ page }) => {
  let passwordLoginBody: Record<string, unknown> | null = null;
  await mockAdminApi(page, {
    user: null,
    onPasswordLogin: (body) => {
      passwordLoginBody = body;
    },
  });

  await page.goto('/admin/login?returnTo=%2Fadmin%2Fevents');
  await page.getByLabel('E-mail').fill('aluno@unesp.br');
  await page.getByLabel('Senha').fill('1');
  await page.getByRole('button', { name: /^Entrar$/ }).click();

  await expect.poll(() => passwordLoginBody).toEqual({
    email: 'aluno@unesp.br',
    password: '1',
  });
  await expect(page).toHaveURL(/\/admin\/events/);
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
    onPasswordLogin?: (body: Record<string, unknown>) => void;
  },
): Promise<void> {
  let currentUser = options.user;
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
        status: currentUser ? 200 : 403,
        contentType: 'application/json',
        body: JSON.stringify(currentUser ?? { message: 'User is not authenticated.' }),
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

    if (url.pathname === '/api/auth/password-login') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      options.onPasswordLogin?.(body);
      currentUser = authenticatedAdminUserFixture();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: currentUser,
          expiresAt: Date.now() + 300_000,
          sessionExpiresAt: Date.now() + 600_000,
        }),
      });
      return;
    }

    if (url.pathname === '/api/auth/permissions/evaluate') {
      await route.fulfill({
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: currentUser ? ['event#read'] : [] }),
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

function authenticatedAdminUserFixture(): Record<string, unknown> {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'aluno',
    email: 'aluno@unesp.br',
    roles: ['access'],
    permissions: ['event#read'],
    oidcScopes: ['openid'],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Aluno Unesp',
    },
  };
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
