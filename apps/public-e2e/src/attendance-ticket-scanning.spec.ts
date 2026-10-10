import type { Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import { authenticatedUserFixture } from './support/authenticated-user.fixture';
import { TICKET_FIXTURE_HOLDER_USER_ID } from '@cacic-fct/shared-ticketing/testing';

test('routes a ticket barcode through the existing scanner attendance mutation', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -22.12, longitude: -51.4, accuracy: 12 });

  const scanRequests: Array<{ eventId: string; code: string; location: Record<string, unknown> }> = [];
  await page.route('**/api/**', async (route) => {
    const path = apiPath(route);
    if (isUnleashRequest(route)) {
      await route.fulfill({ json: { toggles: [] } });
      return;
    }
    if (path === '/api/auth/me') {
      await route.fulfill({ json: authenticatedUserFixture() });
      return;
    }
    if (path === '/api/graphql') {
      await fulfillCollectionGraphql(route, scanRequests);
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/app/attendance/collect/event-1/scanner');
  await expect(page.getByRole('heading', { name: 'Credenciamento' })).toBeVisible();
  await expect(page.locator('lib-aztec-scanner')).toBeVisible();

  await page.evaluate((barcode) => {
    const angularDebug = (window as unknown as { ng?: { getComponent(target: Element): unknown } }).ng;
    const scannerElement = document.querySelector('lib-aztec-scanner');
    if (!angularDebug || !scannerElement) throw new Error('The routed scanner component is not available.');
    const scanner = angularDebug.getComponent(scannerElement) as { scan?: { emit(value: string): void } };
    if (!scanner.scan) throw new Error('The scanner output is not available.');
    scanner.scan.emit(barcode);
  }, `ticket:018f47a1-3d5b-7abc-8def-0123456789ab:${TICKET_FIXTURE_HOLDER_USER_ID}`);

  await expect(page.getByText('Presença registrada.')).toBeVisible();
  await expect.poll(() => scanRequests).toHaveLength(1);
  expect(scanRequests[0]).toEqual(expect.objectContaining({
    eventId: 'event-1',
    code: `user:${TICKET_FIXTURE_HOLDER_USER_ID}`,
    location: expect.objectContaining({ latitude: -22.12, longitude: -51.4 }),
  }));
});

async function fulfillCollectionGraphql(
  route: Route,
  scanRequests: Array<{ eventId: string; code: string; location: Record<string, unknown> }>,
): Promise<void> {
  const body = route.request().postDataJSON() as { query?: unknown; variables?: unknown };
  const query = typeof body.query === 'string' ? body.query : '';
  const variables = isRecord(body.variables) ? body.variables : {};
  if (query.includes('CurrentUserAttendanceCollectionEvents')) {
    await fulfillGraphql(route, {
      currentUserAttendanceCollectionEvents: [collectionEvent()],
    });
    return;
  }
  if (query.includes('CurrentUserAttendanceCollectionFeed')) {
    await fulfillGraphql(route, { currentUserAttendanceCollectionFeed: [] });
    return;
  }
  if (query.includes('CollectCurrentUserAttendanceFromScannerCode')) {
    const input = isRecord(variables['input']) ? variables['input'] : {};
    scanRequests.push({
      eventId: String(input['eventId'] ?? ''),
      code: String(input['code'] ?? ''),
      location: isRecord(input['location']) ? input['location'] : {},
    });
    await fulfillGraphql(route, {
      collectCurrentUserAttendanceFromScannerCode: {
        eventId: 'event-1',
        personId: 'person-1',
        attendedAt: new Date().toISOString(),
        category: 'REGULAR',
        currentAssessment: null,
      },
    });
    return;
  }
  await fulfillGraphql(route, {});
}

function collectionEvent() {
  const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return {
    eventId: 'event-1',
    offlineCollectorCredential: 'signed-collector-proof',
    event: {
      id: 'event-1',
      name: 'Credenciamento',
      startDate: startsAt,
      endDate: endsAt,
      emoji: '🎟️',
      type: 'OTHER',
      locationDescription: 'Entrada principal',
      onlineAttendanceStartDate: startsAt,
      onlineAttendanceEndDate: endsAt,
      shouldAllowOralAttendance: false,
      majorEventId: null,
      eventGroupId: null,
      majorEvent: null,
      eventGroup: null,
    },
  };
}

async function fulfillGraphql(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
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
