import { BadRequestException } from '@nestjs/common';
import { AuditLogOperation } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { LecturerProfilesResolver } from './lecturer-profiles.resolver';

describe('LecturerProfilesResolver current-user operations', () => {
  const context = { req: { user: { sub: 'user-1', claims: { picture: ' https://images.example/user.jpg ' } } } };
  const currentUserContext = {
    getAuthenticatedUser: jest.fn(),
    requireCurrentPerson: jest.fn(),
  };
  const lecturerProfile = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  const prisma = {
    people: { findFirst: jest.fn() },
    lecturerProfile,
    $transaction: jest.fn(async (operation: (tx: { lecturerProfile: typeof lecturerProfile }) => Promise<unknown>) =>
      operation({ lecturerProfile }),
    ),
  };
  const auditLog = { record: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserContext.getAuthenticatedUser.mockReturnValue(context.req.user);
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    auditLog.record.mockResolvedValue(undefined);
  });

  it('guards administrator reads and writes with distinct person permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, LecturerProfilesResolver.prototype.lecturerProfile),
    ).toEqual([Permission.Person.Read]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, LecturerProfilesResolver.prototype.upsertLecturerProfile),
    ).toEqual([Permission.Person.Update]);
  });

  it('loads and upserts an arbitrary person profile with normalized administrator input', async () => {
    const existing = profileFixture();
    const updated = profileFixture({ displayName: 'Ada Lovelace', email: 'ada@example.com' });
    lecturerProfile.findUnique.mockResolvedValueOnce(existing);
    prisma.people.findFirst.mockResolvedValueOnce({ id: 'person-1' });
    lecturerProfile.findUnique.mockResolvedValueOnce(existing);
    lecturerProfile.upsert.mockResolvedValueOnce(updated);
    const subject = resolver();

    await expect(subject.lecturerProfile('person-1')).resolves.toBe(existing);
    await expect(
      subject.upsertLecturerProfile(
        'person-1',
        {
          displayName: ' Ada Lovelace ',
          email: ' ADA@EXAMPLE.COM ',
          whatsapp: '+55 11 99999-9999',
          publishGoogleUserPicture: false,
        },
        { request: { user: context.req.user } } as never,
      ),
    ).resolves.toBe(updated);

    expect(prisma.people.findFirst).toHaveBeenCalledWith({
      where: { id: 'person-1', deletedAt: null },
      select: { id: true },
    });
    expect(lecturerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: 'person-1' },
        update: expect.objectContaining({
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          whatsapp: '+5511999999999',
          updatedById: 'user-1',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.UPDATE, actor: context.req.user }),
      expect.anything(),
    );
  });

  it('loads only the authenticated person lecturer profile', async () => {
    const expected = profileFixture();
    lecturerProfile.findUnique.mockResolvedValueOnce(expected);

    await expect(resolver().currentUserLecturerProfile(context as never)).resolves.toBe(expected);
    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith(context);
    expect(lecturerProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: 'person-1' } }),
    );
  });

  it('creates a normalized current-user profile, publishes an allowed Google picture, and audits the actor', async () => {
    const expected = profileFixture({
      displayName: 'Maria Silva',
      biography: 'Palestrante',
      email: 'maria@example.com',
      whatsapp: '+5511999999999',
      publishGoogleUserPicture: true,
      googleUserPicture: 'https://images.example/user.jpg',
    });
    lecturerProfile.findUnique.mockResolvedValueOnce(null);
    lecturerProfile.upsert.mockResolvedValueOnce(expected);

    await expect(
      resolver().upsertCurrentUserLecturerProfile(
        {
          displayName: ' Maria Silva ',
          biography: ' Palestrante ',
          email: ' MARIA@EXAMPLE.COM ',
          whatsapp: '(11) 99999-9999',
          publishGoogleUserPicture: true,
        },
        context as never,
      ),
    ).resolves.toBe(expected);

    expect(lecturerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: 'person-1' },
        create: expect.objectContaining({
          personId: 'person-1',
          displayName: 'Maria Silva',
          biography: 'Palestrante',
          email: 'maria@example.com',
          whatsapp: '+5511999999999',
          googleUserPicture: 'https://images.example/user.jpg',
          createdById: 'user-1',
          updatedById: 'user-1',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.CREATE,
        actor: context.req.user,
        summary: 'Perfil de palestrante criado pelo usuário.',
      }),
      expect.anything(),
    );
  });

  it('updates an existing profile, clears hidden picture and blank optional fields, and audits before/after', async () => {
    const before = profileFixture({ googleUserPicture: 'https://images.example/old.jpg' });
    const after = profileFixture({
      displayName: 'Maria',
      biography: null,
      email: null,
      whatsapp: null,
      googleUserPicture: null,
    });
    lecturerProfile.findUnique.mockResolvedValueOnce(before);
    lecturerProfile.upsert.mockResolvedValueOnce(after);

    await resolver().upsertCurrentUserLecturerProfile(
      {
        displayName: 'Maria',
        biography: ' ',
        email: ' ',
        whatsapp: ' ',
        publishGoogleUserPicture: false,
      },
      context as never,
    );

    expect(lecturerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          biography: null,
          email: null,
          whatsapp: null,
          googleUserPicture: null,
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        before: expect.objectContaining({ id: 'profile-1' }),
        after: expect.objectContaining({ displayName: 'Maria' }),
      }),
      expect.anything(),
    );
  });

  it('rejects blank names and invalid phone numbers before writing', async () => {
    await expect(
      resolver().upsertCurrentUserLecturerProfile(
        { displayName: ' ', publishGoogleUserPicture: false },
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolver().upsertCurrentUserLecturerProfile(
        { displayName: 'Maria', whatsapp: '123', publishGoogleUserPicture: false },
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lecturerProfile.upsert).not.toHaveBeenCalled();
  });

  function resolver(): LecturerProfilesResolver {
    return new LecturerProfilesResolver(prisma as never, currentUserContext as never, auditLog as never);
  }
});

function profileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    personId: 'person-1',
    person: { id: 'person-1', user: { id: 'user-1' } },
    displayName: 'Maria',
    biography: null,
    publishGoogleUserPicture: false,
    googleUserPicture: null,
    email: null,
    whatsapp: null,
    createdAt: new Date(publicFixtureDateFromNow(-1)),
    createdById: 'user-1',
    updatedAt: new Date(publicFixtureDateFromNow()),
    updatedById: 'user-1',
    ...overrides,
  };
}
