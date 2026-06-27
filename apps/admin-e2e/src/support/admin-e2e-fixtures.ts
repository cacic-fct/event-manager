import type { Page } from '@playwright/test';

type AdminE2EUser = Record<string, unknown>;
type AdminE2EDashboardInsights = Record<string, unknown>;
type AdminE2ENamedFixture = Record<string, unknown> & {
  id: string;
  name: string;
};
type AdminE2EEventFixture = AdminE2ENamedFixture & {
  eventGroupId: string | null;
  majorEventId: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  majorEvent: AdminE2ENamedFixture | null;
  eventGroup: AdminE2ENamedFixture | null;
};

export const adminE2EReadPermissions = [
  'event#read',
  'major-event#read',
  'event-lecturer#read',
  'event-group#read',
  'event-attendance#read',
  'subscription#read',
  'certificate#read',
  'certificate-config#read',
  'place-preset#read',
];

export const adminE2ECriticalFlowPermissions = [
  ...adminE2EReadPermissions,
  'event#create',
  'event#update',
  'event-group#create',
  'event-group#update',
  'major-event#create',
  'major-event#update',
  'subscription#create',
  'subscription#update',
  'subscription#import',
  'event-attendance#collect',
  'event-attendance#import',
  'event-attendance#update',
  'event-attendance#delete',
];

export async function preventSilentSso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
}

export async function mockAdminApi(
  page: Page,
  options: {
    user: AdminE2EUser | null;
    dashboardInsights?: AdminE2EDashboardInsights;
    permissions?: string[];
    onLoginRedirect?: (url: URL) => void;
    onPasswordLogin?: (body: Record<string, unknown>) => void;
  },
): Promise<void> {
  let currentUser = options.user;
  const permissions = options.permissions ?? adminE2EReadPermissions;

  await page.route('https://unleash.cacic.dev.br/api/frontend/**', (route) =>
    route.fulfill({
      status: 304,
      body: '',
    }),
  );

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: currentUser ? 200 : 403,
        contentType: 'application/json',
        body: JSON.stringify(currentUser ?? { message: 'User is not authenticated.' }),
      });
      return;
    }

    if (url.pathname === '/api/auth/login/redirect') {
      options.onLoginRedirect?.(url);
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Auth redirect captured</title>',
      });
      return;
    }

    if (url.pathname === '/api/auth/password-login') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      options.onPasswordLogin?.(body);
      currentUser = authenticatedAdminUserFixture({
        email: typeof body['email'] === 'string' ? body['email'] : 'aluno@unesp.br',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: currentUser,
          expiresAt: Date.now() + 300_000,
          sessionExpiresAt: Date.now() + 600_000,
        }),
      });
      return;
    }

    if (url.pathname === '/api/auth/permissions/evaluate') {
      await route.fulfill({
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: currentUser ? permissions : [] }),
      });
      return;
    }

    if (url.pathname === '/api/graphql') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: graphqlData(route.request().postDataJSON() as unknown, options.dashboardInsights),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });
}

export function authenticatedAdminUserFixture(overrides: Partial<AdminE2EUser> = {}): AdminE2EUser {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'admin-1',
    preferredUsername: 'admin',
    email: 'admin@example.edu',
    roles: [],
    permissions: adminE2EReadPermissions,
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Admin Teste',
      email: 'admin@example.edu',
      picture: null,
    },
    ...overrides,
  };
}

