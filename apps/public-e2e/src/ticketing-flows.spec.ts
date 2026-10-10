import type { Page, Route } from '@playwright/test';
import { createTicketTransfer, createTicketTransferLists, createWalletTicket } from '@cacic-fct/shared-ticketing/testing';
import type { TicketTransfer, WalletTicket } from '@cacic-fct/shared-ticketing';
import { expect, test } from './support/e2e-test';
import { authenticatedUserFixture } from './support/authenticated-user.fixture';

type TicketApiState = {
  walletTickets: WalletTicket[];
  transfer: TicketTransfer | null;
  outgoing: TicketTransfer[];
  graphqlRequests: Array<{ query: string; variables: Record<string, unknown> }>;
  walletTicketQueries: number;
  recoveryQueries: number;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.addInitScript(installControlledEventSource);
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) =>
    route.fulfill({ json: { toggles: [] } }),
  );
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    }),
  );
});

test('opens archived passes with their barcodes and returns to the archive', async ({ page }) => {
  const now = new Date();
  const active = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789ab' }, now);
  const archived = [
    createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789ac', name: 'Ingresso utilizado', status: 'CONSUMED' }, now),
    createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789ad', name: 'Ingresso revogado', status: 'REVOKED' }, now),
    createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789ae', name: 'Ingresso expirado', status: 'EXPIRED' }, now),
  ];
  const state = createTicketApiState([active, ...archived]);
  await mockTicketingApi(page, state);

  await page.goto('/app/profile/wallet');
  await expect(page.getByRole('button', { name: /festa de encerramento/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver 3 bilhetes expirados' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver 3 bilhetes expirados' }).click();

  const reasons = new Map([
    ['Ingresso utilizado', 'Bilhete já utilizado'],
    ['Ingresso revogado', 'Bilhete revogado'],
    ['Ingresso expirado', 'Prazo de validade encerrado'],
  ]);
  for (const [name, reason] of reasons) {
    const row = page.locator('button.wallet-expired-ticket').filter({ hasText: name });
    await expect(row.locator('[matlistitemtitle], [matlistitemline]')).toHaveCount(2);
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(reason, { exact: true })).toBeVisible();
    await expect(row.locator('img, mat-icon, time')).toHaveCount(0);
    await row.click();

    await expect(page.getByText('Expirado', { exact: true })).toBeVisible();
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await expect(page.locator('.expired-barcode .barcode-content')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.expired-barcode')).toHaveCSS('opacity', '0.35');
    await page.locator('.wallet-card-detail .ticket-header').click();
    await expect(row).toBeVisible();
  }

  await page.getByRole('link', { name: 'Adicionar cartão' }).click();
  await expect(page.getByRole('heading', { name: 'Adicionar cartão' })).toBeVisible();
  await page.getByRole('link', { name: 'Transferência de bilhetes' }).click();
  await expect(page.getByRole('heading', { name: 'Transferência de bilhetes' })).toBeVisible();
  await expect(page.getByText('Você ainda não tem pedidos de transferência de bilhetes.')).toBeVisible();
});

test('an expiry update keeps the open pass and its barcode in the wallet', async ({ page }) => {
  const now = new Date();
  await page.clock.install({ time: now });
  const ticket = createWalletTicket({
    id: '018f47a1-3d5b-7abc-8def-0123456789af',
    effectiveExpiresAt: new Date(now.getTime() + 5_000).toISOString(),
  }, now);
  const state = createTicketApiState([ticket]);
  await mockTicketingApi(page, state);

  await page.goto('/app/profile/wallet');
  await page.getByRole('button', { name: 'Festa de encerramento' }).click();
  await expect(page.getByRole('link', { name: /Mais informações sobre Festa de encerramento/ })).toBeVisible();
  await page.clock.fastForward(5_000);

  await expect(page.getByText('Prazo de validade encerrado', { exact: true })).toBeVisible();
  await expect(page.getByText('Expirado', { exact: true })).toBeVisible();
  await expect(page.locator('.expired-barcode .barcode-content')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('link', { name: 'Adicionar cartão' })).toHaveCount(0);
});

test('clears the selected pass when transfer acceptance invalidates it', async ({ page }) => {
  const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b0' });
  const state = createTicketApiState([ticket]);
  await mockTicketingApi(page, state);

  await page.goto('/app/profile/wallet');
  await page.getByRole('button', { name: 'Festa de encerramento' }).click();
  await expect(page.getByRole('link', { name: /Mais informações sobre Festa de encerramento/ })).toBeVisible();

  state.walletTickets = [];
  await emitTicketSse(page, {
    revision: 'transfer-accepted-1',
    type: 'TICKETS_CHANGED',
    ticketId: ticket.id,
    changedAt: new Date().toISOString(),
  });
  await expect.poll(() => state.walletTicketQueries).toBeGreaterThan(1);

  await expect(page.getByRole('link', { name: 'Adicionar cartão' })).toBeVisible();
  await expect(page.locator('.wallet-card-detail')).toHaveCount(0);
  await expect(page.getByText(ticket.name, { exact: true })).toHaveCount(0);
});

test('recovers and reconnects the replayable ticket stream after an SSE failure', async ({ page }) => {
  const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b4' });
  const state = createTicketApiState([ticket]);
  await mockTicketingApi(page, state);

  await page.goto('/app/profile/wallet');
  await expect(page.getByRole('button', { name: /Festa de encerramento/ })).toBeVisible();
  const initialWalletQueries = state.walletTicketQueries;
  state.walletTickets = [{ ...ticket, status: 'CONSUMED' }];
  await emitTicketSse(page, {
    revision: 'ticket-consumed-1',
    type: 'TICKETS_CHANGED',
    ticketId: ticket.id,
    changedAt: new Date().toISOString(),
  });
  await expect.poll(() => state.walletTicketQueries).toBeGreaterThan(initialWalletQueries);
  await expect(page.getByRole('button', { name: 'Ver 1 bilhetes expirados' })).toBeVisible();

  const disconnectDetails = await page.evaluate(() => {
    const inspect = (window as Window & { __inspectControlledTicketSse?: () => unknown }).__inspectControlledTicketSse;
    return inspect?.() ?? null;
  });
  expect(disconnectDetails).toEqual(expect.objectContaining({ onerror: true }));
  await expect.poll(() => state.recoveryQueries).toBe(1);
  await expect.poll(async () =>
    page.evaluate(() => (window as Window & { __controlledTicketSseCount?: number }).__controlledTicketSseCount ?? 0),
  ).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Ver 1 bilhetes expirados' }).click();
  await expect(page.getByText('Bilhete já utilizado')).toBeVisible();
});

test('transfer sender can submit a passport request and cancel it after the server response', async ({ page }) => {
  const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b1' });
  const state = createTicketApiState([ticket]);
  state.transfer = createTicketTransfer({
    id: 'transfer-sender-flow',
    ticket,
    recipient: null,
    submittedDestinationIdentityDocument: 'XK1234567',
    canCancel: true,
  });
  await mockTicketingApi(page, state);

  await page.goto(`/app/profile/wallet/tickets/${ticket.id}/transfer`);
  const identityInput = page.getByRole('textbox', { name: 'CPF ou passaporte' });
  await identityInput.fill('XK7654321');
  await page.getByRole('button', { name: 'Enviar bilhete' }).click();

  await expect(page.locator('.pending-document')).toHaveText('XK7654321');
  await expect(page.locator('.person-document')).toHaveText('XK1234567');
  await expect(page.getByText(
    'Seu nome completo e seu CPF parcialmente oculto ou o passaporte serão compartilhados com quem receber o bilhete.',
  )).toBeVisible();
  expect(state.graphqlRequests.find((item) => item.query.includes('mutation StartTicketTransfer'))?.variables).toEqual({
    ticketId: ticket.id,
    destinationIdentityDocument: 'XK7654321',
  });

  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('button', { name: 'Enviar bilhete' })).toBeDisabled();
  await expect(identityInput).toHaveValue('');
  expect(state.graphqlRequests.find((item) => item.query.includes('mutation cancelTicketTransfer'))?.variables).toEqual({
    transferId: state.transfer.id,
  });
});

