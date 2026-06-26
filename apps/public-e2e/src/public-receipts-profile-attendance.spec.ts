import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createPublicEvent,
  createPublicMajorEvent,
  createPublicMajorEventPrice,
  createPublicPaymentInfo,
} from '@cacic-fct/event-manager-public-testing';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
  await mockStaticExternalAssets(page);
});

test('opens a paid major event payment page and sends a receipt through the mocked upload endpoint', async ({ page }) => {
  const api = await mockPublicApi(page);

  await page.goto('/app/major-event');

  await expect(page.getByText('SECOMPP Pago')).toBeVisible();
  await page.getByRole('link', { name: 'Enviar comprovante' }).click();

  await expect(page.getByRole('heading', { name: 'SECOMPP Pago' })).toBeVisible();
  await expect(page.getByText('Aguardando envio de comprovante')).toBeVisible();

  await page
    .locator('input[aria-label="Enviar imagem do comprovante de pagamento"]')
    .setInputFiles({
      name: 'comprovante.png',
      mimeType: 'image/png',
      buffer: pngFixture(),
    });
  await expect(page.getByRole('heading', { name: 'Confirmar comprovante' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByText('Comprovante enviado.')).toBeVisible();
  await expect(page.getByText('Comprovante em análise')).toBeVisible();
  await expect(page.getByAltText('Comprovante enviado')).toBeVisible();
  expect(api.receiptUploads()).toEqual([
    expect.objectContaining({
      majorEventId: 'paid-major',
      contentType: expect.stringContaining('multipart/form-data'),
      body: expect.stringContaining('comprovante.png'),
    }),
  ]);
});

test('lists current-user subscriptions and downloads the certificate archive', async ({ page }) => {
  const api = await mockPublicApi(page);

  await page.goto('/app/profile/attendances');

  await expect(page.getByRole('heading', { name: 'Minhas participações' })).toBeVisible();
  await expect(page.getByText('SECOMPP Pago')).toBeVisible();
  await expect(page.getByText('Oficina pública')).toBeVisible();

  await page.getByRole('button', { name: 'Baixar todos os certificados' }).click();

  await expect(page.getByText('Download dos certificados iniciado.')).toBeVisible();
  expect(api.certificateArchiveDownloads()).toBe(1);
});

test('confirms online attendance from the pending attendance list', async ({ page }) => {
  const api = await mockPublicApi(page, { pendingOnlineAttendance: true });

  await page.goto('/app/attendance/register');

  await expect(page.getByText('Presenças pendentes')).toBeVisible();
  await page.getByRole('link', { name: 'Confirmar presença em Presença on-line' }).click();
  await page.locator('#attendance-code').fill('a1b2');
  await page.getByRole('button', { name: 'Confirmar' }).click();

  await expect(page.getByText('Presença confirmada.')).toBeVisible();
  expect(api.onlineAttendanceConfirmations()).toEqual([{ eventId: 'online-event', code: 'A1B2' }]);
});

async function preventSilentSso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
}

async function mockStaticExternalAssets(page: Page): Promise<void> {
  await page.route('https://unleash.cacic.dev.br/api/frontend/**', (route) =>
    route.fulfill({
      status: 304,
      body: '',
    }),
  );
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    }),
  );
}

async function mockPublicApi(
  page: Page,
  options: { pendingOnlineAttendance?: boolean } = {},
): Promise<{
  certificateArchiveDownloads: () => number;
  onlineAttendanceConfirmations: () => Array<{ eventId: string; code: string }>;
  receiptUploads: () => Array<{ majorEventId: string; contentType: string; body: string }>;
}> {
  let certificateArchiveDownloads = 0;
  let onlineAttendanceConfirmed = false;
  const onlineAttendanceConfirmations: Array<{ eventId: string; code: string }> = [];
  const receiptUploads: Array<{ majorEventId: string; contentType: string; body: string }> = [];

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authenticatedUserFixture()),
      });
      return;
    }

    if (url.pathname === '/api/current-user/events/realtime') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ':\n\n',
      });
      return;
    }

    if (url.pathname === '/api/major-event-receipts/major-events/paid-major') {
      receiptUploads.push({
        majorEventId: 'paid-major',
        contentType: route.request().headers()['content-type'] ?? '',
        body: route.request().postDataBuffer()?.toString('utf8') ?? '',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(receiptFixture()),
      });
      return;
    }

    if (url.pathname === '/api/major-event-receipts/receipt-1/image') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pngFixture(),
      });
      return;
    }

    if (url.pathname === '/api/graphql') {
      await fulfillGraphql(route, {
        certificateArchiveDownloads: () => {
          certificateArchiveDownloads++;
        },
        getOnlineAttendanceConfirmed: () => onlineAttendanceConfirmed,
        setOnlineAttendanceConfirmed: (nextValue) => {
          onlineAttendanceConfirmed = nextValue;
        },
        hasPendingOnlineAttendance: () => options.pendingOnlineAttendance === true,
        onlineAttendanceConfirmations,
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });

  return {
    certificateArchiveDownloads: () => certificateArchiveDownloads,
    onlineAttendanceConfirmations: () => onlineAttendanceConfirmations,
    receiptUploads: () => receiptUploads,
  };
}

