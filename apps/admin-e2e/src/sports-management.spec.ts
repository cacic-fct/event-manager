import type { Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import {
  adminSportsTournamentListFixture,
  adminSportsTournamentReadFixture,
  authenticatedAdminUserFixture,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

const sportsReadPermissions = [
  'event#read',
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

  await page.goto('/admin/event-workspace/major-event/major-event-1');
  await page.getByRole('link', { name: /Esportes/ }).click();

  await expect(page).toHaveURL(/\/admin\/sports\/major-event\/major-event-1$/);
  await expect(page.getByRole('heading', { name: 'Esportes' })).toBeVisible();
  const tournamentList = page.locator('.sports-major-event-list');
  await expect(tournamentList.locator('mat-list-item')).toHaveCount(1);
  const tournament = tournamentList
    .locator('mat-list-item')
    .filter({ hasText: '2 modalidades e 8 equipes, Publicado' });
  await expect(tournament).toBeVisible();
  await expect(tournament.getByText('Semana da Computação')).toBeVisible();
  await expect(tournament.getByText('3 pendências')).toBeVisible();
});

test('keeps the selected tournament workspace state on a deep link', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: sportsReadPermissions,
  });
  await page.route('**/api/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    if (body.query?.includes('query AdminSportsTournamentList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { adminSportsTournamentList: [adminSportsTournamentListFixture()] } }),
      });
      return;
    }
    if (body.query?.includes('query AdminSportsApplications')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { adminSportsPlayerApplicationQueue: [] } }),
      });
      return;
    }
    if (body.query?.includes('query AdminSportsMatchActionReviewQueue')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { adminSportsMatchActionReviewQueue: [] } }),
      });
      return;
    }
    if (!body.query?.includes('query AdminSportsTournament(')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { adminSportsTournamentRead: adminSportsTournamentReadFixture() },
      }),
    });
  });

  await page.goto('/admin/sports/major-event/major-event-1');

  await expect(page).toHaveURL(/\/admin\/sports\/major-event\/major-event-1$/);
  await expect(page.getByRole('heading', { name: 'Esportes' })).toBeVisible();
  const matchesTab = page.getByRole('tab', { name: /Partidas e chaves/ });
  await expect(matchesTab).toBeVisible();

  await matchesTab.click();
  await expect(page).toHaveURL(/\/admin\/sports\/major-event\/major-event-1\/matches$/);
  await expect(matchesTab).toHaveAttribute('aria-selected', 'true');

  const categoriesTab = page.getByRole('tab', { name: /Modalidades/ });
  await categoriesTab.click();
  await expect(page).toHaveURL(/\/admin\/sports\/major-event\/major-event-1\/categories$/);
  await expect(categoriesTab).toHaveAttribute('aria-selected', 'true');
});

test('shows the unified empty state when no sports event is available', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: sportsReadPermissions,
  });

  await page.goto('/admin/sports');

  await expect(page.getByRole('heading', { name: 'Esportes' })).toBeVisible();
  await expect(page.getByText('Nenhum grande evento disponível')).toBeVisible();
});

test('shows the sports permission boundary when every sports read permission is missing', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: ['event#read'],
  });

  await page.goto('/admin/sports');

  await expect(page).toHaveURL(/\/admin\/sports$/);
  await expect(page.getByRole('heading', { name: 'Você não tem acesso a esta página.' })).toBeVisible();
  await expect(page.getByText('Erro 403', { exact: true })).toBeVisible();
  await expect(page.getByText('sports-tournament#read', { exact: true })).toHaveCount(0);
});

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}