export function createAdminE2EDashboardInsights(
  overrides: Partial<AdminE2EDashboardInsights> = {},
): AdminE2EDashboardInsights {
  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(now);
  endsAt.setHours(12, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);

  return {
    generatedAt: now.toISOString(),
    summary: {
      eventsCount: 2,
      eventGroupsCount: 1,
      majorEventsCount: 1,
    },
    suggestions: [
      {
        action: 'CREATE_EVENT',
        label: 'Novo evento',
        targetId: null,
      },
      {
        action: 'CREATE_EVENT_GROUP',
        label: 'Novo grupo de eventos',
        targetId: null,
      },
      {
        action: 'CREATE_MAJOR_EVENT',
        label: 'Novo grande evento',
        targetId: null,
      },
    ],
    calendarEvents: [
      {
        id: 'event-1',
        name: 'Credenciamento',
        emoji: 'clipboard',
        type: 'OTHER',
        startDate: startsAt.toISOString(),
        endDate: endsAt.toISOString(),
        locationDescription: 'Auditório principal',
        majorEventName: 'Semana da Computação',
        eventGroupName: null,
        attendancesCount: 7,
        subscriptionsCount: 25,
        shouldCollectAttendance: true,
        canCollectAttendanceNow: true,
      },
      {
        id: 'event-2',
        name: 'Palestra de encerramento',
        emoji: 'microphone',
        type: 'PALESTRA',
        startDate: tomorrow.toISOString(),
        endDate: tomorrow.toISOString(),
        locationDescription: 'Sala 2',
        majorEventName: 'Semana da Computação',
        eventGroupName: null,
        attendancesCount: 0,
        subscriptionsCount: 42,
        shouldCollectAttendance: true,
        canCollectAttendanceNow: false,
      },
    ],
    weatherAlerts: [],
    pendingCertificates: [
      {
        targetType: 'EVENT',
        targetId: 'event-1',
        title: 'Credenciamento',
        subtitle: 'Certificado de participante',
        finishedAt: endsAt.toISOString(),
      },
    ],
    pendingReceiptValidationsCount: 3,
    pendingReceiptMajorEvents: [
      {
        majorEventId: 'major-event-1',
        name: 'Semana da Computação',
        emoji: 'festival',
        startDate: startsAt.toISOString(),
        endDate: tomorrow.toISOString(),
        pendingCount: 3,
      },
    ],
    pendingOfflineAttendancesCount: 2,
    pendingOfflineAttendanceEvents: [
      {
        eventId: 'event-1',
        name: 'Credenciamento',
        emoji: 'clipboard',
        startDate: startsAt.toISOString(),
        endDate: endsAt.toISOString(),
        pendingCount: 2,
      },
    ],
    inconsistencies: [
      {
        type: 'EVENT_WITHOUT_PLACE',
        action: 'OPEN_EVENT',
        targetId: 'event-1',
        severity: 'CRITICAL',
        title: 'Evento sem local',
        description: 'Defina um local antes de divulgar a atividade.',
        eventId: 'event-1',
        relatedEventId: null,
        personId: null,
      },
    ],
    duplicatePeopleCount: 4,
    ...overrides,
  };
}

export function createAdminE2EMajorEvent(overrides: Record<string, unknown> = {}): AdminE2ENamedFixture {
  return {
    id: 'major-event-1',
    name: 'Semana da Computação',
    emoji: 'festival',
    startDate: '2026-05-20T12:00:00.000Z',
    endDate: '2026-05-23T21:00:00.000Z',
    description: 'Grande evento de tecnologia.',
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    isPaymentRequired: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: null,
    paymentInfo: null,
    majorEventPrices: [
      {
        id: 'price-1',
        type: 'SINGLE',
        tiers: [{ id: 'price-tier-1', name: 'Aluno', value: 4000 }],
      },
    ],
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: '2026-05-20T12:00:00.000Z',
    unpublishedAt: null,
    deletedAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    createdById: 'admin-1',
    updatedAt: '2026-05-01T12:00:00.000Z',
    updatedById: 'admin-1',
    ...overrides,
  };
}

export function createAdminE2EEventGroup(overrides: Record<string, unknown> = {}): AdminE2ENamedFixture {
  return {
    id: 'event-group-1',
    name: 'Trilha de Minicursos',
    emoji: 'school',
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldIssueCertificateForEachEvent: true,
    shouldIssuePartialCertificate: true,
    deletedAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    createdById: 'admin-1',
    updatedAt: '2026-05-01T12:00:00.000Z',
    updatedById: 'admin-1',
    ...overrides,
  };
}

