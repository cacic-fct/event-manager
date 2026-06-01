import { PublicEventsResolver } from './events.resolver';

describe('PublicEventsResolver lecturer profiles', () => {
  it('maps event lecturers to public profiles and hides unpublished Google pictures', async () => {
    const prisma = {
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([
          {
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
          eventId: 'event-1',
        }),
      }),
    );
  });
});
