import { PublicEventsResolver } from './events.resolver';

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
      filterBy: 'publiclyVisible:=true',
      limit: 100,
      offset: 250,
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          publiclyVisible: true,
          id: {
            in: ['event-b'],
          },
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
          deletedAt: null,
          publiclyVisible: true,
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
          name: {
            contains: 'aula',
            mode: 'insensitive',
          },
        },
        skip: 5,
        take: 10,
      }),
    );
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

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', 500);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          publiclyVisible: true,
          id: {
            in: ['event-a', 'event-b', 'event-c'],
          },
        }),
      }),
    );
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
