import { AttendanceCreationMethod, type EventAttendanceStatus } from '@prisma/client';
import {
  AttendanceAnalyticsService,
  buildCollectorProductivity,
  buildHeatmapPoints,
  findInconsistentLocationPatterns,
  haversineMeters,
  resolveAttendanceAnalyticsWindow,
} from './attendance-analytics.service';
const { jest } = import.meta;

describe('AttendanceAnalyticsService snapshot filtering', () => {
  afterEach(() => jest.useRealTimers());

  it('executes one attendance query for all-time analytics and reuses the bounded review window', async () => {
    const now = new Date();
    jest.useFakeTimers().setSystemTime(now);
    const rows = [-120, -60, -5, 5].map((minutes, index) => {
      const at = new Date(now.getTime() + minutes * 60_000);
      return {
        ...attendance({ minute: index, latitude: 0, longitude: 0 }),
        attendedAt: at,
        createdAt: at,
        status: index === 2 ? ('ABSENT' as const) : ('PRESENT' as const),
      };
    });
    const { prisma, service } = snapshotFixture(rows);
    prisma.eventSubscription.findMany.mockResolvedValue(rows.map((row) => ({ personId: row.personId })));
    let executions = 0;
    prisma.eventAttendance.findMany.mockImplementationOnce(
      () =>
        ({
          then(resolve: (value: typeof rows) => void) {
            executions += 1;
            resolve(rows);
          },
        }) as never,
    );
    const detect = jest
      .spyOn(service as unknown as { detectReviewFlags: (...args: unknown[]) => Promise<void> }, 'detectReviewFlags')
      .mockResolvedValue();

    const result = await service.snapshot('event-1');

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledTimes(1);
    expect(executions).toBe(1);
    expect(detect.mock.calls[0][1]).toEqual(rows.slice(1));
    expect(result).toMatchObject({ presentCount: 3, noShowCount: 1 });
    expect(result.methods).toEqual([{ method: AttendanceCreationMethod.SCANNER, count: 3 }]);
    expect(prisma.attendanceReviewFlag.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rolling window covering review detection', 120, 2, 4],
    ['rolling window shorter than review detection', 15, 3, 2],
  ])('reuses compatible reads for a %s', async (_label, windowMinutes, expectedQueries, expectedSnapshotCount) => {
    const now = new Date();
    jest.useFakeTimers().setSystemTime(now);
    const start = new Date(now.getTime() - windowMinutes * 60_000);
    const rows = [-121, -120, -30, -15, -1].map((minutes, index) => ({
      ...attendance({ minute: index, latitude: 0, longitude: 0 }),
      attendedAt: new Date(now.getTime() + minutes * 60_000),
      createdAt: new Date(now.getTime() + minutes * 60_000),
    }));
    const { prisma, service } = snapshotFixture(rows);
    prisma.eventSubscription.findMany.mockResolvedValue(rows.map(({ personId }) => ({ personId })));
    prisma.eventAttendance.findMany.mockImplementation(
      async (args: { where: { status?: EventAttendanceStatus; attendedAt?: { gte: Date } } }) =>
        rows.filter(
          (row) =>
            (!args.where.attendedAt || row.attendedAt >= args.where.attendedAt.gte) &&
            (!args.where.status || row.status === args.where.status),
        ),
    );

    const detect = jest
      .spyOn(service as unknown as { detectReviewFlags: (...args: unknown[]) => Promise<void> }, 'detectReviewFlags')
      .mockResolvedValue();

    const result = await service.snapshot('event-1', { windowMinutes });

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledTimes(expectedQueries);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect.mock.calls[0][1]).toEqual(rows.slice(2));
    expect(prisma.eventAttendance.findMany).toHaveBeenNthCalledWith(1, {
      where: { eventId: 'event-1', attendedAt: { gte: start } },
      select: expect.any(Object),
      orderBy: { attendedAt: 'asc' },
    });
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', status: 'PRESENT' },
      select: { personId: true },
    });
    expect(result).toMatchObject({
      windowStart: start,
      windowEnd: now,
      windowMinutes,
      presentCount: 5,
      noShowCount: 0,
    });
    expect(result.methods).toEqual([{ method: AttendanceCreationMethod.SCANNER, count: expectedSnapshotCount }]);
    expect(result.scansPerMinute.reduce((total, bucket) => total + bucket.count, 0)).toBe(expectedSnapshotCount);
    expect(result.scansByHour.reduce((total, bucket) => total + bucket.count, 0)).toBe(expectedSnapshotCount);
    expect(result.collectors).toEqual([expect.objectContaining({ count: expectedSnapshotCount })]);
    expect(result.heatmapPoints).toEqual([expect.objectContaining({ count: expectedSnapshotCount })]);
  });

  it('keeps complete totals while retaining the existing review-detection limit', async () => {
    const at = new Date(Date.now() - 60_000);
    const rows = Array.from({ length: 10_001 }, (_, index) => ({
      ...attendance({ minute: 1, latitude: 0, longitude: 0 }),
      personId: `person-${index}`,
      attendedAt: at,
      createdAt: at,
    }));
    const { prisma, service } = snapshotFixture(rows);

    const result = await service.snapshot('event-1');

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledTimes(1);
    expect(result.presentCount).toBe(10_001);
    expect(result.scansPerMinute[0].count).toBe(10_001);
    expect(prisma.attendanceReviewFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'UNUSUAL_VOLUME',
          details: expect.objectContaining({ count: 10_000 }),
        }),
      }),
    );
  });

  it('skips unchanged review writes across polling and summaries, but persists changed evidence', async () => {
    const { prisma, service } = snapshotFixture([]);
    const entry = {
      id: 'audit-1',
      eventId: 'event-1',
      actorId: 'actor-1',
      actorName: 'Ana',
      operation: 'UPDATE',
      groupedCount: 3,
      entityId: 'attendance-1',
      lastRecordedAt: new Date(),
    };
    prisma.auditLogEntry.findMany.mockResolvedValue([entry] as never);
    const stored = {
      dedupeKey: 'repeat:audit-1',
      title: 'Tentativas repetidas de leitura',
      summary: '3 tentativas semelhantes foram agrupadas para a mesma presença.',
      details: { entityId: 'attendance-1', auditLogEntryId: 'audit-1' },
    };
    prisma.attendanceReviewFlag.findMany.mockImplementation(async (args: { select?: unknown }) =>
      args.select ? [stored] : [],
    );

    await service.snapshot('event-1');
    await service.pendingReviewSummaries();
    expect(prisma.attendanceReviewFlag.upsert).not.toHaveBeenCalled();

    entry.groupedCount = 4;
    await service.snapshot('event-1');
    expect(prisma.attendanceReviewFlag.upsert).toHaveBeenCalledTimes(1);
    const update = prisma.attendanceReviewFlag.upsert.mock.calls[0][0].update;
    expect(update.summary).toContain('4 tentativas');
    expect(update).not.toHaveProperty('status');
    expect(update).not.toHaveProperty('reviewedAt');
  });

  it('filters attendance-derived analytics while preserving global totals and reviews', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T18:00:00.000Z'));
    const selectedAttendances = [
      attendance({ minute: 5, latitude: -22.121, longitude: -51.408 }),
      attendance({ minute: 6, latitude: -22.121, longitude: -51.408 }),
    ];
    const reviewItem = {
      id: 'review-1',
      eventId: 'event-1',
      kind: 'UNUSUAL_VOLUME',
      severity: 'WARNING',
      status: 'PENDING',
      title: 'Volume incomum',
      summary: 'Revisão global',
      detectedAt: new Date('2026-08-16T17:55:00.000Z'),
      personId: null,
      actorId: 'collector-1',
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'event-1',
          name: 'Evento',
          emoji: '🎫',
          startDate: new Date('2026-08-16T12:00:00.000Z'),
          latitude: -22.121,
          longitude: -51.408,
          allowSubscription: true,
          majorEventId: null,
          autoSubscribe: false,
          attendanceEligibility: 'ANYONE',
          sportsMatch: null,
        }),
      },
      eventAttendance: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(selectedAttendances)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ personId: 'person-1' }, { personId: 'person-2' }]),
      },
      offlineEventAttendanceSubmission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'offline-1', submittedAt: new Date('2026-08-16T17:58:00.000Z') }]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'collector-1', name: 'Marina Costa' }]) },
      eventSubscription: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ personId: 'person-1' }, { personId: 'person-2' }, { personId: 'person-3' }]),
      },
      majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogEntry: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceReviewFlag: {
        findMany: jest.fn().mockResolvedValue([reviewItem]),
        upsert: jest.fn(),
      },
    };
    const service = new AttendanceAnalyticsService(prisma as never, {} as never);
    const start = new Date('2026-08-16T18:05:00.000Z');
    const end = new Date('2026-08-16T18:06:59.999Z');

    const result = await service.snapshot('event-1', { start, end });

    expect(prisma.eventAttendance.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { eventId: 'event-1', attendedAt: { gte: start, lte: end } },
      }),
    );
    expect(prisma.eventAttendance.findMany).toHaveBeenNthCalledWith(3, {
      where: { eventId: 'event-1', status: 'PRESENT' },
      select: { personId: true },
    });
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', deletedAt: null },
      select: { personId: true },
    });
    expect(result).toMatchObject({
      windowStart: start,
      windowEnd: end,
      presentCount: 2,
      noShowCount: 1,
      pendingOfflineCount: 1,
      pendingReviewCount: 1,
      methods: [{ method: AttendanceCreationMethod.SCANNER, count: 2 }],
      collectors: [{ actorId: 'collector-1', name: 'Marina Costa', count: 2 }],
      heatmapPoints: [{ latitude: -22.121, longitude: -51.408, count: 2 }],
      reviewItems: [expect.objectContaining({ id: 'review-1', summary: 'Revisão global' })],
    });
    expect(result.scansPerMinute).toHaveLength(2);
  });

  it('uses the sports tournament major-event scope in review links', async () => {
    const prisma = {
      attendanceReviewFlag: { findMany: jest.fn().mockResolvedValue([]) },
      sportsMatchAction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'action-1',
            type: 'UPDATE_SCORE',
            actorUserId: 'operator-1',
            authoredAt: new Date('2026-08-16T18:00:00.000Z'),
            offline: false,
          },
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'operator-1', name: 'Operador' }]) },
      event: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'event-1',
          name: 'Partida',
          emoji: '🏆',
          startDate: new Date('2026-08-16T18:00:00.000Z'),
          latitude: null,
          longitude: null,
          allowSubscription: false,
          majorEventId: 'major-1',
          autoSubscribe: false,
          attendanceEligibility: 'ANYONE',
          eventGroup: null,
          majorEvent: null,
          sportsMatch: {
            id: 'match-1',
            category: {
              tournamentId: 'tournament-1',
              tournament: { majorEventId: 'major / 1' },
            },
          },
        }),
      },
    };
    const service = new AttendanceAnalyticsService(prisma as never, {} as never);

    const findEvent = (service as unknown as { findEvent: (eventId: string) => Promise<unknown> }).findEvent;
    await findEvent.call(service, 'event-1');
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          sportsMatch: {
            select: {
              id: true,
              category: {
                select: {
                  tournamentId: true,
                  tournament: { select: { majorEventId: true } },
                },
              },
            },
          },
        }),
      }),
    );

    const reviewItems = await (
      service as unknown as {
        reviewItems: (event: unknown) => Promise<ReadonlyArray<{ deepLink?: string }>>;
      }
    ).reviewItems({
      id: 'event-1',
      sportsMatch: {
        id: 'match-1',
        category: {
          tournamentId: 'tournament-1',
          tournament: { majorEventId: 'major / 1' },
        },
      },
    });

    expect(reviewItems).toEqual([
      expect.objectContaining({
        id: 'sports:action-1',
        deepLink: '/sports/major-event/major%20%2F%201/reviews',
      }),
    ]);
  });
});

