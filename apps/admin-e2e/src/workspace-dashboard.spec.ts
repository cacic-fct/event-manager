import { expect, test } from '@playwright/test';
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
