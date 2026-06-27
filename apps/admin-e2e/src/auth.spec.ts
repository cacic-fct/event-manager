import { expect, test } from '@playwright/test';
import { authenticatedAdminUserFixture, mockAdminApi, preventSilentSso } from './support/admin-e2e-fixtures';

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
    user: authenticatedAdminUserFixture(),
  });

  await page.goto('/admin/login');

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByText('admin@example.edu')).toBeVisible();
  await expect(page.getByRole('heading', { name: /boa madrugada|bom dia|boa tarde|boa noite/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
});