describe('collector productivity aggregation', () => {
  it('preserves totals, method order and scan boundaries without per-collector scan arrays', () => {
    const now = Date.now();
    const scans = [0, 1, 2].map((minute) => {
      const at = new Date(now + minute * 60_000);
      return { ...attendance({ minute, latitude: 0, longitude: 0 }), attendedAt: at, createdAt: at };
    });
    const offline = {
      ...scans[1],
      committedById: 'committer-1',
      createdAt: new Date(scans[1].attendedAt.getTime() + 90_000),
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
    };
    const fallback = { ...scans[2], createdById: null, committedById: null };
    const absent = { ...scans[2], status: 'ABSENT' as const };
    const result = buildCollectorProductivity([scans[0], offline, fallback, absent], new Map([['collector-1', 'Ana']]));

    expect(result).toEqual([
      {
        actorId: 'collector-1',
        name: 'Ana',
        count: 2,
        firstScanAt: scans[0].attendedAt,
        lastScanAt: scans[1].attendedAt,
        onlineCount: 1,
        offlineCount: 1,
        methods: [
          { method: AttendanceCreationMethod.SCANNER, count: 1 },
          { method: AttendanceCreationMethod.MANUAL_INPUT, count: 1 },
        ],
      },
      {
        actorId: 'method:SCANNER',
        name: 'Leitor de crachá',
        count: 1,
        firstScanAt: scans[2].attendedAt,
        lastScanAt: scans[2].attendedAt,
        onlineCount: 1,
        offlineCount: 0,
        methods: [{ method: AttendanceCreationMethod.SCANNER, count: 1 }],
      },
    ]);
  });
});

