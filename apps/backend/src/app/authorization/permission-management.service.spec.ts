import {
  PermissionManagementService,
  toPermissionGroupAuditSnapshot,
  toPermissionRoleAuditSnapshot,
} from './permission-management.service';

describe('PermissionManagementService transaction safety', () => {
  it('serializes graph writes behind one transaction advisory lock', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new PermissionManagementService(prisma as never, {} as never, {} as never);

    await (
      service as unknown as {
        runPermissionGraphTransaction: <T>(operation: (client: typeof tx) => Promise<T>) => Promise<T>;
      }
    ).runPermissionGraphTransaction(async (client) => {
      await client.$executeRaw();
      return 'committed';
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe('permission audit snapshots', () => {
  it('keeps active role grants and scope IDs without related display records or archived history', () => {
    const snapshot = toPermissionRoleAuditSnapshot({
      id: 'role-1',
      name: 'Coordenação',
      permissions: [{ permission: 'event:read' }],
      parentLinks: [{ parentRoleId: 'parent-role-1' }],
      assignments: [
        {
          id: 'assignment-1',
          personId: 'person-1',
          groupId: null,
          validFrom: null,
          validUntil: null,
          unlimited: true,
          archivedAt: null,
          person: { name: 'Ana', userId: 'user-1' },
          scopes: [
            {
              id: 'scope-1',
              scope: 'EVENT',
              eventId: 'event-1',
              majorEventId: null,
              eventGroupId: null,
              validFrom: null,
              validUntil: null,
              unlimited: true,
              archivedAt: null,
              event: { name: 'Evento privado' },
            },
          ],
        },
        {
          id: 'assignment-old',
          personId: 'person-old',
          groupId: null,
          validFrom: null,
          validUntil: null,
          unlimited: true,
          archivedAt: new Date(),
          scopes: [],
        },
      ],
    } as never);

    expect(snapshot).toMatchObject({
      id: 'role-1',
      permissions: ['event:read'],
      parentRoleIds: ['parent-role-1'],
      assignments: [
        {
          id: 'assignment-1',
          personId: 'person-1',
          scopes: [{ id: 'scope-1', eventId: 'event-1' }],
        },
      ],
    });
    expect(snapshot).not.toHaveProperty('assignments.0.person');
    expect(snapshot).not.toHaveProperty('assignments.0.scopes.0.event');
  });

  it('keeps permission group member IDs without copying person profiles', () => {
    const snapshot = toPermissionGroupAuditSnapshot({
      id: 'group-1',
      name: 'Equipe',
      members: [
        {
          id: 'membership-1',
          validFrom: null,
          validUntil: null,
          unlimited: true,
          archivedAt: null,
          person: { id: 'person-1', name: 'Ana', email: 'ana@example.com', userId: 'user-1' },
        },
      ],
      assignments: [{ roleId: 'role-1' }],
    } as never);

    expect(snapshot).toMatchObject({
      id: 'group-1',
      members: [{ id: 'membership-1', personId: 'person-1' }],
      assignedRoleIds: ['role-1'],
    });
    expect(snapshot).not.toHaveProperty('members.0.person');
  });
});
