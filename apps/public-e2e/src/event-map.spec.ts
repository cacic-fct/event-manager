import type { BrowserContext, Page, Route } from '@playwright/test';
import { createPublicEvent } from '@cacic-fct/event-manager-public-testing';
import { expect, test } from './support/e2e-test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await mockExternalMapAssets(page);
});

test('opens the fullscreen event map, navigates through a Twemoji marker, and returns with filters preserved', async ({
  page,
}) => {
  await mockMapApi(page, { authenticated: true, mine: ['map-event-1'] });
  await openMap(page);

  await expect(page.getByRole('heading', { name: 'Mapa de eventos' })).toBeVisible();
  await expect(page.locator('.map-target canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir utilitários do mapa' }).click();
  await page.getByRole('button', { name: 'Filtrar eventos' }).click();
  await page.getByRole('radio', { name: 'Meus eventos' }).click();
  await page.getByRole('radio', { name: 'Eventos de hoje' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/participacao=meus/);
  await expect(page).toHaveURL(/periodo=hoje/);

  await clickMapMarker(page, 'map-event-1');

  await expect(page).toHaveURL(/\/app\/event\/map-event-1/);
  await expect(page.getByRole('heading', { name: 'Evento no mapa' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Voltar' }).click();

  await expect(page).toHaveURL(/\/app\/map/);
  await expect(page).toHaveURL(/participacao=meus/);
  await expect(page).toHaveURL(/periodo=hoje/);
});

test('does not request location until the current-location control is pressed and stops tracking on page exit', async ({
  context,
  page,
}) => {
  await installGeolocationProbe(context, page);
  await mockMapApi(page, { authenticated: false, mine: [] });
  await openMap(page);

  await expect(page.getByRole('heading', { name: 'Mapa de eventos' })).toBeVisible();
  await expect.poll(() => locationProbe(page, 'requests')).toBe(0);
  await page.getByRole('button', { name: 'Abrir utilitários do mapa' }).click();
  await page.getByRole('button', { name: 'Usar minha localização' }).click();
  await expect.poll(() => locationProbe(page, 'requests')).toBeGreaterThan(0);
  await expect.poll(() => locationProbe(page, 'watches')).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/menu/);
  await expect.poll(() => locationProbe(page, 'clears')).toBeGreaterThan(0);
});

test('shows the empty state and keeps authenticated-only filters unavailable to visitors', async ({ page }) => {
  await mockMapApi(page, { authenticated: false, mine: [], events: [] });
  await openMap(page);

  await expect(page.getByText('Nenhum evento com localização disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir utilitários do mapa' }).click();
  await page.getByRole('button', { name: 'Filtrar eventos' }).click();
  await expect(page.getByRole('radio', { name: 'Meus eventos' })).toBeDisabled();
  await expect(page.getByText('Entre para ver seus eventos.')).toBeVisible();
});

test('centers an authorized event deep link and silently ignores unknown ids', async ({ page }) => {
  const [target] = mapEvents();
  const distant = {
    ...target,
    id: 'distant-event',
    name: 'Evento distante',
    latitude: -23.55052,
    longitude: -46.633308,
  };
  await mockMapApi(page, { authenticated: false, mine: [], events: [target, distant] });

  await page.goto('/app/map?evento=map-event-1');
  await expect(page.locator('.map-target canvas')).toBeVisible();
  await clickMapMarker(page, 'map-event-1');
  await expect(page).toHaveURL(/\/app\/event\/map-event-1/);

  await page.goto('/app/map?evento=unknown-event');
  await expect(page.locator('.map-target canvas')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

async function mockMapApi(
  page: Page,
  options: { authenticated: boolean; mine: string[]; events?: ReturnType<typeof mapEvents> },
): Promise<void> {
  const events = options.events ?? mapEvents();
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/app(?=\/api\/)/, '');
    if (path === '/api/auth/me') {
      if (!options.authenticated) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sub: 'map-user',
          preferredUsername: 'map-user',
          email: 'map@example.com',
          roles: ['participant'],
          scopes: ['profile'],
          permissions: [],
          oidcScopes: ['openid'],
          claims: { name: 'Pessoa do mapa', is_onboarded: true },
        }),
      });
      return;
    }
    if (path === '/api/graphql') {
      const body = route.request().postDataJSON() as { query: string };
      if (body.query.includes('query PublicMapEvents')) {
        await graphql(route, { publicMapEvents: events });
        return;
      }
      if (body.query.includes('query CurrentUserMapEventIds')) {
        await graphql(route, { currentUserMapEventIds: options.mine });
        return;
      }
      if (body.query.includes('query PublicEventPage')) {
        await graphql(route, {
          publicEvent: createPublicEvent({
            ...events[0],
            type: 'PALESTRA',
            shortDescription: 'Evento exibido no mapa.',
            allowSubscription: false,
          }),
          publicEventSubscriptionSummary: { eventId: events[0].id, hasAvailableSlots: true, projectedQueuePosition: 1 },
          publicEventWeather: null,
          currentUserEventSubscription: null,
          currentUserEventAttendance: null,
        });
        return;
      }
      await graphql(route, {});
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/app/map');
}

async function clickMapMarker(page: Page, eventId: string): Promise<void> {
  const map = page.getByRole('region', { name: 'Mapa interativo de eventos' });
  await expect(map).toHaveAttribute('aria-busy', 'false');
  let markerPixel: number[] | null = null;
  await expect.poll(async () => {
    markerPixel = await page.evaluate((expectedEventId) => {
      interface FeatureLike {
        get(key: string): unknown;
      }
      const eventMap = (globalThis as typeof globalThis & {
        __eventMap?: {
          forEachFeatureAtPixel<T>(
            pixel: number[],
            callback: (feature: FeatureLike) => T | undefined,
          ): T | undefined;
          getSize(): number[] | undefined;
        };
      }).__eventMap;
      const size = eventMap?.getSize();
      if (!eventMap || !size) {
        return null;
      }
      for (let y = 0; y < size[1]; y += 4) {
        for (let x = 0; x < size[0]; x += 4) {
          const hit = eventMap.forEachFeatureAtPixel(
            [x, y],
            (feature) => {
              const directEvent = feature.get('mapEvent') as { id?: string } | undefined;
              const members = (feature.get('features') as FeatureLike[] | undefined) ?? [];
              return directEvent?.id ?? members
                .map((member) => member.get('mapEvent') as { id?: string } | undefined)
                .find((event) => event?.id === expectedEventId)?.id;
            },
          );
          if (hit === expectedEventId) {
            return [x, y];
          }
        }
      }
      return null;
    }, eventId);
    return markerPixel !== null;
  }).toBe(true);
  if (!markerPixel) {
    throw new Error(`Could not locate the map marker for ${eventId}.`);
  }
  await map.click({ position: { x: markerPixel[0], y: markerPixel[1] } });
}

function mapEvents() {
  const now = new Date();
  return [
    {
      id: 'map-event-1',
      name: 'Evento no mapa',
      emoji: '🗺️',
      startDate: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      endDate: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      latitude: -22.12103,
      longitude: -51.40775,
      locationDescription: 'FCT-Unesp',
    },
  ];
}

async function mockExternalMapAssets(page: Page): Promise<void> {
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) => route.fulfill({ status: 304, body: '' }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }),
  );
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#0b57d0"/></svg>',
    }),
  );
}

async function installGeolocationProbe(context: BrowserContext, page: Page): Promise<void> {
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(() => {
    const counters = { requests: 0, watches: 0, clears: 0 };
    Object.defineProperty(window, '__mapLocationProbe', { value: counters, configurable: true });
    const position = {
      coords: {
        latitude: -22.12103,
        longitude: -51.40775,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: 45,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          counters.requests += 1;
          success(position);
        },
        watchPosition: (success: PositionCallback) => {
          counters.watches += 1;
          success(position);
          return 73;
        },
        clearWatch: () => {
          counters.clears += 1;
        },
      },
    });
  });
}

async function locationProbe(page: Page, key: 'requests' | 'watches' | 'clears'): Promise<number> {
  return page.evaluate((counter) => {
    return (window as Window & { __mapLocationProbe?: Record<string, number> }).__mapLocationProbe?.[counter] ?? 0;
  }, key);
}

async function graphql(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
}
