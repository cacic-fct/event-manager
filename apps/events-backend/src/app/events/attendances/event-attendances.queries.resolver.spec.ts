import { NotFoundException } from '@nestjs/common';
import { EventAttendancesQueriesResolver } from './event-attendances.queries.resolver';

describe('EventAttendancesQueriesResolver', () => {
  let prisma: ReturnType<typeof createFullPrisma>;
  let resolver: EventAttendancesQueriesResolver;

  beforeEach(() => {
    prisma = createFullPrisma();
    resolver = new EventAttendancesQueriesResolver(prisma as never, {} as never);
  });

  it('lists attendances with collector full names', async () => {
    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:00:00.000Z'),
        createdById: 'collector-1',
        person: { id: 'person-1' },
        event: { id: 'event-1' },
      },
      {
        personId: 'person-2',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:01:00.000Z'),
        createdById: null,
        person: { id: 'person-2' },
        event: { id: 'event-1' },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'collector-1', name: 'Grace Hopper' }]);

    await expect(resolver.eventAttendances('person-1', 'event-1', 1, 20)).resolves.toEqual([
      expect.objectContaining({ personId: 'person-1', collectedByFullName: 'Grace Hopper' }),
      expect.objectContaining({ personId: 'person-2', collectedByFullName: undefined }),
    ]);
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: 'person-1', eventId: 'event-1' }, skip: 1, take: 20 }),
    );
  });

  it('builds major event attendance rows from subscriptions and loose attendances', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([
      { id: 'event-1', name: 'Opening', startDate: new Date('2026-05-21T12:00:00.000Z') },
      { id: 'event-2', name: 'Workshop', startDate: new Date('2026-05-22T12:00:00.000Z') },
    ]);
    prisma.majorEventSubscription.findMany.mockResolvedValue([
      {
        id: 'subscription-1',
        personId: 'person-1',
        subscriptionStatus: 'CONFIRMED',
        amountPaid: 1000,
        paymentDate: new Date('2026-05-20T12:00:00.000Z'),
        paymentTier: 'student',
        person: { id: 'person-1', name: 'Ada' },
      },
    ]);
    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt: new Date('2026-05-21T12:30:00.000Z'),
        category: 'ATTENDEE',
        person: { id: 'person-1', name: 'Ada' },
      },
      {
        personId: 'person-2',
        eventId: 'event-2',
        attendedAt: new Date('2026-05-22T12:30:00.000Z'),
        category: 'NON_SUBSCRIBER',
        person: { id: 'person-2', name: 'Linus' },
      },
    ]);

    await expect(resolver.majorEventUserAttendances('major-1')).resolves.toEqual([
      expect.objectContaining({
        personId: 'person-1',
        subscriptionId: 'subscription-1',
        subscriptionStatus: 'CONFIRMED',
        attendances: [
          expect.objectContaining({ eventId: 'event-1', attended: true, category: 'ATTENDEE' }),
          expect.objectContaining({ eventId: 'event-2', attended: false, category: 'UNKNOWN' }),
        ],
      }),
      expect.objectContaining({
        personId: 'person-2',
        subscriptionStatus: 'UNKNOWN',
        attendances: [
          expect.objectContaining({ eventId: 'event-1', attended: false }),
          expect.objectContaining({ eventId: 'event-2', attended: true, category: 'NON_SUBSCRIBER' }),
        ],
      }),
    ]);

    prisma.majorEvent.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.majorEventUserAttendances('missing-major')).rejects.toBeInstanceOf(NotFoundException);

    prisma.majorEvent.findFirst.mockResolvedValueOnce({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValueOnce([]);
    await expect(resolver.majorEventUserAttendances('major-1')).resolves.toEqual([]);
  });

  it('returns one attendance or throws when it is missing', async () => {
    prisma.eventAttendance.findUnique.mockResolvedValue({ personId: 'person-1', eventId: 'event-1' });
    await expect(resolver.eventAttendance('person-1', 'event-1')).resolves.toEqual({ personId: 'person-1', eventId: 'event-1' });

    prisma.eventAttendance.findUnique.mockResolvedValue(null);
    await expect(resolver.eventAttendance('person-1', 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createFullPrisma() {
  return {
    $transaction: jest.fn(),
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn(),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    people: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
}
