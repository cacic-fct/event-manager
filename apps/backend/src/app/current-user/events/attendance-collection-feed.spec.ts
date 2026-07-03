import { getAttendanceScannerFeed } from './attendance-collection-feed';
import { createPrisma, scannerAttendance } from './attendance-collection.resolver.spec-support';

describe('getAttendanceScannerFeed', () => {
  it('marks subscribed standalone event attendees as confirmed', async () => {
    const prisma = createPrisma({
      attendances: [
        scannerAttendance({
          personId: 'person-subscribed',
          eventId: 'standalone-event',
          allowSubscription: true,
          majorEventId: null,
        }),
        scannerAttendance({
          personId: 'person-unsubscribed',
          eventId: 'standalone-event',
          allowSubscription: true,
          majorEventId: null,
        }),
      ],
      eventSubscriptions: [{ personId: 'person-subscribed', eventId: 'standalone-event' }],
      majorEventSubscriptions: [],
      collectors: [],
      people: [],
      collectorUsers: [],
    });
    const feed = await getAttendanceScannerFeed(prisma as never, 'standalone-event');

    expect(feed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: 'person-subscribed',
          subscriptionStatus: 'CONFIRMED',
        }),
        expect.objectContaining({
          personId: 'person-unsubscribed',
          subscriptionStatus: undefined,
        }),
      ]),
    );
  });

  it('uses major event subscription statuses and collector first names in the scanner feed', async () => {
    const prisma = createPrisma({
      attendances: [
        scannerAttendance({
          personId: 'person-confirmed',
          eventId: 'major-session',
          allowSubscription: true,
          majorEventId: 'major-event',
          createdById: 'collector-user',
        }),
      ],
      eventSubscriptions: [],
      majorEventSubscriptions: [{ personId: 'person-confirmed', subscriptionStatus: 'CONFIRMED' }],
      collectors: [],
      people: [],
      collectorUsers: [{ id: 'collector-user', name: ' Grace Hopper ' }],
    });
    const feed = await getAttendanceScannerFeed(prisma as never, 'major-session');

    expect(feed).toEqual([
      expect.objectContaining({
        personId: 'person-confirmed',
        subscriptionStatus: 'CONFIRMED',
        collectedByFirstName: 'Grace',
      }),
    ]);
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
  });
});