async function fulfillGraphql(
  route: Route,
  state: {
    certificateArchiveDownloads: () => void;
    getOnlineAttendanceConfirmed: () => boolean;
    setOnlineAttendanceConfirmed: (nextValue: boolean) => void;
    hasPendingOnlineAttendance: () => boolean;
    onlineAttendanceConfirmations: Array<{ eventId: string; code: string }>;
  },
): Promise<void> {
  const body = parseGraphqlRequest(route);
  const query = body.query;
  const variables = body.variables;

  if (query.includes('query PublicMajorEvents')) {
    await fulfillGraphqlData(route, {
      publicMajorEvents: [paidMajorEventFixture()],
    });
    return;
  }

  if (query.includes('query CurrentUserMajorEventSubscriptions')) {
    await fulfillGraphqlData(route, {
      currentUserMajorEventSubscriptions: [majorEventSubscriptionFixture('WAITING_RECEIPT_UPLOAD')],
    });
    return;
  }

  if (query.includes('query CurrentUserMajorEventSubscription(')) {
    await fulfillGraphqlData(route, {
      currentUserMajorEventSubscription: majorEventSubscriptionFixture('WAITING_RECEIPT_UPLOAD'),
    });
    return;
  }

  if (query.includes('query CurrentUserMajorEventReceipt')) {
    await fulfillGraphqlData(route, {
      currentUserMajorEventReceipt: null,
    });
    return;
  }

  if (query.includes('query CurrentUserSubscriptionsFeed')) {
    await fulfillGraphqlData(route, subscriptionsFeedFixture());
    return;
  }

  if (query.includes('query DownloadCurrentUserCertificatesArchive')) {
    state.certificateArchiveDownloads();
    await fulfillGraphqlData(route, {
      downloadCurrentUserCertificatesArchive: {
        fileName: 'certificados.zip',
        mimeType: 'application/zip',
        contentBase64: 'UEs=',
      },
    });
    return;
  }

  if (query.includes('query CurrentUserPendingOnlineAttendanceEvents')) {
    await fulfillGraphqlData(route, {
      currentUserPendingOnlineAttendanceEvents: state.getOnlineAttendanceConfirmed() || !state.hasPendingOnlineAttendance()
        ? []
        : [
            {
              eventId: 'online-event',
              event: onlineAttendanceEventFixture(),
            },
          ],
    });
    return;
  }

  if (query.includes('mutation ConfirmCurrentUserOnlineAttendance')) {
    const eventId = stringVariable(variables, 'eventId');
    const code = stringVariable(variables, 'code');
    state.onlineAttendanceConfirmations.push({ eventId, code });
    state.setOnlineAttendanceConfirmed(true);
    await fulfillGraphqlData(route, {
      confirmCurrentUserOnlineAttendance: {
        eventId,
        attendedAt: '2026-06-26T12:10:00.000Z',
        createdAt: '2026-06-26T12:10:00.000Z',
      },
    });
    return;
  }

  await fulfillGraphqlData(route, {});
}

function parseGraphqlRequest(route: Route): { query: string; variables: Record<string, unknown> } {
  const body = route.request().postDataJSON() as unknown;
  if (!isRecord(body)) {
    return { query: '', variables: {} };
  }

  const variables = isRecord(body['variables']) ? body['variables'] : {};
  return {
    query: typeof body['query'] === 'string' ? body['query'] : '',
    variables,
  };
}

