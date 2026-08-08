import type { Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import { authenticatedAdminUserFixture, mockAdminApi, preventSilentSso } from './support/admin-e2e-fixtures';

const sportsReadPermissions = [
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
      adminSportsTournamentList: [
        {
          tournament: {
            id: 'tournament-1',
            majorEventId: 'major-event-1',
            status: 'PUBLISHED',
            scoringMode: 'BY_CATEGORY',
            selfSubscriptionEnabled: true,
            selfSubscriptionAllowNoTeam: false,
            selfSubscriptionAllowNoCategory: false,
            allowPlayerMultipleTeams: false,
            revision: 3,
            finishedAt: null,
          },
          majorEvent: {
            id: 'major-event-1',
            name: 'Jogos Universitários',
            emoji: '🏆',
            startDate: '2026-08-10T12:00:00.000Z',
            endDate: '2026-08-14T22:00:00.000Z',
            isPaymentRequired: false,
          },
          categoryCount: 2,
          teamCount: 8,
          pendingApplicationCount: 2,
          pendingReviewCount: 1,
        },
      ],
    });
  });

  await page.goto('/admin/');
  await page.getByRole('link', { name: /Esportes/ }).click();

  await expect(page).toHaveURL(/\/admin\/sports$/);
  await expect(page.getByRole('heading', { name: 'Gestão esportiva' })).toBeVisible();
  await expect(page.getByText('Jogos Universitários')).toBeVisible();
  await expect(page.getByText('2 modalidades · 8 equipes · Publicado')).toBeVisible();
  await expect(page.getByText('3 pendências')).toBeVisible();
});

test('shows the sports permission boundary when every sports read permission is missing', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: ['event#read'],
  });

  await page.goto('/admin/sports');

  await expect(page.getByRole('heading', { name: 'Seção indisponível' })).toBeVisible();
  await expect(page.getByText('Faltam permissões de leitura para abrir')).toBeVisible();
  await expect(page.getByText('sports-tournament#read')).toBeVisible();
  await expect(page.getByText('sports-score#read')).toBeVisible();
});

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}
