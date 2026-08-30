import type { Page, Route } from '@playwright/test';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { expect, test } from './support/e2e-test';
import { authenticatedUserFixture } from './support/authenticated-user.fixture';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.addInitScript(installControlledEventSource);
});

test('refetches event-scoped availability after SSE invalidation without accepting another scope', async ({ page }) => {
  const availabilityVariables: Array<Record<string, unknown>> = [];
  let availableDraws = false;
  await page.route('**/api/**', async (route) => {
    await fulfillRealtimeApi(route, {
      availabilityVariables,
      getAvailableDraws: () => availableDraws,
    });
  });

  await page.goto('/app/event/realtime-event');
  await expect(page.getByRole('heading', { name: 'Evento em tempo real' })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => availabilityVariables.length).toBe(1);

  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigations += 1;
    }
  });

  await emitSse(page, '/api/prize-draws/public/events/unrelated-event/events', {
    type: 'PRIZE_DRAW_INVALIDATED',
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  expect(availabilityVariables).toHaveLength(1);
  await expect(page.getByText('Sorteios')).toHaveCount(0);

  availableDraws = true;
  await emitSse(page, '/api/realtime/public/catalog/events', {
    type: 'PUBLIC_CATALOG_INVALIDATED',
  });

  await expect.poll(() => availabilityVariables.length).toBe(2);
  await expect(page.getByText('Sorteios')).toBeVisible();
  expect(availabilityVariables[1]).toEqual({ eventIds: ['realtime-event'] });

  availableDraws = false;
  await emitSse(page, '/api/prize-draws/public/events/unrelated-event/events', {
    type: 'PRIZE_DRAW_INVALIDATED',
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  expect(availabilityVariables).toHaveLength(2);

  await emitSse(page, '/api/prize-draws/public/events/realtime-event/events', {
    type: 'PRIZE_DRAW_INVALIDATED',
    targetType: 'EVENT',
    targetId: 'realtime-event',
  });
  await expect.poll(() => availabilityVariables.length).toBe(3);
  await expect(page.getByText('Sorteios')).toHaveCount(0);
  expect(mainFrameNavigations).toBe(0);
});

async function emitSse(page: Page, url: string, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ url: eventSourceUrl, payload: eventPayload }) => {
      const emit = (
        globalThis as typeof globalThis & {
          __emitControlledSse?: (url: string, payload: Record<string, unknown>) => void;
        }
      ).__emitControlledSse;
      emit?.(eventSourceUrl, eventPayload);
    },
    { url, payload },
  );
}

async function fulfillRealtimeApi(
  route: Route,
  state: {
    availabilityVariables: Array<Record<string, unknown>>;
    getAvailableDraws: () => boolean;
  },
): Promise<void> {
  const url = new URL(route.request().url());
  const apiPath = url.pathname.replace(/^\/app(?=\/api\/)/, '');

  if (apiPath === '/api/auth/me') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authenticatedUserFixture()),
    });
    return;
  }

  if (apiPath === '/api/graphql') {
    const body = route.request().postDataJSON() as { query?: unknown; variables?: unknown };
    const query = typeof body.query === 'string' ? body.query : '';
    const variables = isRecord(body.variables) ? body.variables : {};

    if (query.includes('query PublicEventPage')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            publicEvent: realtimeEventFixture(),
            publicEventSubscriptionSummary: {
              eventId: 'realtime-event',
              hasAvailableSlots: true,
              availableSlots: 1,
              projectedQueuePosition: 1,
            },
            publicEventWeather: null,
          },
        }),
      });
      return;
    }

    if (query.includes('query PublicPrizeDrawAvailability')) {
      state.availabilityVariables.push(variables);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            publicPrizeDrawAvailability: state.getAvailableDraws()
              ? [{ targetType: 'EVENT', targetId: 'realtime-event', drawCount: 1 }]
              : [],
          },
        }),
      });
      return;
    }
  }

  await route.fulfill({ status: 204, body: '' });
}

function realtimeEventFixture() {
  return createPublicEvent({
    id: 'realtime-event',
    name: 'Evento em tempo real',
    startDate: publicFixtureDateFromNow(1, 18),
    endDate: publicFixtureDateFromNow(1, 20),
    description: 'Evento usado para verificar atualizações ao vivo.',
    shortDescription: 'Evento de teste de atualizações ao vivo.',
    allowSubscription: false,
    latitude: null,
    longitude: null,
    locationDescription: 'Laboratório de testes',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function installControlledEventSource(): void {
  type MessageHandler = ((event: MessageEvent<string>) => void) | null;

  class ControlledEventSource {
    static readonly CLOSED = 2;
    static readonly OPEN = 1;
    static readonly instances: ControlledEventSource[] = [];

    onmessage: MessageHandler = null;
    onerror: ((event: Event) => void) | null = null;
    readonly readyState = ControlledEventSource.OPEN;

    constructor(
      readonly url: string,
      readonly init?: EventSourceInit,
    ) {
      ControlledEventSource.instances.push(this);
    }

    close(): void {
      // The test only needs to model delivery; no browser connection exists.
    }
  }

  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    value: ControlledEventSource,
  });
  Object.defineProperty(globalThis, '__emitControlledSse', {
    configurable: true,
    value: (url: string, payload: Record<string, unknown>) => {
      const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
      ControlledEventSource.instances
        .filter((source) => source.url === url)
        .forEach((source) => source.onmessage?.(event));
    },
  });
}
