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
      mapPublicEvent: jest.fn((event) => event),
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

  it('does not add non-standalone lecturer or certificate events as standalone feed rows', async () => {
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventGroupSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventLecturer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              event: event('major-group-child', 'Palestra em grande evento', 'major-group', 'major-1'),
            },
          ]),
      },
      certificate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              config: {
                event: event('group-certificate-child', 'Certificado de atividade em grupo', 'group-1'),
              },
            },
          ])
          .mockResolvedValueOnce([]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
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
      mapPublicEvent: jest.fn((event) => event),
      compareFeedDatesDescending: jest.fn(
        (firstDate: Date, firstCreatedAt: Date, secondDate: Date, secondCreatedAt: Date) =>
          secondDate.getTime() - firstDate.getTime() || secondCreatedAt.getTime() - firstCreatedAt.getTime(),
      ),
    };
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    await expect(service.getCurrentUserSubscriptionFeed('person-1')).resolves.toEqual({
      items: [],
    });

    expect(prisma.eventLecturer.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          event: expect.objectContaining({
            majorEventId: null,
            eventGroupId: {
              not: null,
            },
          }),
        }),
      }),
    );
    expect(prisma.certificate.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          config: expect.objectContaining({
            event: expect.objectContaining({
              majorEventId: null,
              eventGroupId: null,
            }),
          }),
        }),
      }),
    );
    expect(mapper.mapCurrentUserEventFeedItem).not.toHaveBeenCalled();
  });

  it('adds subscribed event groups using the first non-major child event date', async () => {
    const childDate = new Date('2026-07-03T12:00:00.000Z');
    const prisma = createPrisma({
      eventSubscriptions: [
        [],
        [
          {
            eventGroupSubscriptionId: 'subscription-group-1',
            event: { startDate: new Date('2026-07-04T12:00:00.000Z') },
          },
          {
            eventGroupSubscriptionId: 'subscription-group-1',
            event: { startDate: childDate },
          },
          {
            eventGroupSubscriptionId: null,
            event: { startDate: new Date('2026-07-01T12:00:00.000Z') },
          },
        ],
      ],
      eventGroupSubscriptions: [
        {
          id: 'subscription-group-1',
          eventGroupId: 'group-1',
          eventGroup: eventGroup('group-1', 'Grupo inscrito'),
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ],
      certificateEventGroups: [
        {
          config: {
            eventGroupId: 'group-1',
            eventGroup: {
              ...eventGroup('group-1', 'Grupo inscrito'),
              events: [{ startDate: childDate }],
            },
          },
        },
      ],
    });
    const mapper = createMapper();
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    await expect(service.getCurrentUserSubscriptionFeed('person-1')).resolves.toEqual({
      items: [
        expect.objectContaining({
          type: 'EVENT_GROUP',
          eventGroupId: 'group-1',
          date: childDate,
          participation: {
            isSubscribed: true,
            isLecturer: false,
            hasIssuedCertificate: true,
          },
        }),
      ],
    });

    expect(prisma.eventSubscription.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'person-1',
          eventGroupSubscriptionId: {
            in: ['subscription-group-1'],
          },
        }),
      }),
    );
    expect(mapper.mapCurrentUserSubscriptionFeedEventGroupItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'subscription-group-1' }),
      childDate,
      {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: true,
      },
    );
  });

  it('adds lecturer-only and certificate-only event groups without duplicating subscribed groups', async () => {
    const lecturerGroupDate = new Date('2026-07-05T12:00:00.000Z');
    const earlierLecturerGroupDate = new Date('2026-07-04T12:00:00.000Z');
    const certificateGroupDate = new Date('2026-07-03T12:00:00.000Z');
    const subscribedGroup = eventGroup('subscribed-group', 'Grupo inscrito');
    const lecturerGroup = eventGroup('lecturer-group', 'Grupo como ministrante');
    const certificateGroup = eventGroup('certificate-group', 'Grupo certificado');
    const prisma = createPrisma({
      eventSubscriptions: [[], []],
      eventGroupSubscriptions: [
        {
          id: 'subscription-group-1',
          eventGroupId: 'subscribed-group',
          eventGroup: subscribedGroup,
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ],
      lecturerEventGroups: [
        {
          event: {
            id: 'lecturer-later',
            startDate: lecturerGroupDate,
            majorEventId: null,
            eventGroupId: 'lecturer-group',
            eventGroup: lecturerGroup,
          },
        },
        {
          event: {
            id: 'lecturer-earlier',
            startDate: earlierLecturerGroupDate,
            majorEventId: null,
            eventGroupId: 'lecturer-group',
            eventGroup: lecturerGroup,
          },
        },
        {
          event: {
            id: 'subscribed-lecturer',
            startDate: new Date('2026-07-01T12:00:00.000Z'),
            majorEventId: null,
            eventGroupId: 'subscribed-group',
            eventGroup: subscribedGroup,
          },
        },
      ],
      certificateEventGroups: [
        {
          config: {
            eventGroupId: 'certificate-group',
            eventGroup: {
              ...certificateGroup,
              events: [{ startDate: certificateGroupDate }],
            },
          },
        },
        {
          config: {
            eventGroupId: 'empty-certificate-group',
            eventGroup: {
              ...eventGroup('empty-certificate-group', 'Grupo sem eventos'),
              events: [],
            },
          },
        },
      ],
    });
    const mapper = createMapper();
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    const result = await service.getCurrentUserSubscriptionFeed('person-1');

    expect(result.items).toEqual([
      expect.objectContaining({
        type: 'EVENT_GROUP',
        eventGroupId: 'lecturer-group',
        date: earlierLecturerGroupDate,
        participation: {
          isSubscribed: false,
          isLecturer: true,
          hasIssuedCertificate: false,
        },
      }),
      expect.objectContaining({
        type: 'EVENT_GROUP',
        eventGroupId: 'certificate-group',
        date: certificateGroupDate,
        participation: {
          isSubscribed: false,
          isLecturer: false,
          hasIssuedCertificate: true,
        },
      }),
    ]);
    expect(result.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventGroupId: 'subscribed-group' }),
        expect.objectContaining({ eventGroupId: 'empty-certificate-group' }),
      ]),
    );
    expect(mapper.mapPublicEventGroup).toHaveBeenCalledWith(lecturerGroup);
    expect(mapper.mapPublicEventGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'certificate-group' }));
  });

  it('prefers certificate event groups over lecturer rows and lecturer groups over attendance rows', async () => {
    const sharedGroupDate = new Date('2026-07-03T12:00:00.000Z');
    const lecturerAttendanceGroupDate = new Date('2026-07-04T12:00:00.000Z');
    const certificateLecturerGroup = eventGroup('certificate-lecturer-group', 'Grupo certificado e ministrado');
    const lecturerAttendanceGroup = eventGroup('lecturer-attendance-group', 'Grupo ministrado e frequentado');
    const prisma = createPrisma({
      lecturerEventGroups: [
        {
          event: {
            id: 'certificate-lecturer-event',
            startDate: sharedGroupDate,
            majorEventId: null,
            eventGroupId: 'certificate-lecturer-group',
            eventGroup: certificateLecturerGroup,
          },
        },
        {
          event: {
            id: 'lecturer-attendance-event',
            startDate: lecturerAttendanceGroupDate,
            majorEventId: null,
            eventGroupId: 'lecturer-attendance-group',
            eventGroup: lecturerAttendanceGroup,
          },
        },
      ],
      certificateEventGroups: [
        {
          config: {
            eventGroupId: 'certificate-lecturer-group',
            eventGroup: {
              ...certificateLecturerGroup,
              events: [{ startDate: sharedGroupDate }],
            },
          },
        },
      ],
      attendanceEvents: [
        {
          event: event('attended-child', 'Atividade frequentada', 'lecturer-attendance-group'),
        },
      ],
    });
    const mapper = createMapper();
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    const result = await service.getCurrentUserSubscriptionFeed('person-1');

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventGroupId: 'certificate-lecturer-group',
          participation: {
            isSubscribed: false,
            isLecturer: true,
            hasIssuedCertificate: true,
          },
        }),
        expect.objectContaining({
          eventGroupId: 'lecturer-attendance-group',
          participation: {
            isSubscribed: false,
            isLecturer: true,
            hasIssuedCertificate: false,
          },
        }),
      ]),
    );
    expect(result.items.filter((item) => item.type === 'EVENT_GROUP')).toHaveLength(2);
  });

  it('merges single-event feed participation from subscriptions, lecturer assignments, certificates, and attendance', async () => {
    const subscribedEvent = event('subscribed-event', 'Evento inscrito');
    const lecturerEvent = event('lecturer-event', 'Evento como ministrante');
    const certificateEvent = event('certificate-event', 'Evento certificado');
    const attendedSubscribedEvent = event('subscribed-event', 'Evento inscrito com presença');
    const prisma = createPrisma({
      eventSubscriptions: [
        [
          {
            id: 'subscription-1',
            eventId: 'subscribed-event',
            event: subscribedEvent,
            createdAt: new Date('2026-06-01T12:00:00.000Z'),
          },
        ],
      ],
      lecturerEvents: [{ event: lecturerEvent }],
      certificateEvents: [{ config: { event: certificateEvent } }],
      attendanceEvents: [{ event: attendedSubscribedEvent }],
    });
    const mapper = createMapper();
    const service = new CurrentUserSubscriptionFeedService(prisma as never, mapper as never);

    const result = await service.getCurrentUserSubscriptionFeed('person-1');

    expect(result.items).toHaveLength(3);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SINGLE_EVENT',
          eventId: 'subscribed-event',
          participation: {
            isSubscribed: true,
            isLecturer: false,
            hasIssuedCertificate: false,
          },
        }),
        expect.objectContaining({
          type: 'SINGLE_EVENT',
          eventId: 'lecturer-event',
          participation: {
            isSubscribed: false,
            isLecturer: true,
            hasIssuedCertificate: false,
          },
        }),
        expect.objectContaining({
          type: 'SINGLE_EVENT',
          eventId: 'certificate-event',
          participation: {
            isSubscribed: false,
            isLecturer: false,
            hasIssuedCertificate: true,
          },
        }),
      ]),
    );
    expect(mapper.mapCurrentUserEventFeedItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'subscribed-event' }),
      expect.anything(),
    );
  });
});

