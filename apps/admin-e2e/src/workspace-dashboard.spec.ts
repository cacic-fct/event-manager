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

  await expect(page.getByRole('heading', { name: /bom dia|boa tarde|boa noite|boa madrugada/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Novo evento/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
  await expect(page.getByText('Credenciamento')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Presenças off-line pendentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comprovantes pendentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inconsistências críticas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pessoas duplicadas' })).toBeVisible();

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

  await expect(page.getByRole('heading', { name: 'Seção indisponível' })).toBeVisible();
  await expect(page.getByText('Faltam permissões de leitura para abrir')).toBeVisible();
  await expect(page.getByText('event#read')).toBeVisible();
  await expect(page.getByText('major-event#read')).toBeVisible();
});