function snapshotFixture(
  rows: Array<Omit<ReturnType<typeof attendance>, 'status'> & { status: EventAttendanceStatus }> = [],
) {
  const prisma = {
    event: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'event-1',
        name: 'Evento',
        emoji: '🎫',
        startDate: new Date(),
        latitude: null,
        longitude: null,
        allowSubscription: true,
        majorEventId: null,
        autoSubscribe: false,
        attendanceEligibility: 'ANYONE',
        sportsMatch: null,
      }),
    },
    eventAttendance: { findMany: jest.fn().mockResolvedValue(rows) },
    offlineEventAttendanceSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    auditLogEntry: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceReviewFlag: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const authorization = { accessibleEventTargets: jest.fn().mockResolvedValue(null) };
  return { prisma, service: new AttendanceAnalyticsService(prisma as never, authorization as never) };
}

describe('attendance analytics heatmap', () => {
  it('excludes absent records even when old collection coordinates remain stored', () => {
    const present = attendance({ minute: 1, latitude: -22.121, longitude: -51.408 });
    const absent = { ...attendance({ minute: 2, latitude: -22.2, longitude: -51.5 }), status: 'ABSENT' as const };

    expect(buildHeatmapPoints([present, absent])).toEqual([
      expect.objectContaining({ latitude: -22.121, longitude: -51.408, count: 1 }),
    ]);
  });
});