export function createAdminE2EEvent(overrides: Record<string, unknown> = {}): AdminE2EEventFixture {
  const majorEvent = createAdminE2EMajorEvent();
  const eventGroup = createAdminE2EEventGroup();

  return {
    id: 'event-1',
    name: 'Oficina de Angular',
    creditMinutes: 120,
    startDate: '2026-05-21T17:00:00.000Z',
    endDate: '2026-05-21T19:00:00.000Z',
    emoji: 'computer',
    type: 'MINICURSO',
    description: 'Atividade prática.',
    shortDescription: 'Angular no painel admin.',
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'Laboratório 1',
    majorEventId: majorEvent.id,
    majorEvent,
    eventGroupId: eventGroup.id,
    eventGroup,
    allowSubscription: true,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: 30,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: true,
    shouldProvideSubscriberListToLecturer: false,
    onlineAttendanceCode: 'A8C2',
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: '2026-05-20T12:00:00.000Z',
    unpublishedAt: null,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    deletedAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    createdById: 'admin-1',
    updatedAt: '2026-05-01T12:00:00.000Z',
    updatedById: 'admin-1',
    ...overrides,
  };
}

export function createAdminE2EPerson(overrides: Record<string, unknown> = {}): AdminE2ENamedFixture {
  return {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: 'ada@example.edu',
    secondaryEmails: [],
    phone: null,
    identityDocument: '12345678900',
    academicId: 'RA123',
    userId: null,
    user: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    createdById: 'admin-1',
    updatedAt: '2026-05-01T12:00:00.000Z',
    updatedById: 'admin-1',
    lecturerProfile: null,
    ...overrides,
  };
}

export function createAdminE2EEventSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const event = createAdminE2EEvent();
  const person = createAdminE2EPerson();

  return {
    id: 'event-subscription-1',
    eventId: event.id,
    event,
    personId: person.id,
    person,
    eventGroupSubscriptionId: null,
    majorEventSubscriptionId: null,
    createdAt: '2026-05-21T12:00:00.000Z',
    createdById: 'admin-1',
    createdByMethod: 'ADMIN_DASHBOARD',
    isLecturerSubscription: false,
    ...overrides,
  };
}

export function createAdminE2EMajorEventSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const majorEvent = createAdminE2EMajorEvent();
  const person = createAdminE2EPerson();

  return {
    id: 'major-event-subscription-1',
    majorEventId: majorEvent.id,
    majorEvent,
    personId: person.id,
    person,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: 4000,
    paymentDate: '2026-05-20T12:00:00.000Z',
    paymentTier: 'Aluno',
    createdAt: '2026-05-20T12:00:00.000Z',
    createdById: 'admin-1',
    createdByMethod: 'ADMIN_DASHBOARD',
    events: [
      {
        eventId: 'event-1',
        eventName: 'Oficina de Angular',
        eventStartDate: '2026-05-21T17:00:00.000Z',
        subscribed: true,
        isLecturerSubscription: false,
      },
    ],
    ...overrides,
  };
}

export function createAdminE2EEventAttendance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const event = createAdminE2EEvent();
  const person = createAdminE2EPerson();

  return {
    eventId: event.id,
    event,
    personId: person.id,
    person,
    category: 'REGULAR',
    attendedAt: '2026-05-21T17:30:00.000Z',
    createdAt: '2026-05-21T17:30:00.000Z',
    createdById: 'admin-1',
    committedById: 'admin-1',
    createdByMethod: 'MANUAL_INPUT',
    collectedByFullName: 'Admin Teste',
    committedByFullName: 'Admin Teste',
    collectedLatitude: null,
    collectedLongitude: null,
    collectedAccuracyMeters: null,
    ...overrides,
  };
}

export function createAdminE2EMajorEventUserAttendance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const person = createAdminE2EPerson();

  return {
    majorEventId: 'major-event-1',
    subscriptionId: 'major-event-subscription-1',
    personId: person.id,
    person,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: 4000,
    paymentDate: '2026-05-20T12:00:00.000Z',
    paymentTier: 'Aluno',
    attendances: [
      {
        eventId: 'event-1',
        eventName: 'Oficina de Angular',
        eventStartDate: '2026-05-21T17:00:00.000Z',
        attended: true,
        attendedAt: '2026-05-21T17:30:00.000Z',
        category: 'REGULAR',
      },
    ],
    ...overrides,
  };
}

