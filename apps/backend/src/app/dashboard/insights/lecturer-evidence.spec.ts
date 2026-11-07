import { PrismaService } from '../../prisma/prisma.service';
import { buildInconsistencies } from './inconsistencies';
import { createPrismaMock, insightEvent } from './insights-service.fixtures';
import { loadLecturerEvidence } from './lecturer-evidence';

describe('dashboard lecturer evidence', () => {
  it('loads lecturer evidence in bounded batches without discarding or reordering events', async () => {
    const prisma = createPrismaMock();
    const events = Array.from({ length: 205 }, (_, index) =>
      insightEvent({
        id: `event-${index}`,
        lecturers: [{ personId: `lecturer-${index}`, person: { id: `lecturer-${index}`, name: 'Lecturer' } }],
      }),
    );
    const noLecturers = insightEvent({ id: 'no-lecturers' });
    events.splice(1, 0, noLecturers);
    const records = events.map((event) => ({ eventId: event.id, personId: `lecturer-${event.id.slice(6)}` }));
    type Scope = { eventId: string; personId: { in: string[] } };
    const selectMatching = (args: { where: { OR: Scope[] } }) =>
      records.filter((record) =>
        args.where.OR.some((scope) => scope.eventId === record.eventId && scope.personId.in.includes(record.personId)),
      );
    prisma.eventSubscription.findMany.mockImplementation(selectMatching);
    prisma.eventAttendance.findMany.mockImplementation(selectMatching);

    const result = await loadLecturerEvidence(prisma as unknown as PrismaService, events);

    expect(result.map((event) => event.id)).toEqual(events.map((event) => event.id));
    expect(result[1]).toMatchObject({ subscriptions: [], attendances: [] });
    expect(result.at(-1)).toMatchObject({
      subscriptions: [{ personId: 'lecturer-204' }],
      attendances: [{ personId: 'lecturer-204' }],
    });
    for (const query of [prisma.eventSubscription.findMany, prisma.eventAttendance.findMany]) {
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls.map(([args]) => args.where.OR.length)).toEqual([100, 100, 5]);
      expect(query.mock.calls.flatMap(([args]) => args.where.OR)).toEqual(
        events
          .filter((event) => event.lecturers.length > 0)
          .map((event) => ({
            eventId: event.id,
            personId: { in: event.lecturers.map((lecturer) => lecturer.personId) },
          })),
      );
    }
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PRESENT' }) }),
    );
  });

  it('produces the same lecturer warnings and ordering without loading the non-lecturer audience', async () => {
    const prisma = createPrismaMock();
    const now = new Date();
    const lecturer = { personId: 'lecturer', person: { id: 'lecturer', name: 'Lecturer' } };
    const audience = Array.from({ length: 10_000 }, (_, index) => ({ personId: `subscriber-${index}` }));
    const event = insightEvent({
      startDate: new Date(now.getTime() + 60_000),
      endDate: new Date(now.getTime() + 120_000),
      lecturers: [lecturer],
      subscriptions: [...audience, { personId: lecturer.personId }],
      attendances: [...audience, { personId: lecturer.personId }],
    });
    prisma.eventSubscription.findMany.mockResolvedValue([{ eventId: event.id, personId: lecturer.personId }]);
    prisma.eventAttendance.findMany.mockResolvedValue([{ eventId: event.id, personId: lecturer.personId }]);
    const evidence = await loadLecturerEvidence(prisma as unknown as PrismaService, [event]);
    const input = {
      now,
      majorEventsWithSubscriptionDates: [],
      singleEventGroups: [],
      mismatchingCertificateGroupEvents: [],
      pastCertificateEventsWithoutAttendance: [],
      pastCertificateEventsWithoutAttendanceCollection: [],
    };

    expect(buildInconsistencies({ ...input, events: evidence })).toEqual(
      buildInconsistencies({ ...input, events: [event] }),
    );
    expect(
      buildInconsistencies({ ...input, events: evidence })
        .filter((warning) => warning.type.startsWith('LECTURER_SELF_'))
        .map((warning) => warning.type),
    ).toEqual(['LECTURER_SELF_SUBSCRIBED', 'LECTURER_SELF_ATTENDED']);
    expect(evidence[0].subscriptions).toEqual([{ personId: lecturer.personId }]);
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ eventId: event.id, personId: { in: ['lecturer'] } }] },
      select: { eventId: true, personId: true },
    });
  });

  it('does not query evidence when events have no lecturers', async () => {
    const prisma = createPrismaMock();
    await loadLecturerEvidence(prisma as unknown as PrismaService, [insightEvent()]);
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
  });
});