async function fulfillGraphqlData(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}

function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'usuario.teste',
    email: 'usuario.teste@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Usuário Teste',
      picture: null,
    },
  };
}

function paidMajorEventFixture(): Record<string, unknown> {
  return createPublicMajorEvent({
    id: 'paid-major',
    name: 'SECOMPP Pago',
    emoji: '💳',
    startDate: '2027-08-01T12:00:00.000Z',
    endDate: '2027-08-03T21:00:00.000Z',
    description: 'Grande evento com comprovante obrigatório.',
    subscriptionStartDate: '2026-01-01T00:00:00.000Z',
    subscriptionEndDate: '2027-07-31T23:59:00.000Z',
    isPaymentRequired: true,
    paymentInfo: createPublicPaymentInfo({
      id: 'payment-paid-major',
      majorEventId: 'paid-major',
      bankName: 'Banco Teste',
      pixKey: 'pagamentos@cacic.dev.br',
    }),
    majorEventPrices: [
      createPublicMajorEventPrice({
        id: 'price-paid-major',
        type: 'SINGLE',
        tiers: [{ id: 'tier-student', name: 'Estudante', value: 2500 }],
      }),
    ],
    buttonText: null,
    buttonLink: null,
  });
}

function majorEventSubscriptionFixture(subscriptionStatus: string): Record<string, unknown> {
  return {
    id: 'paid-subscription',
    majorEventId: 'paid-major',
    subscriptionStatus,
    amountPaid: 2500,
    paymentDate: null,
    paymentTier: 'Estudante',
    majorEvent: paidMajorEventFixture(),
    selectedEvents: [],
    notSubscribedEvents: [],
  };
}

function receiptFixture(): Record<string, unknown> {
  return {
    id: 'receipt-1',
    fileName: 'comprovante.png',
    mimeType: 'image/png',
    sizeBytes: 128,
    uploadedAt: '2026-06-26T12:00:00.000Z',
    expiresAt: '2027-06-26T12:00:00.000Z',
    imageUrl: '/api/major-event-receipts/receipt-1/image',
    processingStatus: 'PENDING',
    amountMatched: null,
    nameMatched: null,
  };
}

function subscriptionsFeedFixture(): Record<string, unknown> {
  return {
    currentUserMajorEventFeed: [
      {
        id: 'paid-subscription',
        majorEventId: 'paid-major',
        subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
        amountPaid: 2500,
        paymentDate: null,
        paymentTier: 'Estudante',
        majorEvent: paidMajorEventFixture(),
        participation: {
          isSubscribed: true,
          isLecturer: false,
          hasIssuedCertificate: true,
        },
      },
    ],
    currentUserSubscriptionFeed: {
      items: [
        {
          type: 'SINGLE_EVENT',
          subscriptionId: 'event-subscription-1',
          eventId: 'standalone-event',
          date: '2027-08-01T14:00:00.000Z',
          createdAt: '2026-06-26T12:00:00.000Z',
          event: createPublicEvent({
            id: 'standalone-event',
            name: 'Oficina pública',
            emoji: '💻',
            startDate: '2027-08-01T14:00:00.000Z',
            endDate: '2027-08-01T16:00:00.000Z',
            majorEvent: null,
          }),
          participation: {
            isSubscribed: true,
            isLecturer: false,
            hasIssuedCertificate: true,
          },
        },
      ],
    },
    currentUserEventAttendances: [
      {
        eventId: 'standalone-event',
        attendedAt: '2027-08-01T14:30:00.000Z',
      },
    ],
  };
}

function onlineAttendanceEventFixture(): Record<string, unknown> {
  return createPublicEvent({
    id: 'online-event',
    name: 'Presença on-line',
    emoji: '✅',
    startDate: '2027-08-01T14:00:00.000Z',
    endDate: '2027-08-01T16:00:00.000Z',
    majorEvent: {
      id: 'paid-major',
      name: 'SECOMPP Pago',
    } as never,
  });
}

function pngFixture(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde,
  ]);
}

function stringVariable(variables: Record<string, unknown>, key: string): string {
  const value = variables[key];
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
