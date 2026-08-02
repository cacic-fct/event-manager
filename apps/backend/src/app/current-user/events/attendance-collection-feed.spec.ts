import { getAttendanceOralRoster } from './attendance-collection-feed';

describe('getAttendanceOralRoster', () => {
  it('returns the entire subscriber roster with masked CPF and explicit decisions', async () => {
    const prisma = {
      event: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'event-1',
          majorEventId: null,
          autoSubscribe: false,
        }),
      },
      people: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'person-absent',
            name: 'Ada Lovelace',
            identityDocument: '52998224725',
            isCPF: true,
            user: { unespRole: ['Graduação'] },
          },
          {
            id: 'person-undecided',
            name: 'Grace Hopper',
            identityDocument: '18999999999',
            isCPF: null,
            user: null,
          },
        ]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: 'person-absent',
            eventId: 'event-1',
            status: 'ABSENT',
            attendedAt: new Date('2026-07-29T12:00:00.000Z'),
            createdById: 'collector-1',
            committedById: 'collector-1',
            createdByMethod: 'ORAL_CALL',
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'collector-1', name: 'Katherine Johnson' }]),
      },
    };

    await expect(getAttendanceOralRoster(prisma as never, 'event-1')).resolves.toEqual([
      expect.objectContaining({
        personId: 'person-absent',
        identityDocument: '•••.982.247-••',
        status: 'ABSENT',
        collectedByFirstName: 'Katherine',
      }),
      expect.objectContaining({
        personId: 'person-undecided',
        identityDocument: '18999999999',
        status: undefined,
      }),
    ]);
    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [expect.objectContaining({ eventSubscriptions: expect.any(Object) })],
        }),
      }),
    );
  });

  it('includes confirmed major-event subscribers selected for the event', async () => {
    const prisma = {
      event: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'event-1',
          majorEventId: 'major-1',
          autoSubscribe: false,
        }),
      },
      people: { findMany: jest.fn().mockResolvedValue([]) },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await getAttendanceOralRoster(prisma as never, 'event-1');

    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              majorEventSubscriptions: {
                some: expect.objectContaining({
                  majorEventId: 'major-1',
                  subscriptionStatus: 'CONFIRMED',
                  selectedEvents: { some: { eventId: 'event-1', deletedAt: null } },
                }),
              },
            }),
          ]),
        }),
      }),
    );
  });

  it('includes every confirmed major-event subscriber when the event auto-subscribes', async () => {
    const prisma = {
      event: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'event-1',
          majorEventId: 'major-1',
          autoSubscribe: true,
        }),
      },
      people: { findMany: jest.fn().mockResolvedValue([]) },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await getAttendanceOralRoster(prisma as never, 'event-1');

    const peopleWhere = prisma.people.findMany.mock.calls[0][0].where;
    const majorEventFilter = peopleWhere.OR[1].majorEventSubscriptions.some;
    expect(majorEventFilter).toEqual({
      majorEventId: 'major-1',
      deletedAt: null,
      subscriptionStatus: 'CONFIRMED',
    });
    expect(majorEventFilter).not.toHaveProperty('selectedEvents');
  });
});