function createPrisma(
  options: {
    eventSubscriptions?: unknown[][];
    eventGroupSubscriptions?: unknown[];
    lecturerEvents?: unknown[];
    lecturerEventGroups?: unknown[];
    certificateEvents?: unknown[];
    certificateEventGroups?: unknown[];
    attendanceEvents?: unknown[];
  } = {},
) {
  const eventSubscriptionResults = options.eventSubscriptions ?? [[]];
  return {
    eventSubscription: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(eventSubscriptionResults.shift() ?? [])),
    },
    eventGroupSubscription: {
      findMany: jest.fn().mockResolvedValue(options.eventGroupSubscriptions ?? []),
    },
    eventLecturer: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.lecturerEvents ?? [])
        .mockResolvedValueOnce(options.lecturerEventGroups ?? []),
    },
    certificate: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.certificateEvents ?? [])
        .mockResolvedValueOnce(options.certificateEventGroups ?? []),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue(options.attendanceEvents ?? []),
    },
  };
}

function createMapper() {
  return {
    mapCurrentUserSubscriptionFeedSingleEventItem: jest.fn((subscription, participation) => ({
      type: 'SINGLE_EVENT',
      eventId: subscription.eventId,
      event: subscription.event,
      date: subscription.event.startDate,
      createdAt: subscription.createdAt,
      participation,
    })),
    mapCurrentUserSubscriptionFeedEventGroupItem: jest.fn((subscription, date, participation) => ({
      type: 'EVENT_GROUP',
      eventGroupId: subscription.eventGroupId,
      eventGroup: subscription.eventGroup,
      date,
      createdAt: subscription.createdAt,
      participation,
    })),
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
    mapPublicEvent: jest.fn((publicEvent) => publicEvent),
    compareFeedDatesDescending: jest.fn(
      (firstDate: Date, firstCreatedAt: Date, secondDate: Date, secondCreatedAt: Date) =>
        secondDate.getTime() - firstDate.getTime() || secondCreatedAt.getTime() - firstCreatedAt.getTime(),
    ),
  };
}

function eventGroup(id: string, name: string) {
  return {
    id,
    name,
    emoji: '🧪',
    shouldIssueCertificate: true,
    shouldIssueCertificateForEachEvent: false,
    shouldIssuePartialCertificate: true,
  };
}

function event(id: string, name: string, eventGroupId: string | null = null, majorEventId: string | null = null) {
  return {
    id,
    name,
    startDate: new Date(id === 'group-child' ? '2026-07-02T12:00:00.000Z' : '2026-07-01T12:00:00.000Z'),
    endDate: new Date(id === 'group-child' ? '2026-07-02T14:00:00.000Z' : '2026-07-01T14:00:00.000Z'),
    emoji: '🎓',
    type: 'OTHER',
    majorEventId,
    eventGroupId,
    eventGroup: eventGroupId
      ? eventGroup(eventGroupId, 'Grupo com presença')
      : null,
  };
}
