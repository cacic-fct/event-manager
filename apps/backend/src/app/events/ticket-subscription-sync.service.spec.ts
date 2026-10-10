import { TicketSubscriptionSyncService } from './ticket-subscription-sync.service';

describe('ticket subscription synchronization', () => {
  it('keeps entitlement keys stable across resubscription to avoid reminting transfers', async () => {
    const tickets = { syncForPerson: jest.fn() };
    const service = new TicketSubscriptionSyncService(tickets as never);
    const tx = {};
    await service.forEvent(tx as never, 'event', 'original-holder');
    await service.forEvent(tx as never, 'event', 'original-holder');
    expect(tickets.syncForPerson.mock.calls).toEqual([
      [tx, 'event', 'original-holder', 'EVENT_SUBSCRIPTION', 'event-subscription:event:original-holder'],
      [tx, 'event', 'original-holder', 'EVENT_SUBSCRIPTION', 'event-subscription:event:original-holder'],
    ]);
  });

  it('syncs hidden and grouped benefits even when their activity is unselected', async () => {
    const tickets = { syncForPerson: jest.fn() };
    const service = new TicketSubscriptionSyncService(tickets as never);
    const tx = { ticketConfig: { findMany: jest.fn().mockResolvedValue([{ eventId: 'hidden-kit' }]) } };
    await service.forMajorEvent(tx as never, 'major', 'person');
    expect(tx.ticketConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      event: { OR: [{ majorEventId: 'major' }, { majorEventId: null, eventGroup: { majorEventId: 'major' } }] },
    } }));
    expect(tickets.syncForPerson).toHaveBeenCalledWith(tx, 'hidden-kit', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:hidden-kit:person');
  });
});
