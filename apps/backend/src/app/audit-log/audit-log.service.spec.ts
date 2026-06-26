import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, AuditLogRevertMode, Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let authorizationPolicy: { assertPermissions: jest.Mock; isSuperAdmin: jest.Mock };
  let typesenseSearch: ReturnType<typeof createTypesenseSearch>;
  let attendanceRealtime: { notifyAllConnectedPeople: jest.Mock };
  let frozenResources: ReturnType<typeof createFrozenResources>;
  let service: AuditLogService;

  beforeEach(() => {
    prisma = createPrisma();
    authorizationPolicy = { assertPermissions: jest.fn(), isSuperAdmin: jest.fn().mockReturnValue(true) };
    typesenseSearch = createTypesenseSearch();
    attendanceRealtime = { notifyAllConnectedPeople: jest.fn() };
    frozenResources = createFrozenResources();
    service = new AuditLogService(
      prisma as never,
      authorizationPolicy as never,
      typesenseSearch as never,
      attendanceRealtime as never,
      frozenResources as never,
    );
  });

  it('records field-level changes while ignoring bookkeeping fields', async () => {
    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        email: 'renan@example.com',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Silva',
        email: null,
        updatedAt: '2026-06-21T17:00:00.000Z',
        updatedById: 'admin-0',
        paymentInfo: {
          bankName: 'Banco A',
        },
      },
      after: {
        name: 'Ana Clara Silva',
        email: 'ana@unesp.br',
        updatedAt: '2026-06-21T17:10:00.000Z',
        updatedById: 'admin-1',
        paymentInfo: {
          bankName: 'Banco B',
        },
      },
      scope: {
        permission: Permission.Person.Update,
      },
      summary: 'Pessoa atualizada pelo painel administrativo.',
      squashWindowMs: 0,
    });

    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: AuditLogEntityType.PERSON,
        entityId: 'person-1',
        actorId: 'admin-1',
        actorName: 'Renan Yudi',
        permission: Permission.Person.Update,
        changedFields: ['email', 'name', 'paymentInfo.bankName'],
      }),
    });
    expect(createdChanges(prisma)).toEqual([
      expect.objectContaining({ field: 'email', before: null, after: 'ana@unesp.br' }),
      expect.objectContaining({ field: 'name', before: 'Ana Silva', after: 'Ana Clara Silva' }),
      expect.objectContaining({ field: 'paymentInfo.bankName', before: 'Banco A', after: 'Banco B' }),
    ]);
    expect(createdChanges(prisma).some((change) => change.field === 'updatedAt')).toBe(false);
    expect(createdChanges(prisma).some((change) => change.field === 'updatedById')).toBe(false);
  });

  it('skips no-op audit records unless they are forced', async () => {
    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      actor: null,
      before: {
        name: 'Ana Silva',
      },
      after: {
        name: 'Ana Silva',
      },
    });

    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();

    await service.record({
      entityType: AuditLogEntityType.SYSTEM,
      entityId: 'import-1',
      operation: AuditLogOperation.IMPORT,
      actor: null,
      force: true,
      metadata: {
        importedRows: 2,
      },
      squashWindowMs: 0,
    });

    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        actorName: 'Sistema',
        actorEmail: null,
        actorType: AuditLogActorType.SYSTEM,
        before: Prisma.JsonNull,
        after: Prisma.JsonNull,
        changes: [],
        changedFields: [],
        metadata: {
          importedRows: 2,
        },
      }),
    });
  });

  it('resolves authenticated actors from persisted user data before falling back to claims', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      name: 'Persisted User',
      email: 'persisted@example.com',
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      actor: createAuthenticatedUser({
        sub: 'user-1',
        email: 'claim@example.com',
        preferredUsername: 'claim-user',
        claims: {
          name: 'Claim User',
        },
      }),
      before: {
        name: 'Old',
      },
      after: {
        name: 'New',
      },
      squashWindowMs: 0,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      select: {
        name: true,
        email: true,
      },
    });
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-1',
        actorName: 'Persisted User',
        actorEmail: 'persisted@example.com',
        actorType: AuditLogActorType.USER,
      }),
    });
  });

  it('squashes consecutive updates for the same entity and actor inside the squash window', async () => {
    prisma.auditLogEntry.findFirst.mockResolvedValue({
      id: 'audit-1',
      entityLabel: 'Ana Silva',
      summary: 'Pessoa atualizada.',
      operation: AuditLogOperation.UPDATE,
      actorId: 'admin-1',
      actorName: 'Renan Yudi',
      permission: Permission.Person.Update,
      lastRecordedAt: new Date(),
      before: {
        name: 'Ana Silva',
        email: 'ana@example.com',
      },
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Clara Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Maria Silva',
        email: 'ana@example.com',
      },
      after: {
        name: 'Ana Clara Silva',
        email: 'ana@unesp.br',
      },
      scope: {
        permission: Permission.Person.Update,
      },
    });

    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.update).toHaveBeenCalledWith({
      where: {
        id: 'audit-1',
      },
      data: expect.objectContaining({
        entityLabel: 'Ana Clara Silva',
        changedFields: ['email', 'name'],
        groupedCount: {
          increment: 1,
        },
      }),
    });
    expect(updatedChanges(prisma)).toEqual([
      expect.objectContaining({ field: 'email', before: 'ana@example.com', after: 'ana@unesp.br' }),
      expect.objectContaining({ field: 'name', before: 'Ana Silva', after: 'Ana Clara Silva' }),
    ]);
  });

  it('does not squash updates recorded under a different scope id', async () => {
    prisma.auditLogEntry.findFirst.mockResolvedValue({
      id: 'audit-1',
      entityLabel: 'Ana Silva',
      summary: 'Pessoa atualizada.',
      operation: AuditLogOperation.UPDATE,
      actorId: 'admin-1',
      actorName: 'Renan Yudi',
      permission: Permission.Person.Update,
      eventId: 'event-1',
      majorEventId: null,
      eventGroupId: null,
      lastRecordedAt: new Date(),
      before: {
        name: 'Ana Silva',
      },
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Clara Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Maria Silva',
      },
      after: {
        name: 'Ana Clara Silva',
      },
      scope: {
        permission: Permission.Person.Update,
        eventId: 'event-2',
      },
    });

    expect(prisma.auditLogEntry.update).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'person-1',
        eventId: 'event-2',
        changedFields: ['name'],
      }),
    });
  });

  it('does not squash when another audit entry is the latest entity change', async () => {
    prisma.auditLogEntry.findFirst.mockResolvedValue({
      id: 'audit-2',
      entityLabel: 'Ana Silva',
      summary: 'Pessoa atualizada por outra pessoa.',
      operation: AuditLogOperation.UPDATE,
      actorId: 'admin-2',
      actorName: 'Outro Admin',
      permission: Permission.Person.Update,
      lastRecordedAt: new Date(),
      before: {
        name: 'Ana Maria Silva',
      },
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Clara Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Silva',
      },
      after: {
        name: 'Ana Clara Silva',
      },
      scope: {
        permission: Permission.Person.Update,
      },
    });

    expect(prisma.auditLogEntry.update).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'person-1',
        changedFields: ['name'],
      }),
    });
  });

  it('creates a new entry when a squash candidate does not change the original snapshot', async () => {
    prisma.auditLogEntry.findFirst.mockResolvedValue({
      id: 'audit-1',
      entityLabel: 'Ana Silva',
      summary: 'Pessoa atualizada.',
      operation: AuditLogOperation.UPDATE,
      actorId: 'admin-1',
      actorName: 'Renan Yudi',
      permission: null,
      lastRecordedAt: new Date(),
      before: {
        name: 'Ana Clara Silva',
      },
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Silva',
      },
      after: {
        name: 'Ana Clara Silva',
      },
    });

    expect(prisma.auditLogEntry.update).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'person-1',
        changedFields: ['name'],
      }),
    });
  });

  it('normalizes dates, bigint values, arrays, and missing nested values before diffing', async () => {
    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        externalRef: BigInt(1),
        validFrom: new Date('2026-06-22T12:00:00.000Z'),
        selectedEventIds: ['event-1', undefined],
        metadata: {
          oldValue: undefined,
        },
      },
      after: {
        externalRef: BigInt(2),
        validFrom: new Date('2026-06-22T13:00:00.000Z'),
        selectedEventIds: ['event-1', 'event-2'],
        metadata: {
          newValue: 'visible',
        },
      },
      squashWindowMs: 0,
    });

    expect(createdChanges(prisma)).toEqual([
      expect.objectContaining({ field: 'externalRef', before: '1', after: '2' }),
      expect.objectContaining({ field: 'metadata.newValue', before: null, after: 'visible' }),
      expect.objectContaining({ field: 'selectedEventIds', before: ['event-1', null], after: ['event-1', 'event-2'] }),
      expect.objectContaining({
        field: 'validFrom',
        before: '2026-06-22T12:00:00.000Z',
        after: '2026-06-22T13:00:00.000Z',
      }),
    ]);
  });

  it('builds the same encoded composite ids used by attendance audit entries', () => {
    expect(service.buildCompositeEntityId(['person:1', 'event/2'])).toBe('person%3A1:event%2F2');
  });

  it('lists history with authorization context and formatted changes', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    prisma.auditLogEntry.findMany.mockResolvedValue([
      createAuditEntry({
        id: 'audit-1',
        entityType: AuditLogEntityType.EVENT,
        entityId: 'event-1',
        operation: AuditLogOperation.UPDATE,
        changes: [
          { field: 'allowSubscription', before: false, after: true },
          { field: 'selectedEventIds', before: ['event-1', 'event-2'], after: [] },
          { field: 'metadata', before: { source: 'old' }, after: { source: 'new' } },
        ],
        changedFields: ['allowSubscription', 'selectedEventIds', 'metadata'],
        groupedCount: 2,
        firstRecordedAt: createdAt,
        lastRecordedAt: createdAt,
        createdAt,
      }),
    ]);

    await expect(
      service.listEntityHistory(
        AuditLogEntityType.EVENT,
        'event-1',
        createAuthenticatedUser({
          sub: 'user-1',
          email: 'user@example.com',
          claims: {},
        }),
        500,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'audit-1',
        entityType: AuditLogEntityType.EVENT,
        entityId: 'event-1',
        groupedCount: 2,
        canRevert: false,
        changes: [
          expect.objectContaining({ field: 'allowSubscription', beforeValue: 'Não', afterValue: 'Sim' }),
          expect.objectContaining({ field: 'selectedEventIds', beforeValue: 'event-1, event-2', afterValue: '[]' }),
          expect.objectContaining({
            field: 'metadata',
            beforeValue: '{"source":"old"}',
            afterValue: '{"source":"new"}',
          }),
        ],
      }),
    ]);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1' }),
      [Permission.Event.Read],
      {
        genericId: 'event-1',
        primaryResource: 'event',
        eventId: 'event-1',
      },
    );
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith({
      where: {
        entityType: AuditLogEntityType.EVENT,
        entityId: 'event-1',
      },
      orderBy: [{ lastRecordedAt: 'desc' }, { createdAt: 'desc' }],
      take: 150,
    });
  });

  it('rejects audit history reads for non-super-admin event managers', async () => {
    authorizationPolicy.isSuperAdmin.mockReturnValue(false);

    await expect(
      service.listEntityHistory(
        AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION,
        'subscription-1',
        createAuthenticatedUser({
          sub: 'user-1',
          roleSet: new Set([EventManagerKeycloakRole.Access]),
          permissionSet: new Set([Permission.Subscription.Read]),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authorizationPolicy.assertPermissions).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.findMany).not.toHaveBeenCalled();
  });

  it('authorizes subscription and contextual histories with their resource scopes', async () => {
    prisma.auditLogEntry.findMany.mockResolvedValue([
      createAuditEntry({
        id: 'audit-subscription',
        entityType: AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION,
        entityId: 'subscription-1',
        operation: AuditLogOperation.USER_CREATE,
        changes: Prisma.JsonNull,
      }),
    ]);

    await expect(
      service.listEntityHistory(AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION, 'subscription-1', undefined, 0),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'audit-subscription',
        canRevert: false,
        changes: [],
      }),
    ]);

    expect(authorizationPolicy.assertPermissions).toHaveBeenLastCalledWith(undefined, [Permission.Subscription.Read], {
      genericId: 'subscription-1',
      primaryResource: 'subscription',
      subscriptionId: 'subscription-1',
    });

    prisma.auditLogEntry.findMany.mockResolvedValue([
      createAuditEntry({
        id: 'audit-attendance',
        entityType: AuditLogEntityType.EVENT_ATTENDANCE,
        entityId: 'person-1:event-1',
        operation: AuditLogOperation.UPDATE,
        eventId: 'event-1',
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
        changes: [{ label: 'invalid change without field' }],
      }),
    ]);

    prisma.auditLogEntry.findMany.mockClear();
    await service.listEntityHistory(AuditLogEntityType.EVENT_ATTENDANCE, 'person-1:event-1', undefined, 1);

    expect(authorizationPolicy.assertPermissions).toHaveBeenLastCalledWith(undefined, [Permission.EventAttendance.Read], {
      eventId: 'event-1',
      majorEventId: undefined,
      eventGroupId: undefined,
    });
  });

  it('does not offer automatic reversal for multi-entity merge operations', async () => {
    prisma.auditLogEntry.findUnique.mockResolvedValue({
      id: 'audit-merge',
      operation: AuditLogOperation.MERGE,
      revertedAt: null,
    });

    await expect(
      service.revertEntry({ entryId: 'audit-merge', mode: AuditLogRevertMode.ENTRY_ONLY }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing, already reverted, and unsupported audit log reverts', async () => {
    prisma.auditLogEntry.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.revertEntry({ entryId: 'missing-entry', mode: AuditLogRevertMode.ENTRY_ONLY }, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.auditLogEntry.findUnique.mockResolvedValueOnce(
      createAuditEntry({
        id: 'audit-reverted',
        revertedAt: new Date('2026-06-22T12:00:00.000Z'),
      }),
    );

    await expect(
      service.revertEntry({ entryId: 'audit-reverted', mode: AuditLogRevertMode.ENTRY_ONLY }, undefined),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.auditLogEntry.findUnique.mockResolvedValueOnce(
      createAuditEntry({
        id: 'audit-subscription',
        entityType: AuditLogEntityType.EVENT_SUBSCRIPTION,
        operation: AuditLogOperation.UPDATE,
      }),
    );

    await expect(
      service.revertEntry({ entryId: 'audit-subscription', mode: AuditLogRevertMode.ENTRY_ONLY }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks entry-only reverts when a later audit entry changed the same field', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-1',
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      changedFields: ['name'],
      before: {
        name: 'Ana',
      },
      after: {
        name: 'Ana Clara',
      },
      lastRecordedAt: new Date('2026-06-22T12:00:00.000Z'),
    });
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.auditLogEntry.findMany.mockResolvedValue([
      {
        changedFields: ['name'],
      },
    ]);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-1',
          mode: AuditLogRevertMode.ENTRY_ONLY,
        },
        createAuthenticatedUser({
          sub: 'admin-1',
          email: 'admin@example.com',
          claims: {},
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'admin-1' }),
      [Permission.Person.Update],
      {},
    );
  });

  it('rejects cascade reverts when a later entry is non-reversible', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-update',
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.UPDATE,
      changedFields: ['name'],
      before: {
        name: 'Ana',
      },
      after: {
        name: 'Ana Clara',
      },
      lastRecordedAt: new Date('2026-06-22T12:00:00.000Z'),
    });
    const mergeEntry = createAuditEntry({
      id: 'audit-merge',
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      operation: AuditLogOperation.MERGE,
      changedFields: ['mergedIntoId'],
      before: {
        mergedIntoId: null,
      },
      after: {
        mergedIntoId: 'person-2',
      },
      lastRecordedAt: new Date('2026-06-22T12:01:00.000Z'),
    });
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.auditLogEntry.findMany.mockResolvedValue([mergeEntry, targetEntry]);
    prisma.people.findUnique.mockResolvedValue({
      id: 'person-1',
      name: 'Ana Clara',
      mergedIntoId: 'person-2',
    });

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-update',
          mode: AuditLogRevertMode.ENTRY_AND_AFTER,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reverts when the current record no longer exists', async () => {
    prisma.auditLogEntry.findUnique.mockResolvedValue(
      createAuditEntry({
        id: 'audit-person',
        entityType: AuditLogEntityType.PERSON,
        entityId: 'person-1',
        operation: AuditLogOperation.UPDATE,
        changedFields: ['name'],
        before: {
          name: 'Ana',
        },
        after: {
          name: 'Ana Clara',
        },
      }),
    );
    prisma.people.findUnique.mockResolvedValue(null);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-person',
          mode: AuditLogRevertMode.ENTRY_ONLY,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces frozen event checks before applying a revert update', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-event',
      entityType: AuditLogEntityType.EVENT,
      entityId: 'event-1',
      operation: AuditLogOperation.UPDATE,
      eventId: 'event-1',
      before: {
        id: 'event-1',
        name: 'Evento antigo',
        eventGroupId: 'group-old',
        majorEventId: null,
      },
      after: {
        id: 'event-1',
        name: 'Evento novo',
        eventGroupId: 'group-new',
        majorEventId: null,
      },
      changedFields: ['name', 'eventGroupId'],
    });
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      name: 'Evento novo',
      eventGroupId: 'group-new',
      majorEventId: null,
      deletedAt: null,
    });
    frozenResources.assertEventUpdateMutable.mockRejectedValue(new ForbiddenException('Dados congelados.'));

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-event',
          mode: AuditLogRevertMode.ENTRY_ONLY,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(frozenResources.assertEventUpdateMutable).toHaveBeenCalledWith(
      'event-1',
      {
        eventGroupId: 'group-old',
        majorEventId: undefined,
      },
      undefined,
      true,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reverts an event group entry and applies certificate invariants in the same transaction', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-group',
      entityType: AuditLogEntityType.EVENT_GROUP,
      entityId: 'group-1',
      entityLabel: 'Grupo',
      operation: AuditLogOperation.UPDATE,
      permission: Permission.EventGroup.Update,
      eventGroupId: 'group-1',
      before: {
        id: 'group-1',
        name: 'Grupo antigo',
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: true,
      },
      after: {
        id: 'group-1',
        name: 'Grupo novo',
        shouldIssueCertificate: true,
        shouldIssueCertificateForNonPayingAttendees: true,
        shouldIssueCertificateForNonSubscribedAttendees: true,
      },
      changedFields: [
        'name',
        'shouldIssueCertificate',
        'shouldIssueCertificateForNonPayingAttendees',
      ],
      lastRecordedAt: new Date('2026-06-22T12:00:00.000Z'),
    });
    const currentGroup = {
      id: 'group-1',
      name: 'Grupo novo',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: true,
      emoji: 'school',
      deletedAt: null,
    };
    const revertedGroup = {
      ...currentGroup,
      name: 'Grupo antigo',
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
    };
    const revertLog = createAuditEntry({
      id: 'audit-revert',
      entityType: AuditLogEntityType.EVENT_GROUP,
      entityId: 'group-1',
      operation: AuditLogOperation.REVERT,
      revertTargetId: 'audit-group',
    });
    const tx = createTransaction(revertedGroup, revertLog);
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.auditLogEntry.findMany.mockResolvedValue([targetEntry]);
    prisma.eventGroup.findUnique.mockResolvedValue(currentGroup);
    prisma.$transaction.mockImplementation(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    prisma.auditLogEntry.findUniqueOrThrow.mockResolvedValue(revertLog);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-group',
          mode: AuditLogRevertMode.ENTRY_AND_AFTER,
        },
        createAuthenticatedUser({
          sub: 'admin-1',
          email: 'admin@example.com',
          claims: {
            preferred_username: 'admin',
          },
        }),
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'audit-revert', revertTargetId: 'audit-group' }));

    expect(tx.eventGroup.update).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
      },
      data: {
        name: 'Grupo antigo',
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
      },
      select: expect.objectContaining({
        name: true,
        shouldIssueCertificate: true,
      }),
    });
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: {
        eventGroupId: 'group-1',
        deletedAt: null,
      },
      data: {
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: AuditLogOperation.REVERT,
        summary: 'Alteração e entradas posteriores desfeitas.',
        actorId: 'admin-1',
        actorName: 'admin',
        revertTargetId: 'audit-group',
        revertMode: AuditLogRevertMode.ENTRY_AND_AFTER,
        metadata: {
          revertedEntryIds: ['audit-group'],
        },
      }),
    });
    expect(tx.auditLogEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['audit-group'],
        },
        revertedAt: null,
      },
      data: expect.objectContaining({
        revertedById: 'admin-1',
        revertedByName: 'admin',
        revertedByEntryId: 'audit-revert',
      }),
    });
    expect(typesenseSearch.upsertEventGroup).toHaveBeenCalledWith(revertedGroup);
  });

  it('reindexes reverted place presets with their id', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-place',
      entityType: AuditLogEntityType.PLACE_PRESET,
      entityId: 'place-1',
      entityLabel: 'Sala nova',
      operation: AuditLogOperation.UPDATE,
      permission: Permission.PlacePreset.Update,
      before: {
        id: 'place-1',
        name: 'Sala antiga',
        locationDescription: 'Bloco A',
      },
      after: {
        id: 'place-1',
        name: 'Sala nova',
        locationDescription: 'Bloco B',
      },
      changedFields: ['name', 'locationDescription'],
      lastRecordedAt: new Date('2026-06-22T12:00:00.000Z'),
    });
    const currentPlace = {
      id: 'place-1',
      name: 'Sala nova',
      latitude: null,
      longitude: null,
      locationDescription: 'Bloco B',
      deletedAt: null,
    };
    const revertedPlace = {
      ...currentPlace,
      name: 'Sala antiga',
      locationDescription: 'Bloco A',
    };
    const revertLog = createAuditEntry({
      id: 'audit-place-revert',
      entityType: AuditLogEntityType.PLACE_PRESET,
      entityId: 'place-1',
      operation: AuditLogOperation.REVERT,
      revertTargetId: 'audit-place',
    });
    const tx = createTransaction(revertedPlace, revertLog);
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.auditLogEntry.findMany.mockResolvedValue([targetEntry]);
    prisma.placePreset.findUnique.mockResolvedValue(currentPlace);
    prisma.$transaction.mockImplementation(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    prisma.auditLogEntry.findUniqueOrThrow.mockResolvedValue(revertLog);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-place',
          mode: AuditLogRevertMode.ENTRY_AND_AFTER,
        },
        undefined,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'audit-place-revert', revertTargetId: 'audit-place' }));

    expect(tx.placePreset.update).toHaveBeenCalledWith({
      where: {
        id: 'place-1',
      },
      data: {
        name: 'Sala antiga',
        locationDescription: 'Bloco A',
      },
      select: expect.objectContaining({
        id: true,
        name: true,
        locationDescription: true,
      }),
    });
    expect(typesenseSearch.upsertPlacePreset).toHaveBeenCalledWith(revertedPlace);
  });

  it('removes reverted major events from search when the revert soft-deletes the record', async () => {
    const deletedAt = new Date('2026-06-22T12:00:00.000Z');
    const targetEntry = createAuditEntry({
      id: 'audit-major',
      entityType: AuditLogEntityType.MAJOR_EVENT,
      entityId: 'major-1',
      entityLabel: 'Grande evento',
      operation: AuditLogOperation.UPDATE,
      permission: Permission.MajorEvent.Update,
      majorEventId: 'major-1',
      before: {
        id: 'major-1',
        name: 'Grande evento',
        deletedAt,
      },
      after: {
        id: 'major-1',
        name: 'Grande evento',
        deletedAt: null,
      },
      changedFields: ['deletedAt'],
      lastRecordedAt: new Date('2026-06-22T12:01:00.000Z'),
    });
    const currentMajorEvent = {
      id: 'major-1',
      name: 'Grande evento',
      deletedAt: null,
    };
    const revertedMajorEvent = {
      ...currentMajorEvent,
      deletedAt,
    };
    const revertLog = createAuditEntry({
      id: 'audit-major-revert',
      entityType: AuditLogEntityType.MAJOR_EVENT,
      entityId: 'major-1',
      operation: AuditLogOperation.REVERT,
      revertTargetId: 'audit-major',
    });
    const tx = createTransaction(revertedMajorEvent, revertLog);
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.majorEvent.findUnique.mockResolvedValue(currentMajorEvent);
    prisma.$transaction.mockImplementation(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    prisma.auditLogEntry.findUniqueOrThrow.mockResolvedValue(revertLog);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-major',
          mode: AuditLogRevertMode.ENTRY_ONLY,
        },
        undefined,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'audit-major-revert' }));

    expect(tx.majorEvent.update).toHaveBeenCalledWith({
      where: {
        id: 'major-1',
      },
      data: {
        deletedAt,
      },
      select: expect.objectContaining({
        id: true,
        deletedAt: true,
      }),
    });
    expect(typesenseSearch.deleteMajorEvent).toHaveBeenCalledWith('major-1');
  });

  it('reverts event updates, restores event-group invariants, and reindexes live events', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-event',
      entityType: AuditLogEntityType.EVENT,
      entityId: 'event-1',
      operation: AuditLogOperation.UPDATE,
      eventId: 'event-1',
      before: {
        id: 'event-1',
        name: 'Evento antigo',
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
      },
      after: {
        id: 'event-1',
        name: 'Evento novo',
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
      },
      changedFields: ['name'],
    });
    const currentEvent = {
      id: 'event-1',
      name: 'Evento novo',
      eventGroupId: 'group-1',
      majorEventId: 'major-1',
      deletedAt: null,
    };
    const revertedEvent = {
      ...currentEvent,
      name: 'Evento antigo',
    };
    const revertLog = createAuditEntry({
      id: 'audit-event-revert',
      entityType: AuditLogEntityType.EVENT,
      entityId: 'event-1',
      operation: AuditLogOperation.REVERT,
      revertTargetId: 'audit-event',
    });
    const tx = createTransaction(revertedEvent, revertLog);
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.event.findUnique.mockResolvedValue(currentEvent);
    prisma.$transaction.mockImplementation(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    prisma.auditLogEntry.findUniqueOrThrow.mockResolvedValue(revertLog);

    await service.revertEntry(
      {
        entryId: 'audit-event',
        mode: AuditLogRevertMode.ENTRY_ONLY,
      },
      undefined,
    );

    expect(tx.event.update).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
      },
      data: {
        name: 'Evento antigo',
      },
      select: expect.objectContaining({
        id: true,
        name: true,
      }),
    });
    expect(frozenResources.assertEventUpdateMutable).toHaveBeenCalledWith(
      'event-1',
      {
        eventGroupId: undefined,
        majorEventId: undefined,
      },
      undefined,
      true,
    );
    expect(tx.eventGroup.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
        deletedAt: null,
        shouldIssueCertificateForEachEvent: true,
      },
      data: {
        shouldIssueCertificateForEachEvent: false,
      },
    });
    expect(typesenseSearch.upsertEvent).toHaveBeenCalledWith(revertedEvent);
    expect(attendanceRealtime.notifyAllConnectedPeople).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes created events when reverting their creation', async () => {
    const targetEntry = createAuditEntry({
      id: 'audit-event-create',
      entityType: AuditLogEntityType.EVENT,
      entityId: 'event-1',
      operation: AuditLogOperation.CREATE,
      eventId: 'event-1',
      before: Prisma.JsonNull,
      after: {
        name: 'Evento',
      },
      changedFields: ['name'],
    });
    const currentEvent = {
      id: 'event-1',
      name: 'Evento',
      deletedAt: null,
    };
    const deletedEvent = {
      ...currentEvent,
      deletedAt: new Date('2026-06-22T12:00:00.000Z'),
    };
    const revertLog = createAuditEntry({
      id: 'audit-event-revert',
      entityType: AuditLogEntityType.EVENT,
      entityId: 'event-1',
      operation: AuditLogOperation.REVERT,
      revertTargetId: 'audit-event-create',
    });
    const tx = createTransaction(deletedEvent, revertLog);
    prisma.auditLogEntry.findUnique.mockResolvedValue(targetEntry);
    prisma.event.findUnique.mockResolvedValue(currentEvent);
    prisma.$transaction.mockImplementation(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    prisma.auditLogEntry.findUniqueOrThrow.mockResolvedValue(revertLog);

    await expect(
      service.revertEntry(
        {
          entryId: 'audit-event-create',
          mode: AuditLogRevertMode.ENTRY_ONLY,
        },
        undefined,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'audit-event-revert' }));

    expect(tx.event.update).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
      },
      data: {
        deletedAt: expect.any(Date),
      },
      select: expect.objectContaining({
        id: true,
        deletedAt: true,
      }),
    });
    expect(typesenseSearch.deleteEvent).toHaveBeenCalledWith('event-1');
    expect(attendanceRealtime.notifyAllConnectedPeople).toHaveBeenCalledTimes(1);
  });
});

