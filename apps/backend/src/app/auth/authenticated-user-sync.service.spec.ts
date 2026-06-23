import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';

describe('AuthenticatedUserSyncService', () => {
  it('updates existing user UNESP role claims from Keycloak login claims', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Student Name',
          identityDocument: null,
          academicId: null,
          unespRole: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AuthenticatedUserSyncService(prisma as never);

    await service.syncLoginClaims({
      sub: 'user-1',
      claims: {
        set_fullname: 'Updated Student Name',
        identityDocument: '123.456.789-00',
        enrollmentNumber: '20240001',
        unesp_role: ['aluno-graduacao', 'servidor'],
      },
    } as never);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        name: 'Updated Student Name',
        identityDocument: '123.456.789-00',
        academicId: '20240001',
        unespRole: ['aluno-graduacao', 'servidor'],
        lastLoginAt: expect.any(Date),
      },
    });
  });

  it('clears stale UNESP roles when Keycloak no longer sends the attribute', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Student Name',
          identityDocument: null,
          academicId: null,
          unespRole: ['aluno-graduacao'],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AuthenticatedUserSyncService(prisma as never);

    await service.syncLoginClaims({
      sub: 'user-1',
      claims: {},
    } as never);

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          unespRole: [],
          lastLoginAt: expect.any(Date),
        },
      }),
    );
  });

  it('builds user update data without replacing identity fields that are already set', () => {
    const service = new AuthenticatedUserSyncService({} as never);

    expect(
      service.buildUserUpdateData(
        {
          identityDocument: 'existing-document',
          academicId: 'existing-academic-id',
          unespRole: ['old-role'],
        },
        {
          claims: {
            set_fullname: 'Updated Student Name',
            identityDocument: 'new-document',
            enrollmentNumber: 'new-academic-id',
            unesp_role: ['new-role'],
          },
        } as never,
      ),
    ).toEqual({
      name: 'Updated Student Name',
      unespRole: ['new-role'],
    });
  });
});
