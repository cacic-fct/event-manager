import { PublicEventsResolver } from './events.resolver';
import { PUBLIC_EVENT_WHERE, PUBLIC_MAJOR_EVENT_WHERE } from './models';

describe('PublicEventsResolver lecturer profiles', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses Typesense rank for public event searches before applying pagination', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-b' }]),
      },
    };
    const typesenseSearch = createTypesenseSearch({
      available: true,
      ids: ['event-b'],
    });
    const resolver = new PublicEventsResolver(prisma as never, typesenseSearch as never);

    await expect(
      resolver.publicEvents(' aula ', undefined, undefined, undefined, undefined, 250, 100),
    ).resolves.toEqual([{ id: 'event-b' }]);

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', {
      filterBy: 'publiclyVisible:=true && publicationState:=PUBLISHED && majorEventPublicationState:=PUBLISHED',
      limit: 100,
      offset: 250,
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [PUBLIC_EVENT_WHERE, { id: { in: ['event-b'] } }],
        },
        skip: 0,
        take: 1,
      }),
    );
  });

  it('falls back to SQL name search for public events when Typesense is unavailable', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const typesenseSearch = createTypesenseSearch({
      available: false,
      ids: [],
    });
    const resolver = new PublicEventsResolver(prisma as never, typesenseSearch as never);

    await resolver.publicEvents('aula', undefined, undefined, 'major-1', 'group-1', 5, 10);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            PUBLIC_EVENT_WHERE,
            { eventGroupId: 'group-1' },
            { majorEventId: 'major-1' },
            {
              name: {
                contains: 'aula',
                mode: 'insensitive',
              },
            },
          ],
        },
        skip: 5,
        take: 10,
      }),
    );
  });

  it('loads public event detail through the shared public publication predicate', async () => {
    const event = { id: 'event-1', name: 'Evento público' };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(event),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.publicEvent('event-1')).resolves.toBe(event);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { id: 'event-1' }],
      },
      select: expect.any(Object),
    });
  });

  it('computes standalone event availability only for public events', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', slots: 2 }),
      },
      eventSubscription: {
        groupBy: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            _count: {
              personId: 1,
            },
          },
        ]),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.publicEventSubscriptionSummary('event-1')).resolves.toEqual({
      eventId: 'event-1',
      hasAvailableSlots: true,
    });

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { id: 'event-1' }],
      },
      select: {
        id: true,
        slots: true,
      },
    });
    expect(prisma.eventSubscription.groupBy).toHaveBeenCalledWith({
      by: ['eventId'],
      where: {
        eventId: {
          in: ['event-1'],
        },
        deletedAt: null,
      },
      _count: {
        personId: true,
      },
    });
  });

  it('orders public calendar events by date and Typesense rank for same-date matches', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-23T12:00:00.000Z'));
    const sameStartDate = new Date('2026-06-24T12:00:00.000Z');
    const laterStartDate = new Date('2026-06-25T12:00:00.000Z');
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'event-b', startDate: sameStartDate },
          { id: 'event-c', startDate: laterStartDate },
          { id: 'event-a', startDate: sameStartDate },
        ]),
      },
    };
    const typesenseSearch = createTypesenseSearch({
      available: true,
      ids: ['event-a', 'event-b', 'event-c'],
    });
    const resolver = new PublicEventsResolver(prisma as never, typesenseSearch as never);

    await expect(
      resolver.publicCalendarEvents(' aula ', undefined, new Date('2026-06-23T00:00:00.000Z')),
    ).resolves.toEqual([
      { id: 'event-a', startDate: sameStartDate },
      { id: 'event-b', startDate: sameStartDate },
      { id: 'event-c', startDate: laterStartDate },
    ]);

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', {
      filterBy: 'publiclyVisible:=true && publicationState:=PUBLISHED && majorEventPublicationState:=PUBLISHED && startDate:>=1782172800',
      limit: 500,
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            PUBLIC_EVENT_WHERE,
            {
              startDate: {
                gte: new Date('2026-06-23T00:00:00.000Z'),
              },
            },
            { id: { in: ['event-a', 'event-b', 'event-c'] } },
          ],
        },
      }),
    );
  });

  it('builds major-event subscription pages from published major events and visible child events only', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-23T12:00:00.000Z'));
    const majorEvent = createMajorEventRecord('major-1');
    const event = {
      id: 'event-1',
      slots: 1,
      startDate: new Date('2026-06-24T12:00:00.000Z'),
    };
    const prisma = {
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(majorEvent),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      eventSubscription: {
        groupBy: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            _count: {
              personId: 1,
            },
          },
        ]),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.publicMajorEventSubscriptionPage('major-1')).resolves.toEqual({
      majorEvent: expect.objectContaining({
        id: 'major-1',
        name: 'Major 1',
      }),
      events: [event],
      subscriptionSummaries: [
        {
          eventId: 'event-1',
          hasAvailableSlots: false,
        },
      ],
    });

    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: {
        ...PUBLIC_MAJOR_EVENT_WHERE,
        id: 'major-1',
      },
      select: expect.any(Object),
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            AND: [
              PUBLIC_EVENT_WHERE,
              {
                allowSubscription: true,
                majorEventId: {
                  not: null,
                },
                OR: [
                  { subscriptionEndDate: null },
                  { subscriptionEndDate: { gte: new Date('2026-06-23T12:00:00.000Z') } },
                ],
              },
            ],
          },
          { majorEventId: 'major-1' },
        ],
      },
      select: expect.any(Object),
      orderBy: {
        startDate: 'asc',
      },
    });
  });

  it('maps event lecturers to public profiles and hides unpublished Google pictures', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            person: {
              id: 'person-1',
              name: 'Ada Lovelace',
              lecturerProfile: {
                id: 'profile-1',
                displayName: 'Ada Lovelace',
                biography: 'Bio',
                publishGoogleUserPicture: false,
                googleUserPicture: 'https://example.com/private.png',
                email: 'ada@example.com',
                whatsapp: '+5518999999999',
              },
            },
          },
        ]),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.lecturers({ id: 'event-1' } as never)).resolves.toEqual([
      {
        id: 'profile-1',
        displayName: 'Ada Lovelace',
        biography: 'Bio',
        publishGoogleUserPicture: false,
        googleUserPicture: null,
        email: 'ada@example.com',
        whatsapp: '+5518999999999',
      },
    ]);

    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-1'],
          },
        }),
      }),
    );
  });

  it('does not expose lecturers without a public lecturer profile', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            person: {
              id: 'person-1',
              name: 'Grace Hopper',
              lecturerProfile: null,
            },
          },
        ]),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.lecturers({ id: 'event-1' } as never)).resolves.toEqual([]);

    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: {
            in: ['event-1'],
          },
          person: {
            deletedAt: null,
            lecturerProfile: {
              isNot: null,
            },
          },
        },
      }),
    );
  });

  it('batches lecturer profile loading for multiple public events in the same request', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            person: {
              id: 'person-1',
              name: 'Ada Lovelace',
              lecturerProfile: {
                id: 'profile-1',
                displayName: 'Ada Lovelace',
                biography: 'Bio 1',
                publishGoogleUserPicture: true,
                googleUserPicture: 'https://example.com/ada.png',
                email: 'ada@example.com',
                whatsapp: '+5518999999999',
              },
            },
          },
          {
            eventId: 'event-2',
            person: {
              id: 'person-2',
              name: 'Grace Hopper',
              lecturerProfile: {
                id: 'profile-2',
                displayName: 'Grace Hopper',
                biography: 'Bio 2',
                publishGoogleUserPicture: false,
                googleUserPicture: 'https://example.com/grace.png',
                email: 'grace@example.com',
                whatsapp: '+5518888888888',
              },
            },
          },
        ]),
      },
    };
    const resolver = new PublicEventsResolver(prisma as never, { isEnabled: () => false } as never);
    const context = {};

    await expect(
      Promise.all([
        resolver.lecturers({ id: 'event-1' } as never, context),
        resolver.lecturers({ id: 'event-2' } as never, context),
      ]),
    ).resolves.toEqual([
      [
        {
          id: 'profile-1',
          displayName: 'Ada Lovelace',
          biography: 'Bio 1',
          publishGoogleUserPicture: true,
          googleUserPicture: 'https://example.com/ada.png',
          email: 'ada@example.com',
          whatsapp: '+5518999999999',
        },
      ],
      [
        {
          id: 'profile-2',
          displayName: 'Grace Hopper',
          biography: 'Bio 2',
          publishGoogleUserPicture: false,
          googleUserPicture: null,
          email: 'grace@example.com',
          whatsapp: '+5518888888888',
        },
      ],
    ]);

    expect(prisma.eventLecturer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-1', 'event-2'],
          },
        }),
      }),
    );
  });
});

function createTypesenseSearch(result: { available: boolean; ids: string[] }) {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    searchEvents: jest.fn().mockResolvedValue(result),
  };
}

function createMajorEventRecord(id: string) {
  return {
    id,
    name: 'Major 1',
    emoji: null,
    startDate: new Date('2026-06-24T12:00:00.000Z'),
    endDate: new Date('2026-06-25T12:00:00.000Z'),
    description: null,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    isPaymentRequired: false,
    additionalPaymentInfo: null,
    certificateConfigs: [],
    majorEventPrices: [],
  };
}
