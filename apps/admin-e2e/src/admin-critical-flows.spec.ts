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

test('event workspace shows published event draft, scheduling, draft and publish actions', async ({ page }) => {
  await page.goto('/admin/event-workspace/event/event-1/settings');

  await page.getByRole('button', { name: 'Escolher versão' }).click();
  await page.getByRole('button', { name: 'Evento publicado' }).click();

  await expect(page.getByRole('heading', { name: 'Editar evento' })).toBeVisible();
  await expect(page.getByText('Oficina de Angular', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher versão' })).toBeVisible();

  await page.getByRole('button', { name: 'Escolher versão' }).click();
  await page.getByRole('button', { name: /Rascunho: Ajustes de publicação/ }).click();

  await expect(page.getByRole('heading', { name: 'Editar rascunho' })).toBeVisible();
  await expect(page.getByText('Oficina de Angular', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ajustes de publicação')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar rascunho' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar publicação' })).toBeVisible();
});

test('group and major event workspaces expose draft and publication controls', async ({ page }) => {
  await page.goto('/admin/event-workspace/group/event-group-1/settings');

  await expect(page.getByText('Trilha de Minicursos')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Novo grupo|Editar grupo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Salvar rascunho|Voltar para rascunho/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Publicar|Salvar grupo|Atualizar publicação/ })).toBeVisible();

  await page.goto('/admin/event-workspace/major-event/major-event-1/settings');

  await expect(page.getByRole('heading', { name: 'Editar grande evento' })).toBeVisible();
  await expect(page.getByText('Semana da Computação').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar para rascunho' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar publicação' })).toBeVisible();
});

test('subscription management loads event and major event subscriptions', async ({ page }) => {
  await page.goto('/admin/subscriptions/event/event-1');

  await expect(page.getByRole('navigation', { name: 'Operações do evento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trocar contexto:/ })).toBeVisible();
  await expect(page.locator('app-workspace-subscriptions-tab > section > mat-tab-group, app-workspace-attendances-tab > section > mat-tab-group')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Oficina de Angular/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Criação manual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inscrições', level: 1 })).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();

  await page.goto('/admin/subscriptions/major-event/major-event-1');

  await expect(page.getByRole('navigation', { name: 'Operações do evento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trocar contexto:/ })).toBeVisible();
  await expect(page.locator('app-workspace-subscriptions-tab > section > mat-tab-group, app-workspace-attendances-tab > section > mat-tab-group')).toHaveCount(0);
  await expect(page.getByText('Semana da Computação').first()).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await page.getByRole('button', { name: 'Abrir inscrição de Ada Lovelace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Eventos inscritos' })).toBeVisible();
  await expect(page.getByText('Oficina de Angular')).toBeVisible();
});

test('Quero ir lists interests separately and converts one to a subscription', async ({ page }) => {
  await page.goto('/admin/subscriptions');
  await page.getByRole('link', { name: 'Consultar interesses de eventos e grupos' }).click();
  await expect(page).toHaveURL(/subscriptions\/interests/);
  await expect(page.getByRole('heading', { name: 'Interessados' })).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(page.getByText('1 interesse')).toBeVisible();

  await page.getByRole('button', { name: 'Converter em inscrição' }).click();
  const selection = page.getByRole('dialog');
  await expect(selection.getByRole('heading', { name: 'Escolher atividades para inscrição' })).toBeVisible();
  await selection.getByRole('option', { name: /Oficina de Angular/ }).click();
  await selection.getByRole('button', { name: 'Continuar' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('heading', { name: 'Converter interesse em inscrição?' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Converter em inscrição' }).click();
  await expect(page.getByRole('button', { name: 'Inscrito' })).toBeVisible();
});

test('forms workspace loads linked form preview and aggregated results', async ({ page }) => {
  const listRequest = page.waitForRequest((request) => {
    const body = request.postDataJSON() as { query?: string } | null;
    return request.url().includes('/api/graphql') && Boolean(body?.query?.includes('query EventForms'));
  });
  await page.goto('/admin/forms/event/event-1');

  const variables = (await listRequest).postDataJSON() as {
    variables?: { eventId?: string; skip?: number; take?: number };
  };
  expect(variables.variables).toMatchObject({ eventId: 'event-1', skip: 0, take: 51 });
  const contextHeader = page.getByRole('button', { name: 'Trocar contexto: Oficina de Angular' });
  await contextHeader.click();
  const contextDialog = page.getByRole('dialog', { name: 'Escolher contexto' });
  await expect(contextDialog.getByRole('searchbox')).toBeFocused();
  await contextDialog.getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByText('Pesquisa de camiseta').first()).toBeVisible();
  await page.getByText('Pesquisa de camiseta').first().click();

  await expect(page.getByRole('heading', { name: 'Editar formulário' })).toBeVisible();
  await expect(page.locator('input[formcontrolname="name"]')).toHaveValue('Pesquisa de camiseta');
  await expect(page.getByText('Oficina de Angular').first()).toBeVisible();
  await expect(page.getByText('Publicado · 2 respostas')).toBeVisible();

  await page.getByRole('tab', { name: 'Prévia' }).click();
  await expect(page.getByRole('heading', { name: 'Tamanho da camiseta' })).toBeVisible();
  await expect(page.locator('lib-event-form-renderer').getByRole('radio', { name: 'M', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Resultados' }).click();
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible();
  await expect(page.getByText('2 respostas · respostas individuais visíveis')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tamanho da camiseta' })).toBeVisible();
});

test('attendance management loads event attendance and major event attendance detail', async ({ page }) => {
  await page.goto('/admin/attendances/event/event-1');

  await expect(page.getByRole('navigation', { name: 'Operações do evento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trocar contexto:/ })).toBeVisible();
  await expect(page.locator('app-workspace-subscriptions-tab > section > mat-tab-group, app-workspace-attendances-tab > section > mat-tab-group')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Oficina de Angular/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registro manual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Presenças do evento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regulares' })).toBeVisible();
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Presenças off-line em revisão' })).toBeVisible();
  await expect(page.getByText('Pessoa não encontrada')).toBeVisible();

  await page.getByRole('button', { name: 'Corrigir presença off-line' }).click();
  const correctionDialog = page.getByRole('dialog', { name: 'Corrigir presença off-line' });
  await expect(correctionDialog).toBeVisible();
  await expect(correctionDialog.getByLabel('Dado original')).toBeVisible();
  await expect(correctionDialog.getByLabel('Dado original').getByText('ada@exmaple.com')).toBeVisible();
  await expect(correctionDialog.getByLabel('Buscar pessoa')).toHaveValue('ada@exmaple.com');
  await expect(correctionDialog.getByRole('button', { name: 'Salvar correção' })).toBeVisible();
  await correctionDialog.getByRole('button', { name: 'Executar busca de pessoa' }).click();
  await correctionDialog.getByRole('button', { name: /Ada Lovelace/ }).click();
  await correctionDialog.getByRole('button', { name: 'Salvar correção' }).click();
  await expect(correctionDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Presenças off-line em revisão' })).toBeHidden();

  await page.goto('/admin/attendances/major-event/major-event-1');

  await expect(page.getByRole('navigation', { name: 'Operações do evento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trocar contexto:/ })).toBeVisible();
  await expect(page.locator('app-workspace-subscriptions-tab > section > mat-tab-group, app-workspace-attendances-tab > section > mat-tab-group')).toHaveCount(0);
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(page.getByText('Oficina de Angular')).toBeVisible();
  await expect(page.getByText(/Presença registrada em/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir inscrição' })).toBeVisible();
});
