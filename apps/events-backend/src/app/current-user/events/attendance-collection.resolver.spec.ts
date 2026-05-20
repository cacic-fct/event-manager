import { CurrentUserAttendanceCollectionResolver } from './attendance-collection.resolver';

describe('CurrentUserAttendanceCollectionResolver scanner feed', () => {
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
    });
    const resolver = new CurrentUserAttendanceCollectionResolver(prisma as never, {} as never, {} as never);

    const feed = await (resolver as unknown as { getScannerFeed: (eventId: string) => Promise<ScannerFeedItem[]> })
      .getScannerFeed('standalone-event');

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
});

type ScannerFeedItem = {
  personId: string;
  subscriptionStatus?: string;
};

function scannerAttendance(input: {
  personId: string;
  eventId: string;
  allowSubscription: boolean;
  majorEventId: string | null;
}) {
  return {
    personId: input.personId,
    eventId: input.eventId,
    attendedAt: new Date('2026-05-20T12:00:00.000Z'),
    createdById: null,
    createdByMethod: 'SCANNER',
    person: {
      name: input.personId,
      user: {
        role: 'student',
      },
    },
    event: {
      allowSubscription: input.allowSubscription,
      majorEventId: input.majorEventId,
    },
  };
}

function createPrisma(input: {
  attendances: ReturnType<typeof scannerAttendance>[];
  eventSubscriptions: { personId: string; eventId: string }[];
  majorEventSubscriptions: { personId: string; subscriptionStatus: string }[];
}) {
  return {
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue(input.attendances),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.majorEventSubscriptions),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.eventSubscriptions),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}
