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

test('people workspace manages Event Manager permission grants', async ({ page }) => {
  await page.goto('/admin/people');

  await page.getByLabel(/buscar pessoa/i).fill('Ada');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Ada Lovelace').first().click();

  await expect(page.getByText('Permissões do Event Manager')).toBeVisible();
  await expect(page.getByText('Evento · Visualizar')).toBeVisible();
  await expect(page.getByText('Global · Todos os eventos · Ativa')).toBeVisible();

  await page.getByRole('button', { name: 'Editar permissão' }).first().click();
  await expect(page.getByRole('button', { name: 'Salvar permissão' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar edição' }).click();

  const grantForm = page.locator('.permission-grant-form');
  await grantForm.getByLabel('Preset').click();
  await page.getByRole('option', { name: /Consulta de comprovantes/ }).click();
  await expect(grantForm.getByLabel('Escopo da permissão')).toContainText('Grande evento');

  await grantForm.getByLabel('Escopo da permissão').click();
  await expect(page.getByRole('option', { name: 'Evento' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('option', { name: 'Grande evento' })).toHaveAttribute('aria-disabled', 'false');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('listbox', { name: 'Buscar grande evento' })).toBeVisible();
  await page
    .getByRole('listbox', { name: 'Buscar grande evento' })
    .getByRole('option', { name: /Semana da Computação/ })
    .click();

  await page.getByRole('button', { name: 'Adicionar permissões do preset' }).click();
  await expect(page.getByText('Permissões em revisão')).toBeVisible();
  await expect(page.getByText(/Grande evento · Semana da Computação/)).toBeVisible();
  await expect(page.getByText('Comprovante · Visualizar')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar permissões', exact: true }).click();
  await expect(page.getByText('Permissões concedidas.')).toBeVisible();
  await expect(page.getByText('Grande evento · Semana da Computação · Ativa')).toBeVisible();

  await page.getByRole('button', { name: 'Remover permissão' }).last().click();
  await expect(page.getByText('Permissão removida.')).toBeVisible();
});
