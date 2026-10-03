import type { Page, Request } from '@playwright/test';
import type { AdminEventTicket, AdminTicketConfig, AdminTicketHistoryEntry, TicketTransfer } from '@cacic-fct/shared-ticketing';
import {
  createAdminEventTicket,
  createAdminTicketConfig,
  createAdminTicketHistoryEntry,
  createTicketEventSummary,
  createTicketPersonSummary,
  createTicketTransfer,
} from '@cacic-fct/shared-ticketing/testing';
import {
  adminFixtureDateFromNow,
  createAdminReceiptValidationQueue,
  createAdminReceiptValidationQueueItem,
} from '@cacic-fct/admin/testing';
import { expect, test } from './support/e2e-test';
import {
  authenticatedAdminUserFixture,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

const eventId = 'event-1';
const majorEventId = 'major-event-1';
const ticketPermissions = [
  'event#read',
  'major-event#read',
  'related-person#read',
  'subscription#read',
  'ticket-config#read',
  'ticket-config#create',
  'ticket-config#update',
  'ticket#read',
  'ticket#issue',
  'ticket#revoke',
  'ticket-transfer#read',
  'ticket-transfer#manage',
];
const ticketReadPermissions = [
  'event#read',
  'major-event#read',
  'ticket-config#read',
  'ticket#read',
  'ticket-transfer#read',
];

async function setupAdmin(page: Page, permissions: string[] = ticketPermissions): Promise<void> {
  await preventSilentSso(page);
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions,
  });
}

