import { AttendanceCreationMethod } from '@prisma/client';
import {
  AttendanceAnalyticsService,
  findInconsistentLocationPatterns,
  haversineMeters,
  resolveAttendanceAnalyticsWindow,
} from './attendance-analytics.service';

describe('AttendanceAnalyticsService snapshot filtering', () => {
  afterEach(() => jest.useRealTimers());

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
      event: { findFirst: jest.fn().mockResolvedValue({
        id: 'event-1',
        name: 'Evento',
        emoji: '🎫',
        startDate: new Date('2026-08-16T12:00:00.000Z'),
        latitude: -22.121,
        longitude: -51.408,
        allowSubscription: true,
        majorEventId: null,
        autoSubscribe: false,
        sportsMatch: null,
      }) },
      eventAttendance: { findMany: jest.fn()
        .mockResolvedValueOnce(selectedAttendances)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ personId: 'person-1' }, { personId: 'person-2' }]) },
      offlineEventAttendanceSubmission: { findMany: jest.fn().mockResolvedValue([
        { id: 'offline-1', submittedAt: new Date('2026-08-16T17:58:00.000Z') },
      ]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'collector-1', name: 'Marina Costa' }]) },
      eventSubscription: { findMany: jest.fn().mockResolvedValue([
        { personId: 'person-1' }, { personId: 'person-2' }, { personId: 'person-3' },
      ]) },
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

    expect(prisma.eventAttendance.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { eventId: 'event-1', attendedAt: { gte: start, lte: end } },
    }));
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

function attendance(input: {
  minute: number;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}) {
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
