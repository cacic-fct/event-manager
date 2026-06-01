import { BadRequestException } from '@nestjs/common';
import { LecturerProfilesResolver } from './lecturer-profiles.resolver';

describe('LecturerProfilesResolver', () => {
  const prisma = {
    people: {
      findFirst: jest.fn(),
    },
    lecturerProfile: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const currentUserContext = {
    getAuthenticatedUser: jest.fn(),
    requireCurrentPerson: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.people.findFirst.mockResolvedValue({ id: 'person-1' });
    prisma.lecturerProfile.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        id: 'lecturer-profile-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  it('normalizes Brazilian WhatsApp numbers to E.164 when admins save profiles', async () => {
    const resolver = new LecturerProfilesResolver(prisma as never, currentUserContext as never);

    await resolver.upsertLecturerProfile(
      'person-1',
      {
        displayName: 'Ada',
        biography: 'Bio',
        publishGoogleUserPicture: false,
        email: 'ADA@EXAMPLE.COM',
        whatsapp: '(18) 99999-9999',
      },
      { req: { user: { sub: 'admin-1' } } } as never,
    );

    expect(prisma.lecturerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: 'ada@example.com',
          whatsapp: '+5518999999999',
        }),
      }),
    );
  });

  it('rejects invalid WhatsApp numbers', async () => {
    const resolver = new LecturerProfilesResolver(prisma as never, currentUserContext as never);

    await expect(
      resolver.upsertLecturerProfile(
        'person-1',
        {
          displayName: 'Ada',
          biography: 'Bio',
          whatsapp: '123',
        },
        {} as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
