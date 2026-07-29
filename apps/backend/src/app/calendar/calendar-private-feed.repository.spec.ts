import { getPrivateFeedEvents } from './calendar-private-feed.repository';

describe('getPrivateFeedEvents', () => {
  it('uses only present attendances as private-calendar evidence', async () => {
    const prisma = {
      eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      majorEventSubscriptionEventSelection: { findMany: jest.fn().mockResolvedValue([]) },
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
  });
});
