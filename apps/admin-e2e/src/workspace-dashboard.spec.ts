import { expect, test } from './support/e2e-test';
import {
  authenticatedAdminUserFixture,
  createAdminE2EDashboardInsights,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
});

test('workspace dashboard renders operational queues from mocked admin fixtures', async ({ page }) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    dashboardInsights: createAdminE2EDashboardInsights(),
  });

  await page.goto('/admin/');

  const dashboard = page.getByRole('main');
  await expect(page.getByRole('heading', { name: /bom dia|boa tarde|boa noite|boa madrugada/i })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Novo evento/ })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Hoje' })).toBeVisible();
  await expect(dashboard.getByText('Credenciamento').first()).toBeVisible();
  await expect(dashboard.getByText('Presenças off-line pendentes', { exact: true })).toBeVisible();
  await expect(dashboard.getByText('Comprovantes pendentes', { exact: true })).toBeVisible();
  await expect(dashboard.getByText('Inconsistências críticas', { exact: true })).toBeVisible();
  await expect(dashboard.getByText('Pessoas duplicadas', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Coletar presença' }).click();

  await expect(page).toHaveURL(/\/admin\/attendances\/event\/event-1$/);
});

test('workspace dashboard refetches visibly after a live invalidation without navigation', async ({ page }) => {
  const initialInsights = createAdminE2EDashboardInsights();
  const refreshedInsights = createAdminE2EDashboardInsights({ suggestions: [] });
  let dashboardRequests = 0;
  let releaseInvalidation!: () => void;
  const invalidationReady = new Promise<void>((resolve) => {
    releaseInvalidation = resolve;
  });
  let invalidationSent = false;

  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    dashboardInsights: () => {
      dashboardRequests += 1;
      return dashboardRequests === 1 ? initialInsights : refreshedInsights;
    },
  });
  await page.route('**/api/realtime/admin/workspace/events', async (route) => {
    if (!invalidationSent) {
      await invalidationReady;
      invalidationSent = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"WORKSPACE_INVALIDATED"}\n\n',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: 'data: {"type":"heartbeat"}\n\n',
    });
  });

  await page.goto('/admin/');
  await expect(page.getByRole('link', { name: 'Novo evento' })).toBeVisible();
  expect(dashboardRequests).toBe(1);

  releaseInvalidation();

  await expect(page.getByRole('link', { name: 'Novo evento' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/?$/);
  expect(dashboardRequests).toBeGreaterThanOrEqual(2);
});

test('workspace route falls back to the permission-denied view when evaluated tab permissions are missing', async ({
  page,
}) => {
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: [],
  });

  await page.goto('/admin/events');

  await expect(page).toHaveURL(/\/app\/?$/);
});
