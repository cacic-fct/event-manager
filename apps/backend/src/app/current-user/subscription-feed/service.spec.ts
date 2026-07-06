import { CurrentUserSubscriptionFeedService } from './service';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';

describe('CurrentUserSubscriptionFeedService', () => {
  it('adds attendance-only standalone events and standalone event groups to the feed', async () => {
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventGroupSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      certificate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          { event: event('standalone-attended', 'Evento com presença') },
          { event: event('group-child', 'Atividade em grupo', 'group-attended') },
        ]),
      },
    };
    const mapper = {
      mapCurrentUserSubscriptionFeedSingleEventItem: jest.fn(),
      mapCurrentUserSubscriptionFeedEventGroupItem: jest.fn(),
      mapCurrentUserEventFeedItem: jest.fn((item, participation) => ({
        type: 'SINGLE_EVENT',
        eventId: item.id,
        event: item,
        date: item.startDate,
        createdAt: item.startDate,
        participation,
      })),
      getSubscribedParticipation: jest.fn(() => ({
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      })),
      mapPublicEventGroup: jest.fn((group) => group),
      compareFeedDatesDescending: jest.fn(
        (firstDate: Date, firstCreatedAt: Date, secondDate: Date, secondCreatedAt: Date) =>
          secondDate.getTime() - firstDate.getTime() || secondCreatedAt.getTime() - firstCreatedAt.getTime(),
      ),
    };
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    await expect(service.getCurrentUserSubscriptionFeed('person-1')).resolves.toEqual({
      items: [
        expect.objectContaining({
          type: 'EVENT_GROUP',
          eventGroupId: 'group-attended',
          participation: {
            isSubscribed: false,
            isLecturer: false,
            hasIssuedCertificate: false,
          },
        }),
        expect.objectContaining({
          type: 'SINGLE_EVENT',
          eventId: 'standalone-attended',
          participation: {
            isSubscribed: false,
            isLecturer: false,
            hasIssuedCertificate: false,
          },
        }),
      ],
    });

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 'person-1',
          event: {
            AND: [PUBLIC_EVENT_WHERE],
          },
        },
      }),
    );
  });
});

function event(id: string, name: string, eventGroupId: string | null = null) {
  return {
    id,
    name,
    startDate: new Date(id === 'group-child' ? '2026-07-02T12:00:00.000Z' : '2026-07-01T12:00:00.000Z'),
    endDate: new Date(id === 'group-child' ? '2026-07-02T14:00:00.000Z' : '2026-07-01T14:00:00.000Z'),
    emoji: '🎓',
    type: 'OTHER',
    majorEventId: null,
    eventGroupId,
    eventGroup: eventGroupId
      ? {
          id: eventGroupId,
          name: 'Grupo com presença',
          emoji: '🧪',
          shouldIssueCertificate: true,
          shouldIssueCertificateForEachEvent: false,
          shouldIssuePartialCertificate: true,
        }
      : null,
  };
}