describe('attendance analytics time windows', () => {
  const now = new Date('2026-08-16T18:00:00.000Z');

  it('uses all attendances by default', () => {
    expect(resolveAttendanceAnalyticsWindow({}, now)).toEqual({
      start: null,
      end: null,
      windowMinutes: null,
    });
  });

  it('uses both inclusive pivots for a fixed interval', () => {
    const start = new Date('2026-08-15T10:20:00.000Z');
    const end = new Date('2026-08-16T11:39:59.999Z');

    expect(resolveAttendanceAnalyticsWindow({ start, end }, now)).toEqual({
      start,
      end,
      windowMinutes: 1_520,
      attendedAt: { gte: start, lte: end },
    });
  });

  it.each([
    [{ start: now }, 'Informe o início e o fim'],
    [{ end: now }, 'Informe o início e o fim'],
    [{ start: new Date('invalid'), end: now }, 'intervalo de presença informado é inválido'],
    [{ start: now, end: now }, 'posterior ao início'],
    [{ windowMinutes: 60, start: new Date(now.getTime() - 60_000), end: now }, 'não ambos'],
  ])('rejects an invalid request %#', (requested, message) => {
    expect(() => resolveAttendanceAnalyticsWindow(requested, now)).toThrow(message);
  });
});

describe('attendance analytics location fairness', () => {
  const eventLatitude = -22.121;
  const eventLongitude = -51.408;

  it('does not flag isolated distant points or a stable distant sequence', () => {
    const attendances = Array.from({ length: 8 }, (_, index) =>
      attendance({
        minute: index,
        latitude: -22.021,
        longitude: -51.408,
        accuracyMeters: 4,
      }),
    );

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([]);
  });

  it('does not flag a single apparent teleport even when reported accuracy is optimistic', () => {
    const attendances = [
      attendance({ minute: 0, latitude: eventLatitude, longitude: eventLongitude }),
      attendance({ minute: 1, latitude: -22.021, longitude: eventLongitude, accuracyMeters: 3 }),
      ...Array.from({ length: 5 }, (_, index) =>
        attendance({ minute: index + 2, latitude: -22.021, longitude: eventLongitude, accuracyMeters: 3 }),
      ),
    ];

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([]);
  });

  it('flags only repeated near-to-far transitions across a sufficiently large scan session', () => {
    const attendances = Array.from({ length: 8 }, (_, index) =>
      attendance({
        minute: index,
        latitude: index % 2 === 0 ? eventLatitude : -22.021,
        longitude: eventLongitude,
        accuracyMeters: 5,
      }),
    );

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([
      { actorId: 'collector-1', transitionCount: 7, scanCount: 8 },
    ]);
  });

  it('keeps the distance calculation within a realistic tolerance', () => {
    expect(haversineMeters(eventLatitude, eventLongitude, eventLatitude, eventLongitude)).toBe(0);
    expect(haversineMeters(eventLatitude, eventLongitude, -22.021, eventLongitude)).toBeGreaterThan(10_000);
  });
});

function attendance(input: { minute: number; latitude: number; longitude: number; accuracyMeters?: number }) {
  const attendedAt = new Date(Date.UTC(2026, 7, 16, 18, input.minute));
  return {
    personId: `person-${input.minute}`,
    attendedAt,
    createdAt: attendedAt,
    createdById: 'collector-1',
    committedById: 'collector-1',
    createdByMethod: AttendanceCreationMethod.SCANNER,
    status: 'PRESENT' as const,
    collectedLatitude: input.latitude,
    collectedLongitude: input.longitude,
    collectedAccuracyMeters: input.accuracyMeters ?? 5,
  };
}
