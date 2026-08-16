import type { Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import {
  adminSportsTournamentListFixture,
  authenticatedAdminUserFixture,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

const sportsReadPermissions = [
  'major-event#read',
  'sports-tournament#read',
  'sports-category#read',
  'sports-team#read',
  'sports-registration#read',
  'sports-match#read',
  'sports-official#read',
  'sports-score#read',
];

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
});

test('opens sports management from workspace navigation and lists configured tournaments', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: sportsReadPermissions,
  });
  await page.route('**/api/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    if (!body.query?.includes('query AdminSportsTournamentList')) {
      await route.fallback();
      return;
    }
    await fulfillGraphql(route, {
      adminSportsTournamentList: [adminSportsTournamentListFixture()],
    });
  });

  await page.goto('/admin/');
  await page.getByRole('link', { name: /Esportes/ }).click();

  await expect(page).toHaveURL(/\/admin\/sports$/);
  await expect(page.getByRole('heading', { name: 'Gestão esportiva' })).toBeVisible();
  await expect(page.getByText('Semana da Computação')).toBeVisible();
  await expect(page.getByText('2 modalidades · 8 equipes · Publicado')).toBeVisible();
  await expect(page.getByText('3 pendências')).toBeVisible();
});

test('shows the unified empty state when no sports event is available', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: sportsReadPermissions,
  });

  await page.goto('/admin/sports');

  await expect(page.getByRole('heading', { name: 'Gestão esportiva' })).toBeVisible();
  await expect(page.getByText('Nenhum grande evento disponível')).toBeVisible();
});

test('shows the sports permission boundary when every sports read permission is missing', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: ['event#read'],
  });

  await page.goto('/admin/sports');

  await expect(page.getByRole('heading', { name: 'Seção indisponível' })).toBeVisible();
  await expect(page.getByText('Faltam permissões de leitura para abrir')).toBeVisible();
  const missingPermissions = page.getByLabel('Permissões ausentes');
  await expect(missingPermissions.getByText('sports-tournament#read', { exact: true })).toBeVisible();
  await expect(missingPermissions.getByText('sports-score#read', { exact: true })).toBeVisible();
});

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}
