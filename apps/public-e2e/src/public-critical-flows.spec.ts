import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createPublicEvent,
  createPublicEventGroup,
  createPublicMajorEvent,
} from '@cacic-fct/event-manager-public-testing';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
  await mockStaticExternalAssets(page);
});

test('displays a public standalone event and lets the user subscribe and unsubscribe', async ({ page }) => {
  const api = await mockPublicCriticalFlowApi(page);

  await page.goto('/app/event/standalone-event');

  await expect(page.getByRole('heading', { name: 'Oficina pública de TypeScript' })).toBeVisible();
  await expect(page.getByText('Inscrições abertas.')).toBeVisible();
  await page.getByRole('button', { name: 'Inscrever-se' }).click();

  await expect(page.getByText('Inscrição realizada.')).toBeVisible();
  await expect(page.getByText('Inscrito')).toBeVisible();
  expect(api.standaloneSubscribeCalls()).toBe(1);

  await page.getByRole('button', { name: 'Cancelar inscrição' }).click();

  await expect(page.getByText('Inscrição cancelada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inscrever-se' })).toBeVisible();
  expect(api.standaloneUnsubscribeCalls()).toBe(1);
});

test('opens standard major-event subscription from the public list and subscribes to grouped events', async ({ page }) => {
  const api = await mockPublicCriticalFlowApi(page);

  await page.goto('/app/major-event');

  await expect(page.getByText('SECOMPP Integração')).toBeVisible();
  await page
    .locator('mat-card')
    .filter({ hasText: 'SECOMPP Integração' })
    .getByRole('link', { name: 'Inscrever-se' })
    .click();

  await expect(page.getByRole('heading', { name: 'SECOMPP Integração' })).toBeVisible();
  await page
    .locator('mat-list-item')
    .filter({ has: page.getByText('Oficina de APIs', { exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Inscrever-se' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar inscrição' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Confirmar inscrição' }).getByRole('button', { name: 'Inscrever-se' }).click();

  await expect(page.getByText('Inscrição realizada.')).toBeVisible();
  expect(api.majorEventUpserts()).toEqual([
    {
      majorEventId: 'standard-major',
      selectedEventIds: ['standard-api', 'standard-practice'],
    },
  ]);
});

test('completes ranked major-event subscription with automatic and grouped preference events', async ({ page }) => {
  const api = await mockPublicCriticalFlowApi(page);

  await page.goto('/app/major-event/ranked-major/ranked-subscription');

  await expect(page.getByRole('heading', { name: 'SECOMPP Preferencial' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Minicursos desejados' }).click();
  await page.getByRole('option', { name: '2' }).click();
  await page.locator('mat-list-item').filter({ hasText: 'REST Essencial' }).locator('mat-checkbox').click();
  await page.getByRole('button', { name: 'Ordenar preferências' }).click();

  await expect(page.getByText('Trilha Backend')).toBeVisible();
  await expect(page.getByText('Credenciamento')).toBeVisible();
  await page.getByRole('button', { name: 'Inscrever-se' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar inscrição' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Confirmar inscrição' }).getByRole('button', { name: 'Inscrever-se' }).click();

  await expect(page.getByText('Inscrição realizada.')).toBeVisible();
  expect(api.rankedMajorEventUpserts()).toEqual([
    {
      majorEventId: 'ranked-major',
      selectedEventIds: ['ranked-checkin', 'ranked-api', 'ranked-graphql'],
      desiredCourses: 2,
      desiredLectures: 0,
      desiredUncategorized: 1,
    },
  ]);
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

async function mockPublicCriticalFlowApi(page: Page): Promise<{
  standaloneSubscribeCalls: () => number;
  standaloneUnsubscribeCalls: () => number;
  majorEventUpserts: () => Array<{ majorEventId: string; selectedEventIds: string[] }>;
  rankedMajorEventUpserts: () => Array<{
    majorEventId: string;
    selectedEventIds: string[];
    desiredCourses: number | null;
    desiredLectures: number | null;
    desiredUncategorized: number | null;
  }>;
}> {
  let standaloneSubscribed = false;
  let standaloneSubscribeCalls = 0;
  let standaloneUnsubscribeCalls = 0;
  const majorEventUpserts: Array<{ majorEventId: string; selectedEventIds: string[] }> = [];
  const rankedMajorEventUpserts: Array<{
    majorEventId: string;
    selectedEventIds: string[];
    desiredCourses: number | null;
    desiredLectures: number | null;
    desiredUncategorized: number | null;
  }> = [];

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

    if (url.pathname === '/api/graphql') {
      await fulfillGraphql(route, {
        getStandaloneSubscribed: () => standaloneSubscribed,
        setStandaloneSubscribed: (nextValue) => {
          standaloneSubscribed = nextValue;
        },
        incrementStandaloneSubscribeCalls: () => {
          standaloneSubscribeCalls++;
        },
        incrementStandaloneUnsubscribeCalls: () => {
          standaloneUnsubscribeCalls++;
        },
        majorEventUpserts,
        rankedMajorEventUpserts,
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });

  return {
    standaloneSubscribeCalls: () => standaloneSubscribeCalls,
    standaloneUnsubscribeCalls: () => standaloneUnsubscribeCalls,
    majorEventUpserts: () => majorEventUpserts,
    rankedMajorEventUpserts: () => rankedMajorEventUpserts,
  };
}

async function fulfillGraphql(
  route: Route,
  state: {
    getStandaloneSubscribed: () => boolean;
    setStandaloneSubscribed: (nextValue: boolean) => void;
    incrementStandaloneSubscribeCalls: () => void;
    incrementStandaloneUnsubscribeCalls: () => void;
    majorEventUpserts: Array<{ majorEventId: string; selectedEventIds: string[] }>;
    rankedMajorEventUpserts: Array<{
      majorEventId: string;
      selectedEventIds: string[];
      desiredCourses: number | null;
      desiredLectures: number | null;
      desiredUncategorized: number | null;
    }>;
  },
): Promise<void> {
  const body = parseGraphqlRequest(route);
  const query = body.query;
  const variables = body.variables;

  if (query.includes('mutation SubscribeCurrentUserStandaloneEvent')) {
    state.incrementStandaloneSubscribeCalls();
    state.setStandaloneSubscribed(true);
    await fulfillGraphqlData(route, {
      subscribeCurrentUserStandaloneEvent: { id: 'standalone-event' },
    });
    return;
  }

  if (query.includes('mutation UnsubscribeCurrentUserStandaloneEvent')) {
    state.incrementStandaloneUnsubscribeCalls();
    state.setStandaloneSubscribed(false);
    await fulfillGraphqlData(route, {
      unsubscribeCurrentUserStandaloneEvent: { id: 'standalone-event' },
    });
    return;
  }

  if (query.includes('query PublicEventPage')) {
    await fulfillGraphqlData(route, {
      publicEvent: standaloneEventFixture(),
      publicEventSubscriptionSummary: {
        eventId: 'standalone-event',
        hasAvailableSlots: true,
      },
      publicEventWeather: null,
      currentUserEventSubscription: state.getStandaloneSubscribed()
        ? {
            eventId: 'standalone-event',
            eventGroupSubscriptionId: null,
            createdAt: '2026-06-26T12:00:00.000Z',
            event: {
              id: 'standalone-event',
            },
          }
        : null,
      currentUserEventAttendance: null,
    });
    return;
  }

  if (query.includes('query PublicMajorEvents')) {
    await fulfillGraphqlData(route, {
      publicMajorEvents: [standardMajorEventFixture(), rankedMajorEventFixture()],
    });
    return;
  }

  if (query.includes('query CurrentUserMajorEventSubscriptions')) {
    await fulfillGraphqlData(route, {
      currentUserMajorEventSubscriptions: [],
    });
    return;
  }

  if (query.includes('query PublicMajorEventSubscriptionPage')) {
    const majorEventId = stringVariable(variables, 'majorEventId');
    await fulfillGraphqlData(
      route,
      majorEventId === 'ranked-major'
        ? {
            publicMajorEventSubscriptionPage: {
              majorEvent: rankedMajorEventSubscriptionFixture(),
              events: rankedSubscriptionEventsFixture(),
              subscriptionSummaries: rankedSubscriptionEventsFixture().map((event) => ({
                eventId: event.id,
                hasAvailableSlots: true,
              })),
            },
          }
        : {
            publicMajorEventSubscriptionPage: {
              majorEvent: standardMajorEventSubscriptionFixture(),
              events: standardSubscriptionEventsFixture(),
              subscriptionSummaries: standardSubscriptionEventsFixture().map((event) => ({
                eventId: event.id,
                hasAvailableSlots: true,
              })),
            },
          },
    );
    return;
  }

  if (query.includes('query CurrentUserMajorEventSubscription(')) {
    await fulfillGraphqlData(route, {
      currentUserMajorEventSubscription: null,
    });
    return;
  }

  if (query.includes('query CurrentUserEventForms')) {
    await fulfillGraphqlData(route, {
      currentUserEventForms: [],
    });
    return;
  }

  if (query.includes('mutation UpsertCurrentUserRankedMajorEventSubscription')) {
    const selectedEventIds = stringArrayVariable(variables, 'selectedEventIds');
    state.rankedMajorEventUpserts.push({
      majorEventId: stringVariable(variables, 'majorEventId'),
      selectedEventIds,
      desiredCourses: nullableNumberVariable(variables, 'desiredCourses'),
      desiredLectures: nullableNumberVariable(variables, 'desiredLectures'),
      desiredUncategorized: nullableNumberVariable(variables, 'desiredUncategorized'),
    });
    await fulfillGraphqlData(route, {
      upsertCurrentUserMajorEventSubscription: majorEventSubscriptionFixture(
        'ranked-major',
        rankedMajorEventSubscriptionFixture(),
        selectedEventIds.map((eventId) => rankedSubscriptionEventsFixture().find((event) => event.id === eventId)).filter(isRecord),
      ),
    });
    return;
  }

  if (query.includes('mutation UpsertCurrentUserMajorEventSubscription')) {
    const selectedEventIds = stringArrayVariable(variables, 'selectedEventIds');
    state.majorEventUpserts.push({
      majorEventId: stringVariable(variables, 'majorEventId'),
      selectedEventIds,
    });
    await fulfillGraphqlData(route, {
      upsertCurrentUserMajorEventSubscription: majorEventSubscriptionFixture(
        'standard-major',
        standardMajorEventSubscriptionFixture(),
        selectedEventIds.map((eventId) => standardSubscriptionEventsFixture().find((event) => event.id === eventId)).filter(isRecord),
      ),
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

function standaloneEventFixture(): Record<string, unknown> {
  return createPublicEvent({
    id: 'standalone-event',
    name: 'Oficina pública de TypeScript',
    startDate: '2027-08-10T18:00:00.000Z',
    endDate: '2027-08-10T20:00:00.000Z',
    emoji: '💻',
    description: 'Atividade aberta para a comunidade.',
    shortDescription: 'Fluxo crítico de evento público.',
    latitude: null,
    longitude: null,
    locationDescription: 'Laboratório 1',
    subscriptionStartDate: '2026-01-01T00:00:00.000Z',
    subscriptionEndDate: '2027-08-09T23:59:00.000Z',
    shouldCollectAttendance: false,
    isOnlineAttendanceAllowed: false,
  });
}

function standardMajorEventFixture(): Record<string, unknown> {
  return createPublicMajorEvent({
    id: 'standard-major',
    name: 'SECOMPP Integração',
    emoji: '🧪',
    startDate: '2027-09-01T12:00:00.000Z',
    endDate: '2027-09-03T21:00:00.000Z',
    description: 'Inscrição regular com seleção de atividades.',
    subscriptionStartDate: '2026-01-01T00:00:00.000Z',
    subscriptionEndDate: '2027-08-31T23:59:00.000Z',
    rankedSubscriptionEnabled: false,
    buttonText: null,
    buttonLink: null,
  });
}

function rankedMajorEventFixture(): Record<string, unknown> {
  return createPublicMajorEvent({
    id: 'ranked-major',
    name: 'SECOMPP Preferencial',
    emoji: '🗳️',
    startDate: '2027-10-01T12:00:00.000Z',
    endDate: '2027-10-03T21:00:00.000Z',
    description: 'Inscrição por voto preferencial.',
    subscriptionStartDate: '2026-01-01T00:00:00.000Z',
    subscriptionEndDate: '2027-09-30T23:59:00.000Z',
    rankedSubscriptionEnabled: true,
    buttonText: null,
    buttonLink: null,
  });
}

function standardMajorEventSubscriptionFixture(): Record<string, unknown> {
  return createPublicMajorEvent({
    ...standardMajorEventFixture(),
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 1,
    maxUncategorizedPerAttendee: 1,
  });
}

function rankedMajorEventSubscriptionFixture(): Record<string, unknown> {
  return createPublicMajorEvent({
    ...rankedMajorEventFixture(),
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 1,
    maxUncategorizedPerAttendee: 1,
  });
}

function standardSubscriptionEventsFixture(): Array<Record<string, unknown>> {
  const group = createPublicEventGroup({
    id: 'standard-group',
    name: 'Trilha de Integração',
    emoji: '🔗',
  });

  return [
    createPublicEvent({
      id: 'standard-api',
      name: 'Oficina de APIs',
      startDate: '2027-09-01T14:00:00.000Z',
      endDate: '2027-09-01T16:00:00.000Z',
      emoji: '🔌',
      type: 'MINICURSO',
      shortDescription: 'Primeira parte da trilha.',
      locationDescription: 'Laboratório 2',
      eventGroupId: 'standard-group',
      autoSubscribe: false,
      eventGroup: group,
    }),
    createPublicEvent({
      id: 'standard-practice',
      name: 'Oficina de APIs - prática',
      startDate: '2027-09-01T16:00:00.000Z',
      endDate: '2027-09-01T18:00:00.000Z',
      emoji: '🧰',
      type: 'MINICURSO',
      shortDescription: 'Segunda parte da trilha.',
      locationDescription: 'Laboratório 2',
      eventGroupId: 'standard-group',
      autoSubscribe: false,
      eventGroup: group,
    }),
  ];
}

function rankedSubscriptionEventsFixture(): Array<Record<string, unknown>> {
  const group = createPublicEventGroup({
    id: 'ranked-group',
    name: 'Trilha Backend',
    emoji: '🌐',
  });

  return [
    createPublicEvent({
      id: 'ranked-checkin',
      name: 'Credenciamento',
      startDate: '2027-10-01T12:00:00.000Z',
      endDate: '2027-10-01T13:00:00.000Z',
      emoji: '✅',
      type: 'OTHER',
      shortDescription: 'Entrada obrigatória.',
      locationDescription: 'Auditório',
      eventGroupId: null,
      autoSubscribe: true,
      eventGroup: null,
    }),
    createPublicEvent({
      id: 'ranked-api',
      name: 'REST Essencial',
      startDate: '2027-10-01T14:00:00.000Z',
      endDate: '2027-10-01T16:00:00.000Z',
      emoji: '🧠',
      type: 'MINICURSO',
      shortDescription: 'Preferência em grupo.',
      locationDescription: 'Laboratório 3',
      eventGroupId: 'ranked-group',
      autoSubscribe: false,
      eventGroup: group,
    }),
    createPublicEvent({
      id: 'ranked-graphql',
      name: 'GraphQL Essencial',
      startDate: '2027-10-01T16:00:00.000Z',
      endDate: '2027-10-01T18:00:00.000Z',
      emoji: '📡',
      type: 'MINICURSO',
      shortDescription: 'Preferência em grupo.',
      locationDescription: 'Laboratório 3',
      eventGroupId: 'ranked-group',
      autoSubscribe: false,
      eventGroup: group,
    }),
  ];
}

function majorEventSubscriptionFixture(
  majorEventId: string,
  majorEvent: Record<string, unknown>,
  selectedEvents: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id: `${majorEventId}-subscription`,
    majorEventId,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: null,
    paymentDate: null,
    paymentTier: null,
    majorEvent,
    selectedEvents,
    notSubscribedEvents: [],
  };
}

function stringVariable(variables: Record<string, unknown>, key: string): string {
  const value = variables[key];
  return typeof value === 'string' ? value : '';
}

function stringArrayVariable(variables: Record<string, unknown>, key: string): string[] {
  const value = variables[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nullableNumberVariable(variables: Record<string, unknown>, key: string): number | null {
  const value = variables[key];
  return typeof value === 'number' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
