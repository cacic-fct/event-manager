import { getPrivateFeedEvents } from './calendar-private-feed.repository';

describe('getPrivateFeedEvents', () => {
  it('uses only present attendances as private-calendar evidence', async () => {
    const prisma = {
      eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      majorEventSubscriptionEventSelection: { findMany: jest.fn().mockResolvedValue([]) },
      sportsMatch: { findMany: jest.fn().mockResolvedValue([]) },
      eventLecturer: { findMany: jest.fn().mockResolvedValue([]) },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      certificate: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await expect(getPrivateFeedEvents(prisma as never, ['person-1'])).resolves.toEqual([]);

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: { in: ['person-1'] },
          status: 'PRESENT',
        }),
      }),
    );

    const lecturerQuery = prisma.eventLecturer.findMany.mock.calls[0]?.[0] as
      | { where?: Record<string, unknown> }
      | undefined;
    expect(lecturerQuery?.where).not.toHaveProperty('status');
  });

  it('includes matches only through approved player rosters', async () => {
    const event = { id: 'event-1' };
    const sportsMatchFindMany = jest.fn().mockResolvedValue([{ event }]);
    const prisma = {
      eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsMatch: { findMany: sportsMatchFindMany },
      eventLecturer: { findMany: jest.fn().mockResolvedValue([]) },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      certificate: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await expect(getPrivateFeedEvents(prisma as never, ['person-1'])).resolves.toEqual([event]);

    expect(sportsMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rosters: {
            some: expect.objectContaining({
              status: 'APPROVED',
            }),
          },
        }),
      }),
    );
  });
});
