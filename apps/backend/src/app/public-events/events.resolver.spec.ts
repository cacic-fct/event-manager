import { PublicEventsResolver } from './events.resolver';

describe('PublicEventsResolver lecturer profiles', () => {
  it('maps event lecturers to public profiles and hides unpublished Google pictures', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            person: {
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

  it('batches lecturer profile loading for multiple public events in the same request', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            person: {
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