function createPrisma() {
  return {
    auditLogEntry: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    people: {
      findUnique: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    majorEvent: {
      findUnique: jest.fn(),
    },
    eventGroup: {
      findUnique: jest.fn(),
    },
    placePreset: {
      findUnique: jest.fn(),
    },
    eventManagerPermissionGrant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createdChanges(prisma: ReturnType<typeof createPrisma>): AuditChange[] {
  return prisma.auditLogEntry.create.mock.calls[0][0].data.changes;
}

function updatedChanges(prisma: ReturnType<typeof createPrisma>): AuditChange[] {
  return prisma.auditLogEntry.update.mock.calls[0][0].data.changes;
}

type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

function createAuditEntry(overrides: Record<string, unknown> = {}) {
  const recordedAt = new Date('2026-06-22T12:00:00.000Z');

  return {
    id: 'audit-1',
    entityType: AuditLogEntityType.PERSON,
    entityId: 'person-1',
    entityLabel: 'Pessoa',
    operation: AuditLogOperation.UPDATE,
    summary: null,
    actorId: 'admin-1',
    actorName: 'Admin',
    actorEmail: 'admin@example.com',
    actorType: AuditLogActorType.USER,
    permission: null,
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    before: {},
    after: {},
    changes: [],
    changedFields: [],
    groupedCount: 1,
    firstRecordedAt: recordedAt,
    lastRecordedAt: recordedAt,
    createdAt: recordedAt,
    revertedAt: null,
    revertedById: null,
    revertedByName: null,
    revertedByEntryId: null,
    revertTargetId: null,
    revertMode: null,
    metadata: null,
    ...overrides,
  };
}

function createTransaction(updated: Record<string, unknown>, revertLog: ReturnType<typeof createAuditEntry>) {
  return {
    people: {
      update: jest.fn().mockResolvedValue(updated),
    },
    event: {
      update: jest.fn().mockResolvedValue(updated),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    majorEvent: {
      update: jest.fn().mockResolvedValue(updated),
    },
    eventGroup: {
      update: jest.fn().mockResolvedValue(updated),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    placePreset: {
      update: jest.fn().mockResolvedValue(updated),
    },
    eventManagerPermissionGrant: {
      update: jest.fn().mockResolvedValue(updated),
    },
    auditLogEntry: {
      create: jest.fn().mockResolvedValue(revertLog),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function createFrozenResources() {
  return {
    assertEventMutable: jest.fn(),
    assertEventUpdateMutable: jest.fn(),
    assertEventGroupMutable: jest.fn(),
    assertMajorEventMutable: jest.fn(),
  };
}

function createTypesenseSearch() {
  return {
    upsertEvent: jest.fn(),
    deleteEvent: jest.fn(),
    upsertMajorEvent: jest.fn(),
    deleteMajorEvent: jest.fn(),
    upsertEventGroup: jest.fn(),
    deleteEventGroup: jest.fn(),
    upsertPerson: jest.fn(),
    deletePerson: jest.fn(),
    upsertPlacePreset: jest.fn(),
    deletePlacePreset: jest.fn(),
  };
}

function createAuthenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    realm_access: {
      roles: [],
    },
    sub: undefined,
    preferredUsername: undefined,
    email: undefined,
    token: 'token',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
    ...overrides,
  };
}
