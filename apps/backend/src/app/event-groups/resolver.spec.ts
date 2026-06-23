import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { EventGroupsResolver } from './resolver';

describe('EventGroupsResolver authorization', () => {
  it('filters event group collections to scoped event group grants', async () => {
    const prisma = {
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', name: 'Allowed group' }]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(false),
      searchEventGroups: jest.fn(),
    };
    const authorizationPolicy = {
      accessibleEventGroupIds: jest.fn().mockResolvedValue(new Set(['group-1'])),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      authorizationPolicy as never,
    );
    const user = { sub: 'user-1' };

    await expect(resolver.eventGroups({ req: { user: user as never } }, undefined, 0, 20)).resolves.toEqual([
      { id: 'group-1', name: 'Allowed group' },
    ]);

    expect(authorizationPolicy.accessibleEventGroupIds).toHaveBeenCalledWith(user, Permission.EventGroup.Read);
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: { in: ['group-1'] },
        },
      }),
    );
  });

  it('filters Typesense event group hits to scoped grants before querying', async () => {
    const prisma = {
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-b', name: 'Grupo permitido' }]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchEventGroups: jest.fn().mockResolvedValue({
        available: true,
        ids: ['group-a', 'group-b'],
      }),
    };
    const authorizationPolicy = {
      accessibleEventGroupIds: jest.fn().mockResolvedValue(new Set(['group-b'])),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      authorizationPolicy as never,
    );

    await expect(resolver.eventGroups({ req: { user: { sub: 'user-1' } } } as never, 'grupo', 0, 10)).resolves.toEqual([
      { id: 'group-b', name: 'Grupo permitido' },
    ]);

    expect(typesenseSearch.searchEventGroups).toHaveBeenCalledWith('grupo', 10);
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ['group-b'],
          },
        },
        skip: 0,
        take: 1,
      }),
    );
  });

  it('records event group creation inside the transaction before search indexing', async () => {
    const group = {
      id: 'group-1',
      name: 'Grupo de eventos',
    };
    const tx = {
      eventGroup: {
        create: jest.fn().mockResolvedValue(group),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEventGroup: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.createEventGroup(
        {
          name: group.name,
          emoji: 'school',
          shouldIssueCertificate: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
          shouldIssueCertificateForEachEvent: true,
          shouldIssuePartialCertificate: true,
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toBe(group);

    expect(tx.eventGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: group.name,
        shouldIssueCertificate: true,
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_GROUP,
        entityId: 'group-1',
        entityLabel: group.name,
        operation: AuditLogOperation.CREATE,
        actor: { sub: 'admin-1' },
        after: group,
        scope: { permission: Permission.EventGroup.Create, eventGroupId: 'group-1' },
      }),
      tx,
    );
    expect(typesenseSearch.upsertEventGroup).toHaveBeenCalledWith({
      id: group.id,
      name: group.name,
    });
  });

  it('records event group updates and cascades disabled certificate settings inside the transaction', async () => {
    const previous = {
      id: 'group-1',
      name: 'Grupo antigo',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: true,
    };
    const updated = {
      ...previous,
      name: 'Grupo novo',
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    };
    const tx = {
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(previous),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      event: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      event: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEventGroup: jest.fn(),
    };
    const frozenResources = {
      assertEventGroupMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      frozenResources as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.updateEventGroup(
        'group-1',
        {
          name: updated.name,
          shouldIssueCertificate: false,
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toBe(updated);

    expect(frozenResources.assertEventGroupMutable).toHaveBeenCalledWith('group-1', { sub: 'admin-1' }, 'edit');
    expect(tx.eventGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: {
        name: updated.name,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      },
    });
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { eventGroupId: 'group-1', deletedAt: null },
      data: {
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_GROUP,
        entityId: 'group-1',
        entityLabel: updated.name,
        operation: AuditLogOperation.UPDATE,
        before: previous,
        after: updated,
        scope: { permission: Permission.EventGroup.Update, eventGroupId: 'group-1' },
      }),
      tx,
    );
  });

  it('records event group deletion inside the transaction before removing the search document', async () => {
    const group = {
      id: 'group-1',
      name: 'Grupo de eventos',
      deletedAt: null,
    };
    const tx = {
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(group),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      deleteEventGroup: jest.fn(),
    };
    const frozenResources = {
      assertEventGroupMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      frozenResources as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.deleteEventGroup('group-1', { req: { user: { sub: 'admin-1' } } } as never),
    ).resolves.toEqual({
      deleted: true,
      id: 'group-1',
    });

    expect(tx.eventGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_GROUP,
        entityId: 'group-1',
        entityLabel: group.name,
        operation: AuditLogOperation.DELETE,
        before: group,
        scope: { permission: Permission.EventGroup.Delete, eventGroupId: 'group-1' },
        summary: 'Grupo de eventos excluído.',
        force: true,
      }),
      tx,
    );
    expect(typesenseSearch.deleteEventGroup).toHaveBeenCalledWith('group-1');
  });
});