test('selects an event, reports save failures, and protects unsaved changes', async ({ page }) => {
  await setupAdmin(page);
  const state = await installTicketingApi(page, { configExists: false });
  state.saveShouldFail = true;
  await page.goto('/admin/tickets');

  await page.getByRole('button', { name: 'Expandir Semana da Computação' }).click();
  await page.getByRole('button', { name: 'Selecionar Oficina de Angular' }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\/event\/event-1$/);
  await expect(page.getByRole('heading', { name: 'Disponibilidade e identificação' })).toBeVisible();

  const name = page.getByRole('textbox', { name: 'Nome do bilhete' });
  await name.fill('Acesso ao laboratório');
  await page.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(page.getByRole('alert')).toContainText('Configuração recusada pelo servidor.');
  const saveError = page.getByRole('dialog', { name: 'Não foi possível concluir a operação' });
  await expect(saveError).toBeVisible();
  await saveError.getByRole('button', { name: 'Entendi' }).click();

  await page.getByRole('link', { name: 'Inscrições', exact: true }).press('Enter');
  const confirmation = page.getByRole('dialog', { name: 'Descartar alterações?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\/event\/event-1$/);
  await expect(name).toHaveValue('Acesso ao laboratório');

  await page.getByRole('link', { name: 'Inscrições', exact: true }).press('Enter');
  await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(page).toHaveURL(/\/admin\/subscriptions\/event\/event-1$/);
  expect(state.mutations.some((mutation) => mutation.name === 'SaveTicketConfig')).toBe(true);
});

test('ticket editing and issuance controls require their write permissions', async ({ page }) => {
  await setupAdmin(page, ticketReadPermissions);
  await installTicketingApi(page);
  await page.goto('/admin/tickets/event/event-1');

  await expect(page.getByRole('heading', { name: 'Disponibilidade e identificação' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar configuração' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Bilhetes emitidos' }).click();
  await expect(page.getByRole('button', { name: 'Emitir bilhete' })).toHaveCount(0);
  const row = page.locator('.ticket-row').filter({ hasText: 'Marina da Silva' });
  await expect(row.getByRole('button', { name: 'Histórico' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Transferir para outra pessoa' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Revogar' })).toHaveCount(0);
});

test('allows manual issue with a reason despite eligibility warnings', async ({ page }) => {
  await setupAdmin(page);
  const state = await installTicketingApi(page);
  state.eligibilityEligible = false;
  await page.goto('/admin/tickets/event/event-1');
  await page.getByRole('tab', { name: 'Bilhetes emitidos' }).click();
  await page.getByRole('button', { name: 'Emitir bilhete' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar pessoa destinatária' }).fill('Ada');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await dialog.getByRole('button', { name: 'Selecionar Ada Lovelace' }).click();
  await expect(dialog.getByRole('status')).toContainText('A pessoa não atende a todos os critérios');
  await expect(dialog.getByRole('button', { name: 'Emitir bilhete' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Motivo para auditoria' }).fill('Inclusão autorizada pela coordenação.');

  const issueRequest = waitForGraphqlRequest(page, 'mutation AdminIssueTicket');
  await dialog.getByRole('button', { name: 'Emitir bilhete' }).click();
  const input = graphqlVariables(await issueRequest)['input'] as Record<string, unknown>;
  expect(input).toMatchObject({ eventId, personId: 'person-1', reason: 'Inclusão autorizada pela coordenação.' });
  expect(state.mutations.map((mutation) => mutation.name)).toContain('AdminIssueTicket');
  await expect(dialog).toBeHidden();
});

test('keeps ownership until an eligible recipient confirms an admin transfer', async ({ page }) => {
  await setupAdmin(page);
  const state = await installTicketingApi(page);
  state.eligibilityEligible = true;
  await page.goto('/admin/tickets/event/event-1');
  await page.getByRole('tab', { name: 'Bilhetes emitidos' }).click();
  const row = page.locator('.ticket-row').filter({ hasText: 'Marina da Silva' });
  await row.getByRole('button', { name: 'Transferir para outra pessoa' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('O bilhete continua com Marina da Silva até a pessoa destinatária confirmar a transferência.');
  await dialog.getByRole('searchbox', { name: 'Buscar pessoa destinatária' }).fill('Ada');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await dialog.getByRole('button', { name: 'Selecionar Ada Lovelace' }).click();
  await expect(dialog.getByRole('status')).toContainText('A pessoa atende aos critérios configurados para este bilhete.');
  await dialog.getByRole('textbox', { name: 'Motivo para auditoria' }).fill('Ajuste administrativo.');

  const transferRequest = waitForGraphqlRequest(page, 'mutation AdminStartTicketTransfer');
  await dialog.getByRole('button', { name: 'Enviar para confirmação' }).click();
  const input = graphqlVariables(await transferRequest)['input'] as Record<string, unknown>;
  expect(input).toMatchObject({ ticketId: 'ticket-active', recipientPersonId: 'person-1', reason: 'Ajuste administrativo.' });
  expect(state.mutations.map((mutation) => mutation.name)).toContain('AdminStartTicketTransfer');
  await expect(page.locator('.ticket-row').filter({ hasText: 'Marina da Silva' })).toBeVisible();
});

test('revocation requires an audit reason and the ticket trail shows lifecycle changes', async ({ page }) => {
  await setupAdmin(page);
  const state = await installTicketingApi(page);
  await page.goto('/admin/tickets/event/event-1');
  await page.getByRole('tab', { name: 'Bilhetes emitidos' }).click();
  const row = page.locator('.ticket-row').filter({ hasText: 'Marina da Silva' });
  await row.getByRole('button', { name: 'Histórico' }).click();

  const history = page.getByRole('dialog', { name: 'Histórico do bilhete' });
  await expect(history.getByText('Bilhete emitido')).toBeVisible();
  await expect(history.getByText('Titularidade transferida')).toBeVisible();
  await expect(history.getByText('Bilhete utilizado')).toBeVisible();
  await expect(history.getByText('Bilhete revogado')).toBeVisible();
  await history.getByRole('button', { name: 'Fechar' }).click();

  await row.getByRole('button', { name: 'Revogar' }).click();
  const revokeDialog = page.getByRole('dialog', { name: 'Revogar bilhete' });
  const revoke = revokeDialog.getByRole('button', { name: 'Revogar bilhete' });
  await expect(revoke).toBeDisabled();
  await revokeDialog.getByRole('textbox', { name: 'Motivo para auditoria' }).fill('Pedido de cancelamento confirmado.');
  const revokeRequest = waitForGraphqlRequest(page, 'mutation AdminRevokeTicket');
  await revoke.click();
  const input = graphqlVariables(await revokeRequest)['input'] as Record<string, unknown>;
  expect(input).toMatchObject({ ticketId: 'ticket-active', reason: 'Pedido de cancelamento confirmado.' });
  await expect(page.locator('.ticket-row').filter({ hasText: 'Revogado' })).toBeVisible();
  expect(state.mutations.map((mutation) => mutation.name)).toContain('AdminRevokeTicket');
});

test('filters ticket purchases and keeps ticket approval and rejection distinct', async ({ page }) => {
  await setupAdmin(page, [...ticketPermissions, 'receipt#read', 'receipt#approve', 'receipt#reject', 'receipt#undo']);
  const state = await installTicketingApi(page);
  await page.route('**/api/major-event-receipts/admin/queue/events**', async (route) => {
    const payload = { type: 'receipt-validation-queue', queue: state.receiptQueue };
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache' },
      body: `data: ${JSON.stringify(payload)}\n\n`,
    });
  });
  await page.goto('/admin/subscriptions/major-event/major-event-1/validate-receipts');

  await expect(page.getByRole('heading', { name: 'Validação de comprovantes' })).toBeVisible();
  await expect(page.getByText('Marina da Silva', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Comprovante enviado' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtros' }).click();
  const filters = page.getByRole('dialog', { name: 'Filtrar comprovantes' });
  await expect(filters.getByRole('radio', { name: 'Bilhetes (2)' })).toBeVisible();
  await filters.getByRole('radio', { name: 'Bilhetes (2)' }).click();
  await filters.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByText('João Pedro Oliveira', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Bilhete solicitado', { exact: true })).toBeVisible();

  const approveRequest = waitForGraphqlRequest(page, 'mutation ApproveTicketPurchase');
  await page.getByRole('button', { name: 'Aprovar comprovante' }).click();
  expect(graphqlVariables(await approveRequest)).toMatchObject({ purchaseId: 'purchase-ticket-1' });
  await expect(page.getByText('Ana Souza', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Recusar comprovante' }).click();
  const reject = page.getByRole('button', { name: 'Recusar compra' });
  await expect(reject).toBeDisabled();
  await page.getByRole('textbox', { name: 'Motivo da recusa' }).fill('Comprovante sem identificação do pagamento.');
  const rejectRequest = waitForGraphqlRequest(page, 'mutation RejectTicketPurchase');
  await reject.click();
  expect(graphqlVariables(await rejectRequest)).toMatchObject({
    purchaseId: 'purchase-ticket-2',
    reason: 'Comprovante sem identificação do pagamento.',
  });
  await expect(page.getByText('Nenhum comprovante corresponde aos filtros')).toBeVisible();
  expect(state.mutations.map((mutation) => mutation.name)).toEqual(expect.arrayContaining(['ApproveTicketPurchase', 'RejectTicketPurchase']));
});

interface TicketingState {
  config: AdminTicketConfig | null;
  tickets: AdminEventTicket[];
  history: AdminTicketHistoryEntry[];
  receiptQueue: ReturnType<typeof createAdminReceiptValidationQueue>;
  mutations: Array<{ name: string; variables: Record<string, unknown> }>;
  eligibilityEligible: boolean;
  saveShouldFail: boolean;
}

async function installTicketingApi(page: Page, options: { configExists?: boolean } = {}): Promise<TicketingState> {
  const eventSummary = createTicketEventSummary({
    id: eventId,
    name: 'Oficina de Angular',
    emoji: '💻',
    startsAt: adminFixtureDateFromNow(-1, 17),
    endsAt: adminFixtureDateFromNow(-1, 19),
    publicUrl: '/event/event-1',
  });
  const marina = createTicketPersonSummary({
    personId: 'person-2',
    fullName: 'Marina da Silva',
    firstName: 'Marina',
  });
  const activeTicket = createAdminEventTicket({
    id: 'ticket-active',
    eventId,
    event: eventSummary,
    name: 'Acesso ao laboratório',
    holder: marina,
    originalHolder: marina,
    status: 'ACTIVE',
    source: 'EVENT_SUBSCRIPTION',
    sourceReference: 'Inscrição subscription-1. Lote: Estudante.',
  });
  const config = createAdminTicketConfig({
    eventId,
    event: eventSummary,
    majorEventId,
    displayName: 'Acesso ao laboratório',
    description: 'Acesso ao laboratório da atividade.',
    issueOnEventSubscription: true,
    issueOnMajorEventSubscription: false,
    transferable: true,
    purchaseEnabled: true,
    priceOptions: [{ id: 'ticket-price-1', priceTierId: null, label: 'Preço único', amountCents: 5000 }],
  });
  const history: AdminTicketHistoryEntry[] = [
    createAdminTicketHistoryEntry({ ticketId: activeTicket.id, id: 'history-issued', operation: 'ISSUED', newHolder: marina, actorName: 'Sistema', reason: 'Inscrição confirmada.' }),
    createAdminTicketHistoryEntry({ ticketId: activeTicket.id, id: 'history-transfer', operation: 'TRANSFERRED', previousHolder: marina, newHolder: createTicketPersonSummary({ personId: 'person-3', fullName: 'Ada Lovelace', firstName: 'Ada' }), reason: 'Transferência confirmada.' }),
    createAdminTicketHistoryEntry({ ticketId: activeTicket.id, id: 'history-consumed', operation: 'CONSUMED', previousHolder: marina, newHolder: marina, reason: 'Acesso validado no scanner.' }),
    createAdminTicketHistoryEntry({ ticketId: activeTicket.id, id: 'history-revoked', operation: 'REVOKED', previousHolder: marina, newHolder: null, reason: 'Solicitação do titular.' }),
  ];
  const subscriptionReceipt = createAdminReceiptValidationQueueItem({
    category: 'SUBSCRIPTION',
    subscriptionId: 'subscription-receipt-1',
    personName: 'Marina da Silva',
    subscriptionUpdatedAt: adminFixtureDateFromNow(-3, 10),
    subscriptionCreatedAt: adminFixtureDateFromNow(-5, 12),
  });
  const firstTicketReceipt = createAdminReceiptValidationQueueItem({
    category: 'TICKET',
    subscriptionId: 'purchase-ticket-1',
    purchaseId: 'purchase-ticket-1',
    ticketName: 'Acesso à festa de boas-vindas',
    personName: 'João Pedro Oliveira',
    paymentTier: 'Estudante',
    amountPaid: 12_000,
    subscriptionUpdatedAt: adminFixtureDateFromNow(-2, 10),
    subscriptionCreatedAt: adminFixtureDateFromNow(-4, 12),
  });
  const secondTicketReceipt = createAdminReceiptValidationQueueItem({
    category: 'TICKET',
    subscriptionId: 'purchase-ticket-2',
    purchaseId: 'purchase-ticket-2',
    ticketName: 'Acesso ao jantar de integração',
    personName: 'Ana Souza',
    paymentTier: 'Visitante',
    amountPaid: 24_000,
    subscriptionUpdatedAt: adminFixtureDateFromNow(-1, 10),
    subscriptionCreatedAt: adminFixtureDateFromNow(-3, 12),
  });
  const state: TicketingState = {
    config: options.configExists === false ? null : config,
    tickets: [activeTicket],
    history,
    receiptQueue: createAdminReceiptValidationQueue({ items: [subscriptionReceipt, firstTicketReceipt, secondTicketReceipt] }),
    mutations: [],
    eligibilityEligible: true,
    saveShouldFail: false,
  };

  await page.route('**/api/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string; variables?: Record<string, unknown> };
    const query = body.query ?? '';
    const variables = body.variables ?? {};
    const input = isRecord(variables['input']) ? variables['input'] : {};
    const fulfill = (data: Record<string, unknown>) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });

    if (query.includes('AdminEventContextPage')) {
      const nodes = variables['parentId'] === majorEventId
        ? [{ kind: 'EVENT', id: eventId, name: 'Oficina de Angular', emoji: '💻', eventType: 'MINICURSO', hasChildren: false, ancestors: [{ kind: 'MAJOR_EVENT', id: majorEventId, name: 'Semana da Computação', emoji: '🎓' }] }]
        : [{ kind: 'MAJOR_EVENT', id: majorEventId, name: 'Semana da Computação', emoji: '🎓', hasChildren: true, ancestors: [] }];
      await fulfill({ adminEventContextPage: { nodes, nextCursor: null } });
      return;
    }
    if (query.includes('query RelatedPeople')) {
      expect(variables['eventId']).toBe(eventId);
      await fulfill({ relatedPeople: [{ id: 'person-1', name: 'Ada Lovelace' }] });
      return;
    }
    if (query.includes('AdminTicketConfigs')) {
      const matches = state.config && (!variables['eventId'] || variables['eventId'] === state.config.eventId) &&
        (!variables['majorEventId'] || variables['majorEventId'] === state.config.majorEventId);
      await fulfill({ adminTicketConfigs: matches ? [state.config] : [] });
      return;
    }
    if (query.includes('SaveTicketConfig')) {
      state.mutations.push({ name: 'SaveTicketConfig', variables });
      if (state.saveShouldFail) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Configuração recusada pelo servidor.' }] }),
        });
        return;
      }
      state.config = { ...config, ...input } as AdminTicketConfig;
      await fulfill({ saveTicketConfig: state.config });
      return;
    }
    if (query.includes('AdminEventTickets')) {
      const status = variables['status'];
      const search = typeof variables['search'] === 'string' ? variables['search'].toLocaleLowerCase('pt-BR') : '';
      const tickets = state.tickets.filter((ticket) => (!status || ticket.status === status) &&
        (!search || ticket.holder?.fullName.toLocaleLowerCase('pt-BR').includes(search)));
      await fulfill({ adminEventTickets: { tickets, totalCount: tickets.length, nextCursor: null } });
      return;
    }
    if (query.includes('AdminTicketEligibilityWarnings')) {
      await fulfill({ adminTicketEligibilityWarnings: state.eligibilityEligible
        ? { eligible: true, warnings: [] }
        : { eligible: false, warnings: [{ code: 'COURSE_REQUIRED', message: 'É necessário estar matriculado em Ciência da Computação.' }] } });
      return;
    }
    if (query.includes('AdminIssueTicket')) {
      state.mutations.push({ name: 'AdminIssueTicket', variables });
      const person = createTicketPersonSummary({ personId: String(input['personId']), fullName: 'Ada Lovelace', firstName: 'Ada' });
      const issued = createAdminEventTicket({
        id: 'ticket-issued',
        eventId,
        event: eventSummary,
        name: state.config?.displayName ?? 'Acesso ao laboratório',
        holder: person,
        originalHolder: person,
        source: 'ADMIN',
        status: 'ACTIVE',
      });
      state.tickets = [...state.tickets, issued];
      await fulfill({ adminIssueTicket: issued });
      return;
    }
    if (query.includes('AdminRevokeTicket')) {
      state.mutations.push({ name: 'AdminRevokeTicket', variables });
      const ticketId = String(input['ticketId']);
      state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, status: 'REVOKED' } : ticket);
      const revoked = state.tickets.find((ticket) => ticket.id === ticketId);
      if (!revoked) throw new Error(`Ticket ${ticketId} is not available for revocation.`);
      await fulfill({ adminRevokeTicket: revoked });
      return;
    }
    if (query.includes('AdminStartTicketTransfer')) {
      state.mutations.push({ name: 'AdminStartTicketTransfer', variables });
      const ticket = state.tickets.find((item) => item.id === input['ticketId']);
      if (!ticket) throw new Error(`Ticket ${String(input['ticketId'])} is not available for transfer.`);
      const transfer: TicketTransfer = createTicketTransfer({
        id: 'transfer-admin-1',
        ticket,
        event: eventSummary,
        sender: marina,
        recipient: null,
        initiatedByAdmin: true,
        initiatingAdmin: { personId: 'admin-1', firstName: 'Admin', avatarUrl: null },
      });
      await fulfill({ adminStartTicketTransfer: transfer });
      return;
    }
    if (query.includes('AdminTicketHistory')) {
      await fulfill({ adminTicketHistory: state.history });
      return;
    }
    if (query.includes('AdminReceiptValidationQueue')) {
      await fulfill({ adminReceiptValidationQueue: state.receiptQueue });
      return;
    }
    if (query.includes('ApproveTicketPurchase')) {
      state.mutations.push({ name: 'ApproveTicketPurchase', variables });
      removePurchase(state, String(variables['purchaseId']));
      await fulfill({ approveTicketPurchase: true });
      return;
    }
    if (query.includes('RejectTicketPurchase')) {
      state.mutations.push({ name: 'RejectTicketPurchase', variables });
      removePurchase(state, String(variables['purchaseId']));
      await fulfill({ rejectTicketPurchase: true });
      return;
    }

    await route.fallback();
  });

  return state;
}

function removePurchase(state: TicketingState, purchaseId: string): void {
  state.receiptQueue = createAdminReceiptValidationQueue({
    ...state.receiptQueue,
    items: state.receiptQueue.items.filter((item) => (item.purchaseId ?? item.subscriptionId) !== purchaseId),
  });
}

function waitForGraphqlRequest(page: Page, operationName: string): Promise<Request> {
  return page.waitForRequest((request) =>
    isGraphqlRequest(request) && graphqlQuery(request).includes(operationName),
  );
}

function isGraphqlRequest(request: Request): boolean {
  return request.method() === 'POST' && new URL(request.url()).pathname === '/api/graphql';
}

function graphqlQuery(request: Request): string {
  if (!isGraphqlRequest(request)) {
    throw new Error(`Expected a GraphQL request, received ${request.method()} ${request.url()}.`);
  }
  const body = request.postDataJSON() as { query?: string } | null;
  return body?.query ?? '';
}

function graphqlVariables(request: Request): Record<string, unknown> {
  if (!isGraphqlRequest(request)) {
    throw new Error(`Expected a GraphQL request, received ${request.method()} ${request.url()}.`);
  }
  const body = request.postDataJSON() as { variables?: Record<string, unknown> } | null;
  return body?.variables ?? {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
