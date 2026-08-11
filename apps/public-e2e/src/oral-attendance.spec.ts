import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import { fulfillCurrentUserDefaultRedirect } from './support/current-user-default-redirect';

test.use({
  geolocation: { latitude: -22.1211, longitude: -51.4086, accuracy: 12 },
  permissions: ['geolocation'],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    // Playwright Chromium can be classified as private by detectincognitojs.
    // This flow tests oral attendance, not the separate privacy warning dialog.
    window.sessionStorage.setItem('cacic-eventos:attendance-incognito-warning-shown', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
});

test('chooses oral attendance, loads the full roster, and submits a decision with location', async ({ page }) => {
  const submittedBatches: unknown[][] = [];
  await mockOralAttendanceApi(page, submittedBatches);

  await page.goto('/app/attendance/collect/event-1/method');

  await expect(page.getByRole('heading', { name: 'Como você quer coletar?' })).toBeVisible();
  await page.getByRole('link', { name: 'Fazer chamada oral' }).click();
  await expect(page.getByRole('heading', { name: 'Credenciamento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana Beatriz Silva' })).toBeVisible();

  await page.getByRole('button', { name: 'Marcar como presente' }).click();

  await expect.poll(() => submittedBatches.length).toBe(1);
  expect(submittedBatches[0]).toEqual([
    expect.objectContaining({
      eventId: 'event-1',
      personId: 'person-1',
      status: 'PRESENT',
      collectedAt: expect.any(String),
      location: {
        latitude: -22.1211,
        longitude: -51.4086,
        accuracyMeters: 12,
      },
    }),
  ]);
});

async function mockOralAttendanceApi(page: Page, submittedBatches: unknown[][]): Promise<void> {
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) => route.fulfill({ status: 304, body: '' }));
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
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':\n\n' });
      return;
    }
    if (url.pathname === '/api/graphql') {
      await fulfillGraphql(route, submittedBatches);
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfillGraphql(route: Route, submittedBatches: unknown[][]): Promise<void> {
  const body = route.request().postDataJSON() as {
    query: string;
    variables?: { inputs?: unknown[] };
  };
  if (await fulfillCurrentUserDefaultRedirect(route, body.query, 'MENU')) {
    return;
  }
  if (body.query.includes('query CurrentUserAttendanceCollectionEvents')) {
    await fulfillData(route, {
      currentUserAttendanceCollectionEvents: [
        {
          eventId: 'event-1',
          event: {
            id: 'event-1',
            name: 'Credenciamento',
            startDate: new Date(Date.now() - 60_000).toISOString(),
            endDate: new Date(Date.now() + 60 * 60_000).toISOString(),
            emoji: '✅',
            type: 'OTHER',
            locationDescription: 'Auditório',
            shouldAllowOralAttendance: true,
          },
        },
      ],
    });
    return;
  }
  if (body.query.includes('query CurrentUserAttendanceOralRoster')) {
    await fulfillData(route, {
      currentUserAttendanceOralRoster: [
        {
          personId: 'person-1',
          eventId: 'event-1',
          fullName: 'Ana Beatriz Silva',
          identityDocument: '•••.982.247-••',
          unespRole: 'Graduação',
          subscriptionStatus: 'CONFIRMED',
          status: null,
        },
      ],
    });
    return;
  }
  if (body.query.includes('mutation CollectCurrentUserOralAttendances')) {
    submittedBatches.push(body.variables?.inputs ?? []);
    await fulfillData(route, {
      collectCurrentUserOralAttendances: [
        {
          eventId: 'event-1',
          personId: 'person-1',
          attendedAt: new Date().toISOString(),
          category: 'REGULAR',
        },
      ],
    });
    return;
  }
  await fulfillData(route, {});
}

async function fulfillData(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}

function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: { roles: [] },
    sub: 'collector-1',
    preferredUsername: 'coletora.teste',
    email: 'coletora@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Coletora Teste',
      picture: null,
    },
  };
}
