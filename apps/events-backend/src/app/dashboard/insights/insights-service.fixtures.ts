import { DashboardInsightsService } from '../insights.service';

export function createInsightsServiceTestContext() {
  const prisma = createPrismaMock();
  const currentUserContext = {
    getAuthenticatedUser: jest.fn().mockReturnValue({
      token: 'token',
      permissionSet: new Set<string>(),
    }),
  };
  const keycloakAuthService = {
    evaluateAccessTokenPermissions: jest.fn().mockResolvedValue([]),
  };
  const weatherService = {
    getPublicEventWeather: jest.fn().mockResolvedValue(null),
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scanStream: jest.fn(),
  };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const service = new DashboardInsightsService(
    prisma as never,
    currentUserContext as never,
    keycloakAuthService as never,
    weatherService as never,
    redis as never,
    queue as never,
  );

  return {
    prisma,
    currentUserContext,
    keycloakAuthService,
    weatherService,
    redis,
    queue,
    service,
  };
}

export function createPrismaMock() {
  return {
    event: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    eventGroup: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    majorEvent: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    mergeCandidate: {
      count: jest.fn(),
    },
    majorEventSubscription: {
      count: jest.fn(),
    },
  };
}

export function insightEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'Event',
    emoji: '📌',
    type: 'PALESTRA',
    startDate: new Date('2026-05-22T12:00:00.000Z'),
    endDate: new Date('2026-05-22T13:00:00.000Z'),
    locationDescription: 'Room 1',
    latitude: null,
    longitude: null,
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    shouldCollectAttendance: true,
    shouldIssueCertificate: true,
    certificateConfigs: [],
    lecturers: [],
    subscriptions: [],
    attendances: [],
    _count: {
      attendances: 0,
      subscriptions: 0,
    },
    ...overrides,
  };
}
