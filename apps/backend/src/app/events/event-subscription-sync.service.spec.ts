import { EventSubscriptionSyncService } from './event-subscription-sync.service';
const { jest } = import.meta;

describe('event subscription capacity checks', () => {
  it('counts all limited events together and ignores unlimited events', async () => {
    const tx = {
      event: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'limited', slots: 2 },
          { id: 'empty', slots: 1 },
          { id: 'unlimited', slots: null },
        ]),
      },
      eventSubscription: { groupBy: jest.fn().mockResolvedValue([{ eventId: 'limited', _count: { _all: 1 } }]) },
    };
    const service = new EventSubscriptionSyncService();
    await expect(
      service.ensureEventIdsHaveAvailableSlots(tx as never, ['limited', 'limited', 'empty', 'unlimited']),
    ).resolves.toBeUndefined();
    expect(tx.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['limited', 'empty', 'unlimited'] }, deletedAt: null },
      }),
    );
    expect(tx.eventSubscription.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.eventSubscription.groupBy).toHaveBeenCalledWith({
      by: ['eventId'],
      where: { eventId: { in: ['limited', 'empty'] }, deletedAt: null },
      _count: { _all: true },
    });
  });

  it.each([
    [0, 0],
    [1, 1],
    [1, 2],
  ])('rejects a capacity of %i with %i active registrations', async (slots, count) => {
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'full', slots }]) },
      eventSubscription: {
        groupBy: jest.fn().mockResolvedValue(count ? [{ eventId: 'full', _count: { _all: count } }] : []),
      },
    };
    await expect(
      new EventSubscriptionSyncService().ensureEventIdsHaveAvailableSlots(tx as never, ['full']),
    ).rejects.toThrow('has no available slots');
  });

  it('does not count registrations when every selected event is unlimited', async () => {
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'unlimited', slots: null }]) },
      eventSubscription: { groupBy: jest.fn() },
    };
    await new EventSubscriptionSyncService().ensureEventIdsHaveAvailableSlots(tx as never, ['unlimited']);
    expect(tx.eventSubscription.groupBy).not.toHaveBeenCalled();
  });

  it('rejects missing events before counting registrations', async () => {
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventSubscription: { groupBy: jest.fn() },
    };
    await expect(
      new EventSubscriptionSyncService().ensureEventIdsHaveAvailableSlots(tx as never, ['missing']),
    ).rejects.toThrow('not available: missing');
    expect(tx.eventSubscription.groupBy).not.toHaveBeenCalled();
  });
});
