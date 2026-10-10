import type { Page, Route } from '@playwright/test';
import { createTicketPurchase, createTicketPurchaseOption, createTicketPurchaseReceipt } from '@cacic-fct/shared-ticketing/testing';
import type { TicketPurchase, TicketPurchaseOption } from '@cacic-fct/shared-ticketing';
import { expect, test } from './support/e2e-test';
import { authenticatedUserFixture } from './support/authenticated-user.fixture';

type PaymentApiState = {
  option: TicketPurchaseOption;
  purchases: TicketPurchase[];
  uploadResult: 'success' | 'failure';
  uploads: Array<{ path: string; body: string; contentType: string }>;
  subscriptionReceiptQueries: number;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
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

test('uploads a tier-priced ticket receipt through the ticket purchase endpoint', async ({ page }) => {
  const state = createPaymentApiState();
  await mockPaymentApi(page, state);

  await page.goto(paymentUrl(2500));
  await expect(page.getByRole('heading', { name: 'Festa de encerramento' })).toBeVisible();
  await expect(page.getByText('R$ 25,00')).toBeVisible();
  await expect(page.getByText('A compra só será registrada depois que o envio do comprovante for concluído.')).toBeVisible();

  await uploadReceipt(page);

  await expect(page.getByText('Comprovante em análise')).toBeVisible();
  await expect(page.getByText('O comprovante do bilhete foi enviado e está vinculado a esta compra.')).toBeVisible();
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0]).toEqual(expect.objectContaining({
    path: '/api/ticket-purchases/party-event/receipt',
    contentType: expect.stringContaining('multipart/form-data'),
    body: expect.stringContaining('ticket-config-e2e'),
  }));
  expect(state.uploads[0].body).toContain('expectedAmountCents');
  expect(state.subscriptionReceiptQueries).toBe(0);
});

test('keeps a fixed-price offer disabled when its linked amount changes', async ({ page }) => {
  const state = createPaymentApiState();
  state.option = createTicketPurchaseOption({
    ...state.option,
    amountCents: 3000,
    priceTierId: null,
    priceTierName: null,
  });
  await mockPaymentApi(page, state);

  await page.goto(paymentUrl(2500));
  await expect(page.getByText('R$ 30,00')).toBeVisible();
  await expect(page.getByText(/O valor deste bilhete foi atualizado/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar comprovante' })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect(state.uploads).toHaveLength(0);
});

test('shows upload errors and leaves the rejected ticket receipt available for another attempt', async ({ page }) => {
  const state = createPaymentApiState();
  state.uploadResult = 'failure';
  state.purchases = [createTicketPurchase({
    id: 'rejected-ticket-purchase',
    eventId: 'party-event',
    majorEventId: 'major-1',
    ticketConfigId: 'ticket-config-e2e',
    name: 'Festa de encerramento',
    amountCents: 2500,
    status: 'REJECTED',
    rejectionReason: 'O comprovante está ilegível.',
  })];
  await mockPaymentApi(page, state);

  await page.goto(paymentUrl(2500));
  await expect(page.getByText('Comprovante rejeitado')).toBeVisible();
  await uploadReceipt(page);

  await expect(page.getByText('O comprovante está indisponível no momento.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar novo comprovante' })).toBeEnabled();
  expect(state.uploads).toHaveLength(1);
});

function createPaymentApiState(): PaymentApiState {
  return {
    option: createTicketPurchaseOption({
      eventId: 'party-event',
      majorEventId: 'major-1',
      ticketConfigId: 'ticket-config-e2e',
      name: 'Festa de encerramento',
      emoji: '🎉',
      amountCents: 2500,
      priceTierId: 'student-tier',
      priceTierName: 'Estudante',
      event: { id: 'party-event', name: 'Festa de encerramento', emoji: '🎉' },
    }),
    purchases: [],
    uploadResult: 'success',
    uploads: [],
    subscriptionReceiptQueries: 0,
  };
}

async function mockPaymentApi(page: Page, state: PaymentApiState): Promise<void> {
  await page.route('**/api/**', async (route) => {
    if (isUnleashRequest(route)) {
      await route.fulfill({ json: { toggles: [] } });
      return;
    }
    const path = apiPath(route);
    if (path === '/api/auth/me') {
      await route.fulfill({ json: authenticatedUserFixture() });
      return;
    }
    if (path === '/api/graphql') {
      await fulfillPaymentGraphql(route, state);
      return;
    }
    if (path === '/api/ticket-purchases/party-event/receipt') {
      state.uploads.push({
        path,
        body: route.request().postDataBuffer()?.toString('utf8') ?? '',
        contentType: route.request().headers()['content-type'] ?? '',
      });
      if (state.uploadResult === 'failure') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'O comprovante está indisponível no momento.' }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...createTicketPurchaseReceipt({
            id: 'receipt-uploaded-e2e',
            imageUrl: '/api/ticket-purchases/purchase-created-e2e/receipt',
          }),
          purchaseId: 'purchase-created-e2e',
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfillPaymentGraphql(route: Route, state: PaymentApiState): Promise<void> {
  const request = route.request().postDataJSON() as { query?: unknown };
  const query = typeof request.query === 'string' ? request.query : '';
  if (query.includes('CurrentUserMajorEventSubscription')) {
    await fulfillGraphql(route, {
      currentUserMajorEventSubscription: {
        id: 'subscription-e2e',
        majorEventId: 'major-1',
        subscriptionStatus: 'CONFIRMED',
        paymentTier: 'Estudante',
        amountPaid: 10000,
        paymentDate: null,
        imageLicenseAgreementAccepted: true,
        majorEvent: {
          id: 'major-1',
          name: 'Congresso de Computação',
          emoji: '🎓',
          isPaymentRequired: true,
          paymentInfo: null,
          majorEventPrices: [],
          additionalPaymentInfo: null,
        },
        selectedEvents: [],
      },
    });
    return;
  }
  if (query.includes('myTicketPurchaseOptions')) {
    await fulfillGraphql(route, { myTicketPurchaseOptions: [state.option] });
    return;
  }
  if (query.includes('myTicketPurchases')) {
    await fulfillGraphql(route, { myTicketPurchases: state.purchases });
    return;
  }
  if (query.includes('CurrentUserReceipt')) {
    state.subscriptionReceiptQueries++;
  }
  await fulfillGraphql(route, {});
}

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
}

async function uploadReceipt(page: Page): Promise<void> {
  await page.locator('input[aria-label="Enviar imagem ou PDF do comprovante de pagamento"]').setInputFiles({
    name: 'comprovante.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('representative payment receipt'),
  });
  await expect(page.getByRole('heading', { name: 'Confirmar comprovante' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('comprovante.pdf')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar', exact: true }).click();
}

function paymentUrl(expectedAmountCents: number): string {
  return `/app/major-event/major-1/payment/ticket/party-event?ticketConfigId=ticket-config-e2e&expectedAmountCents=${expectedAmountCents}`;
}

function apiPath(route: Route): string {
  return new URL(route.request().url()).pathname.replace(/^\/app(?=\/api\/)/, '');
}

function isUnleashRequest(route: Route): boolean {
  const url = new URL(route.request().url());
  return url.hostname === 'unleash.cacic.com.br' && url.pathname.startsWith('/api/frontend/');
}
