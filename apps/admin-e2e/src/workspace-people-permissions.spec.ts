import { expect, test } from './support/e2e-test';
import {
  adminE2ECriticalFlowPermissions,
  authenticatedAdminUserFixture,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: adminE2ECriticalFlowPermissions,
  });
});

test('permission management loads a linked person and their role assignment', async ({ page }) => {
  await page.goto('/admin/permissions/manage/people/person-1');

  await expect(page).toHaveURL(/\/admin\/permissions\/manage\/people\/person-1$/);
  await expect(page.getByRole('tab', { name: 'Pessoas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Acessos por pessoa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  const directRole = page.getByRole('button', { name: /Operação de credenciamento/ });
  await expect(directRole).toBeVisible();

  await directRole.click();

  await expect(page.getByRole('tab', { name: 'Cargos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Operação de credenciamento' })).toBeVisible();
  await expect(page.locator('.assignment-list')).toContainText('Ada Lovelace');
  await expect(page.getByRole('combobox', { name: 'Alvo' })).toContainText('Semana da Computação');
});
