import { expect, test } from '@playwright/test';
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

test('event workspace shows published event draft, scheduling, draft and publish actions', async ({ page }) => {
  await page.goto('/admin/events/event-1');

  await expect(page.getByRole('heading', { name: 'Editar rascunho' })).toBeVisible();
  await expect(page.getByText('Oficina de Angular', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ajustes de publicação')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher versão' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar rascunho' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar publicação' })).toBeVisible();
});

test('group and major event workspaces expose draft and publication controls', async ({ page }) => {
  await page.goto('/admin/groups');

  await expect(page.getByText('Trilha de Minicursos')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Novo grupo|Editar grupo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Salvar rascunho|Voltar para rascunho/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Publicar|Salvar grupo|Atualizar publicação/ })).toBeVisible();

  await page.goto('/admin/major-events/major-event-1');

  await expect(page.getByRole('heading', { name: 'Editar grande evento' })).toBeVisible();
  await expect(page.getByText('Semana da Computação').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar para rascunho' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar publicação' })).toBeVisible();
});

test('subscription management loads event and major event subscriptions', async ({ page }) => {
  await page.goto('/admin/subscriptions/event/event-1');

  await expect(page.getByRole('tab', { name: 'Eventos', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: /Oficina de Angular/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Criação manual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inscrições', level: 1 })).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();

  await page.goto('/admin/subscriptions/major-event/major-event-1');

  await expect(page.getByRole('tab', { name: 'Grandes eventos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Semana da Computação').first()).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Eventos inscritos' })).toBeVisible();
  await expect(page.getByText('Oficina de Angular')).toBeVisible();
});

test('attendance management loads event attendance and major event attendance detail', async ({ page }) => {
  await page.goto('/admin/attendances/event/event-1');

  await expect(page.getByRole('tab', { name: 'Por evento' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: /Oficina de Angular/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registro manual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Presenças do evento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regulares' })).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();

  await page.goto('/admin/attendances/major-event/major-event-1');

  await expect(page.getByRole('tab', { name: 'Por grande evento' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(page.getByText('Oficina de Angular')).toBeVisible();
  await expect(page.getByText('Presente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible();
});