test('recipient confirmation keeps the page open when eligibility changes before acceptance', async ({ page }) => {
  const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b2' });
  const transfer = createTicketTransfer({ id: 'transfer-recipient-race', ticket });
  const state = createTicketApiState([]);
  state.transfer = transfer;
  await mockTicketingApi(page, state);

  await page.goto(`/app/profile/wallet/ticket-transfers/${transfer.id}`);
  await page.getByRole('button', { name: 'Receber bilhete' }).click();
  await expect(page.getByRole('heading', { name: 'Receber bilhete?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Receber bilhete' }).click();

  await expect(page.getByText(/Você não era elegível para receber este bilhete/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/profile/wallet/ticket-transfers/${transfer.id}$`));
  expect(state.graphqlRequests.find((item) => item.query.includes('mutation acceptTicketTransfer'))?.variables).toEqual({
    transferId: transfer.id,
  });
});

test('recipient confirms an ignore decision and sees its final status', async ({ page }) => {
  const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b3' });
  const transfer = createTicketTransfer({ id: 'transfer-recipient-ignore', ticket });
  const state = createTicketApiState([]);
  state.transfer = transfer;
  await mockTicketingApi(page, state);

  await page.goto(`/app/profile/wallet/ticket-transfers/${transfer.id}`);
  await page.getByRole('button', { name: 'Ignorar' }).click();
  await expect(page.getByRole('heading', { name: 'Ignorar pedido?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Ignorar pedido' }).click();

  await expect(page.getByText(/Você ignorou este pedido/)).toBeVisible();
  expect(state.graphqlRequests.find((item) => item.query.includes('mutation ignoreTicketTransfer'))?.variables).toEqual({
    transferId: transfer.id,
  });
});

function createTicketApiState(walletTickets: WalletTicket[]): TicketApiState {
  return {
    walletTickets,
    transfer: null,
    outgoing: [],
    graphqlRequests: [],
    walletTicketQueries: 0,
    recoveryQueries: 0,
  };
}

async function mockTicketingApi(page: Page, state: TicketApiState): Promise<void> {
  await page.route('**/api/**', async (route) => {
    if (isUnleashRequest(route)) {
      await route.fulfill({ json: { toggles: [] } });
      return;
    }
    const path = apiPath(route);
    if (path === '/api/auth/me') {
      await route.fulfill({ json: authenticatedUserFixtureWithIdentity('XK1234567') });
      return;
    }
    if (path === '/api/graphql') {
      await fulfillTicketGraphql(route, state);
      return;
    }
    if (path === '/api/current-user/tickets/realtime/events') {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':\n\n' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfillTicketGraphql(route: Route, state: TicketApiState): Promise<void> {
  const body = route.request().postDataJSON() as { query?: unknown; variables?: unknown };
  const query = typeof body.query === 'string' ? body.query : '';
  const variables = isRecord(body.variables) ? body.variables : {};
  state.graphqlRequests.push({ query, variables });

  if (query.includes('TicketRealtimeRecoverySnapshot')) {
    state.recoveryQueries++;
    await fulfillGraphql(route, {
      myWalletTickets: state.walletTickets.map(({ id }) => ({ id })),
      myTicketTransfers: { incomingPending: [], incomingIgnored: [], outgoing: state.outgoing.map(({ id }) => ({ id })) },
    });
    return;
  }
  if (query.includes('query MyWalletTickets')) {
    state.walletTicketQueries++;
    await fulfillGraphql(route, { myWalletTickets: state.walletTickets });
    return;
  }
  if (query.includes('query MyWalletTicket')) {
    await fulfillGraphql(route, {
      myWalletTicket: state.walletTickets.find((ticket) => ticket.id === variables['ticketId']) ?? null,
    });
    return;
  }
  if (query.includes('query MyTicketTransfers')) {
    await fulfillGraphql(route, { myTicketTransfers: createTicketTransferLists({ outgoing: state.outgoing }) });
    return;
  }
  if (query.includes('query TicketTransfer')) {
    await fulfillGraphql(route, { ticketTransfer: state.transfer });
    return;
  }
  if (query.includes('mutation StartTicketTransfer')) {
    const transfer = createTicketTransfer({
      id: 'transfer-created-from-e2e',
      ticket: state.walletTickets.find((ticket) => ticket.id === variables['ticketId']) ?? createWalletTicket(),
      recipient: null,
      submittedDestinationIdentityDocument: String(variables['destinationIdentityDocument'] ?? ''),
      canCancel: true,
    });
    state.transfer = transfer;
    state.outgoing = [transfer];
    await fulfillGraphql(route, { startTicketTransfer: transfer });
    return;
  }
  if (query.includes('mutation cancelTicketTransfer')) {
    const transfer = requireTransfer(state);
    const updatedTransfer = { ...transfer, senderStatus: 'CANCELED' as const, canCancel: false };
    state.transfer = updatedTransfer;
    state.outgoing = [updatedTransfer];
    await fulfillGraphql(route, { cancelTicketTransfer: updatedTransfer });
    return;
  }
  if (query.includes('mutation acceptTicketTransfer')) {
    const transfer = requireTransfer(state);
    const updatedTransfer = {
      ...transfer,
      recipientStatus: 'SYSTEM_INELIGIBLE' as const,
      ignoreReason: 'INELIGIBLE' as const,
      canAccept: false,
    };
    state.transfer = updatedTransfer;
    await fulfillGraphql(route, { acceptTicketTransfer: updatedTransfer });
    return;
  }
  if (query.includes('mutation ignoreTicketTransfer')) {
    const transfer = requireTransfer(state);
    const updatedTransfer = {
      ...transfer,
      recipientStatus: 'IGNORED' as const,
      ignoreReason: 'USER_IGNORED' as const,
      canAccept: false,
    };
    state.transfer = updatedTransfer;
    await fulfillGraphql(route, { ignoreTicketTransfer: updatedTransfer });
    return;
  }

  await fulfillGraphql(route, {});
}

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
}

async function emitTicketSse(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((eventPayload) => {
    const emit = (window as Window & { __emitControlledTicketSse?: (payload: Record<string, unknown>) => void })
      .__emitControlledTicketSse;
    emit?.(eventPayload);
  }, payload);
}

function installControlledEventSource(): void {
  type MessageHandler = ((event: MessageEvent<string>) => void) | null;
  class ControlledEventSource {
    static readonly CLOSED = 2;
    static readonly OPEN = 1;
    static readonly instances: ControlledEventSource[] = [];
    onmessage: MessageHandler = null;
    onerror: ((event: Event) => void) | null = null;
    readyState = ControlledEventSource.OPEN;

    constructor(readonly url: string) {
      ControlledEventSource.instances.push(this);
    }

    close(): void {
      this.readyState = ControlledEventSource.CLOSED;
    }
  }

  Object.defineProperty(window, 'EventSource', { configurable: true, value: ControlledEventSource });
  Object.defineProperty(window, '__emitControlledTicketSse', {
    configurable: true,
    value: (payload: Record<string, unknown>) => {
      const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
      ControlledEventSource.instances
        .filter((source) => source.url.endsWith('/api/current-user/tickets/realtime/events'))
        .forEach((source) => source.onmessage?.(event));
    },
  });
  Object.defineProperty(window, '__controlledTicketSseCount', {
    configurable: true,
    get: () => ControlledEventSource.instances.filter((source) =>
      source.url.endsWith('/api/current-user/tickets/realtime/events'),
    ).length,
  });
  Object.defineProperty(window, '__inspectControlledTicketSse', {
    configurable: true,
    value: () => {
      const source = ControlledEventSource.instances
        .filter((item) => item.url.endsWith('/api/current-user/tickets/realtime/events'))
        .at(-1);
      if (!source) return null;
      const state = {
        url: source.url,
        readyState: source.readyState,
        onmessage: Boolean(source.onmessage),
        onerror: Boolean(source.onerror),
      };
      if (source.onerror) {
        source.readyState = ControlledEventSource.CLOSED;
        source.onerror(new Event('error'));
      }
      return state;
    },
  });
}

function requireTransfer(state: TicketApiState): TicketTransfer {
  if (!state.transfer) throw new Error('Ticket transfer fixture is required for this mutation.');
  return state.transfer;
}

function authenticatedUserFixtureWithIdentity(identityDocument: string): Record<string, unknown> {
  const user = authenticatedUserFixture();
  const claims = isRecord(user['claims']) ? user['claims'] : {};
  return {
    ...user,
    claims: { ...claims, identity_document: identityDocument },
  };
}

function apiPath(route: Route): string {
  return new URL(route.request().url()).pathname.replace(/^\/app(?=\/api\/)/, '');
}

function isUnleashRequest(route: Route): boolean {
  const url = new URL(route.request().url());
  return url.hostname === 'unleash.cacic.com.br' && url.pathname.startsWith('/api/frontend/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