function graphqlData(body: unknown, dashboardInsights: AdminE2EDashboardInsights | undefined): Record<string, unknown> {
  const query = isRecord(body) && typeof body['query'] === 'string' ? body['query'] : '';
  const variables = isRecord(body) && isRecord(body['variables']) ? body['variables'] : {};
  const event = createAdminE2EEvent({ id: 'event-1' });
  const majorEvent = createAdminE2EMajorEvent({ id: 'major-event-1' });
  const eventGroup = createAdminE2EEventGroup({ id: 'event-group-1' });

  if (query.includes('query WorkspaceDashboardInsights')) {
    return {
      workspaceDashboardInsights: dashboardInsights ?? createAdminE2EDashboardInsights(),
    };
  }

  if (query.includes('query ListEventsSummary')) {
    return {
      events: [
        {
          id: event.id,
          eventGroupId: event.eventGroupId,
          startDate: event.startDate,
          endDate: event.endDate,
          createdAt: event.createdAt,
          name: event.name,
          majorEvent: { id: majorEvent.id, name: majorEvent.name },
        },
      ],
    };
  }

  if (query.includes('query ListEvents(')) {
    return { events: [event] };
  }

  if (query.includes('query GetEvent')) {
    return { event };
  }

  if (query.includes('query ListEventDrafts')) {
    return {
      eventDrafts: [
        {
          id: 'event-draft-1',
          sourceEventId: event.id,
          name: 'Ajustes de publicação',
          payloadJson: JSON.stringify({ name: 'Oficina de Angular atualizada' }),
          createdById: 'admin-1',
          createdByName: 'Admin Teste',
          createdByEmail: 'admin@example.edu',
          updatedById: 'admin-1',
          updatedByName: 'Admin Teste',
          updatedByEmail: 'admin@example.edu',
          createdAt: '2026-05-21T12:00:00.000Z',
          updatedAt: '2026-05-21T12:30:00.000Z',
          expiresAt: '2026-06-21T12:30:00.000Z',
        },
      ],
    };
  }

  if (query.includes('query ListEventLecturers')) {
    return { eventLecturers: [] };
  }

  if (query.includes('query ListEventAttendanceCollectors')) {
    return { eventAttendanceCollectors: [] };
  }

  if (query.includes('query ListMajorEvents')) {
    return { majorEvents: [majorEvent] };
  }

  if (query.includes('query GetMajorEvent')) {
    return { majorEvent };
  }

  if (query.includes('query ListEventGroups')) {
    return { eventGroups: [eventGroup] };
  }

  if (query.includes('query GetEventGroup')) {
    return { eventGroup };
  }

  if (query.includes('query WorkspaceEventSubscriptions')) {
    return { workspaceEventSubscriptions: [createAdminE2EEventSubscription()] };
  }

  if (query.includes('query WorkspaceMajorEventSubscriptions')) {
    return { workspaceMajorEventSubscriptions: [createAdminE2EMajorEventSubscription()] };
  }

  if (query.includes('query ListEventAttendances')) {
    return { eventAttendances: [createAdminE2EEventAttendance()] };
  }

  if (query.includes('query OfflineEventAttendanceSubmissions')) {
    return { offlineEventAttendanceSubmissions: [] };
  }

  if (query.includes('query ListMajorEventUserAttendances')) {
    return { majorEventUserAttendances: [createAdminE2EMajorEventUserAttendance()] };
  }

  if (query.includes('query ListPlacePresets')) {
    return { placePresets: [] };
  }

  if (query.includes('query ListCertificate')) {
    return {
      certificateIssuableEvents: [],
      certificateIssuableEventGroups: [],
      certificateIssuableMajorEvents: [],
      certificateTemplates: [],
      certificateConfigs: [],
      certificates: [],
    };
  }

  if (query.includes('query AdminReceiptValidationQueue')) {
    return {
      adminReceiptValidationQueue: {
        majorEventId: typeof variables['majorEventId'] === 'string' ? variables['majorEventId'] : null,
        pendingCount: 0,
        items: [],
      },
    };
  }

  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
