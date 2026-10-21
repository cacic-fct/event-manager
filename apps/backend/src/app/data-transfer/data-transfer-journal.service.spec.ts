import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import type { ResolvedTransferDocument, TransferItem } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DataTransferJournalService,
  readTransferJournal,
  type TransferJournalMetadata,
} from './data-transfer-journal.service';
import { journalSchemaFingerprint, type JournalMutation } from './transfer-journal-recorder';
const { jest } = import.meta;

const actor = {
  sub: 'organizer-1',
  preferredUsername: 'Organizador',
  email: 'organizer@example.test',
} as AuthenticatedUser;

function mutation(overrides: Partial<JournalMutation> = {}): JournalMutation {
  return {
    model: 'eventGroup',
    key: { id: 'group-1' },
    before: { id: 'group-1', name: 'Nome anterior' },
    after: { id: 'group-1', name: 'Nome importado' },
    source: { kind: 'group', id: 'group-1', action: 'update', scope: { eventGroupId: 'group-1' } },
    ...overrides,
  };
}

function metadata(overrides: Partial<TransferJournalMetadata> = {}): TransferJournalMetadata {
  return {
    type: 'data-transfer-batch',
    version: 1,
    schemaFingerprint: journalSchemaFingerprint(),
    summary: { create: 0, update: 1, unchanged: 0, skip: 0 },
    mutations: [mutation()],
    creationReferences: [],
    document: { format: 'cacic-event-data', version: 1, resources: [] },
    auditEntryIds: [],
    synchronizationPending: true,
    undone: false,
    ...overrides,
  };
}

function auditEntry(batchMetadata: unknown = metadata(), overrides: Record<string, unknown> = {}) {
  const id = '8e2aab6a-f323-497f-87c0-8af596400001';
  return {
    id,
    entityType: AuditLogEntityType.SYSTEM,
    entityId: `data-transfer:${id}`,
    operation: AuditLogOperation.IMPORT,
    actorId: actor.sub,
    createdAt: new Date(Date.now() - 60_000),
    revertedAt: null,
    metadata: batchMetadata,
    ...overrides,
  };
}

function fixture(options: { metadata?: unknown } = {}) {
  let currentGroup: Record<string, unknown> | null = { id: 'group-1', name: 'Nome importado' };
  const batch = auditEntry(options.metadata);
  const eventGroup = {
    findMany: jest.fn(async () => (currentGroup ? [{ ...currentGroup }] : [])),
    updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (!currentGroup) return { count: 0 };
      currentGroup = { ...currentGroup, ...data };
      return { count: 1 };
    }),
    deleteMany: jest.fn(async () => {
      const count = currentGroup ? 1 : 0;
      currentGroup = null;
      return { count };
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      currentGroup = { ...data };
      return currentGroup;
    }),
  };
  const auditLogEntry = {
    findUnique: jest.fn(async () => batch),
    findFirst: jest.fn(async () => batch),
    findMany: jest.fn(async () => [batch]),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where['id'] === batch.id) Object.assign(batch, data);
      return { count: 1 };
    }),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(batch, data)),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  };
  const tx = { eventGroup, auditLogEntry };
  const prisma = {
    eventGroup,
    auditLogEntry,
    $transaction: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) => work(tx)),
  } as unknown as PrismaService;
  const authorization = {
    hasEventManagerAccess: jest.fn(() => true),
    isSuperAdmin: jest.fn(() => false),
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthorizationPolicyService;
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  } as unknown as FrozenResourceService;
  const service = new DataTransferJournalService(prisma, authorization, frozen);
  return { service, prisma, tx, batch, eventGroup, auditLogEntry, authorization, frozen };
}

describe('readTransferJournal', () => {
  it('accepts a versioned journal object and rejects invalid or legacy metadata', () => {
    expect(readTransferJournal(metadata())).toEqual(metadata());
    expect(readTransferJournal(null)).toBeNull();
    expect(readTransferJournal([])).toBeNull();
    expect(readTransferJournal({ type: 'data-transfer-batch', version: 1, mutations: [] })).toBeNull();
    expect(readTransferJournal({ ...metadata(), version: 2 })).toBeNull();
  });
});

describe('DataTransferJournalService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records the reversible batch with its applied, unchanged, and blocked summary', async () => {
    const { service, tx, auditLogEntry } = fixture();
    const document: ResolvedTransferDocument = { format: 'cacic-event-data', version: 1, resources: [] };
    const items: TransferItem[] = [
      { kind: 'group', id: 'created', action: 'create', status: 'applied', message: 'Criado.', changes: [] },
      { kind: 'group', id: 'updated', action: 'update', status: 'applied', message: 'Atualizado.', changes: [] },
      { kind: 'group', id: 'same', action: 'unchanged', status: 'unchanged', message: 'Igual.', changes: [] },
      { kind: 'group', id: 'skipped', action: 'skip', status: 'blocked', message: 'Bloqueado.', changes: [] },
    ];

    const recorder = service.begin(tx as unknown as Prisma.TransactionClient);
    const recorded = await service.record(
      recorder,
      tx as unknown as Prisma.TransactionClient,
      actor,
      undefined,
      document,
      items,
    );
    const persisted = auditLogEntry.create.mock.calls[0]?.[0]?.data;

    expect(recorded).toEqual({ batchId: recorder.batchId, auditEntryId: recorder.batchId });
    expect(persisted).toMatchObject({
      id: recorder.batchId,
      entityType: AuditLogEntityType.SYSTEM,
      operation: AuditLogOperation.IMPORT,
      permission: Permission.DataTransfer.Import,
      metadata: {
        type: 'data-transfer-batch',
        summary: { create: 1, update: 1, unchanged: 1, skip: 1 },
        mutations: [],
        synchronizationPending: true,
        undone: false,
      },
    });
  });

  it('requires manager access and returns summaries without leaking backups', async () => {
    const { service, authorization, auditLogEntry } = fixture();
    const summaries = await service.history(actor);
    expect(summaries[0]).toMatchObject({ batchId: auditEntry().id, undone: false, synchronizationPending: true });
    expect(summaries[0]).not.toHaveProperty('mutations');
    expect(summaries[0]).not.toHaveProperty('document');

    jest.mocked(authorization.hasEventManagerAccess).mockReturnValue(false);
    await expect(service.history(actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.history(undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLogEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('limits ordinary history to the actor and lets a super-admin inspect all import batches', async () => {
    const { service, authorization, auditLogEntry } = fixture();
    await service.history(actor);
    expect(auditLogEntry.findMany).toHaveBeenLastCalledWith({
      where: {
        entityType: AuditLogEntityType.SYSTEM,
        operation: AuditLogOperation.IMPORT,
        entityId: { startsWith: 'data-transfer:' },
        actorId: actor.sub,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    jest.mocked(authorization.isSuperAdmin).mockReturnValue(true);
    await service.history(actor);
    const query = auditLogEntry.findMany.mock.calls[1]?.[0];
    expect(query?.where).not.toHaveProperty('actorId');
  });

  it('skips batches whose source is no longer visible but propagates non-authorization failures', async () => {
    const { service, authorization, auditLogEntry } = fixture();
    auditLogEntry.findMany.mockResolvedValueOnce([auditEntry()]);
    jest
      .mocked(authorization.assertPermissions)
      .mockRejectedValueOnce(new ForbiddenException())
      .mockRejectedValueOnce(new ForbiddenException())
      .mockRejectedValueOnce(new Error('permission service unavailable'));
    expect(await service.history(actor)).toEqual([]);
    await expect(service.history(actor)).rejects.toThrow('permission service unavailable');
  });

  it('replays only a valid committed request owned by the actor and still authorized for its source', async () => {
    const requestFingerprint = 'a'.repeat(64);
    const requestPlanHash = 'b'.repeat(64);
    const requestItems = [
      { kind: 'group', id: 'group-1', action: 'update', status: 'applied', message: 'Atualizado.' },
    ];
    const saved = metadata({ requestFingerprint, requestPlanHash, requestItems, requestSummary: metadata().summary });
    const { service, authorization } = fixture({ metadata: saved });

    await expect(service.findCommittedRequest(actor, requestFingerprint)).resolves.toMatchObject({
      metadata: { requestFingerprint, requestPlanHash, requestItems },
    });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.EventGroup.Read],
      { eventGroupId: 'group-1' },
    );
    await expect(
      service.findCommittedRequest({ ...actor, sub: 'different-user' }, requestFingerprint),
    ).resolves.toBeNull();
    await expect(service.findCommittedRequest(actor, 'bad-fingerprint')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects replay of undone work and malformed persisted replay payloads', async () => {
    const fingerprint = 'c'.repeat(64);
    const { service: undoneService } = fixture({
      metadata: metadata({ requestFingerprint: fingerprint, undone: true }),
    });
    await expect(undoneService.findCommittedRequest(actor, fingerprint)).rejects.toThrow('já foi desfeita');

    const { service: malformedService } = fixture({
      metadata: metadata({ requestFingerprint: fingerprint, requestPlanHash: 'not-a-hash' }),
    });
    await expect(malformedService.findCommittedRequest(actor, fingerprint)).rejects.toThrow(
      'não pode ser recuperado com segurança',
    );
  });

  it('undoes an unchanged committed update as one serializable audit transition', async () => {
    const { service, prisma, batch, eventGroup, auditLogEntry, authorization, frozen } = fixture();

    await expect(service.undo(batch.id, actor)).resolves.toEqual({
      batchId: batch.id,
      auditEntryId: expect.any(String),
      undone: true,
    });

    expect(eventGroup.updateMany).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { name: 'Nome anterior' } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 120000,
    });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Undo, Permission.EventGroup.Read, Permission.EventGroup.Update],
      { eventGroupId: 'group-1' },
    );
    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(batch.revertedAt).toBeInstanceOf(Date);
    expect(batch.metadata).toMatchObject({ undone: true, synchronizationPending: true });
    expect(auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: AuditLogOperation.REVERT,
        revertTargetId: batch.id,
        permission: Permission.DataTransfer.Undo,
      }),
    });
  });

  it('refuses undo after an out-of-band edit without changing the batch state', async () => {
    const { service, batch, eventGroup } = fixture();
    eventGroup.findMany.mockResolvedValue([{ id: 'group-1', name: 'Alterado depois' }]);

    await expect(service.undo(batch.id, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(eventGroup.updateMany).not.toHaveBeenCalled();
    expect(batch.revertedAt).toBeNull();
  });

  it('rejects missing batches, invalid identifiers, foreign ownership and a changed schema', async () => {
    const { service, batch, authorization, auditLogEntry } = fixture();
    await expect(service.undo('not-an-id', actor)).rejects.toBeInstanceOf(ForbiddenException);

    auditLogEntry.findUnique.mockResolvedValueOnce(null);
    await expect(service.undo(batch.id, actor)).rejects.toBeInstanceOf(NotFoundException);

    auditLogEntry.findUnique.mockResolvedValueOnce(auditEntry(metadata(), { actorId: 'another-organizer' }));
    await expect(service.undo(batch.id, actor)).rejects.toBeInstanceOf(NotFoundException);

    auditLogEntry.findUnique.mockResolvedValueOnce(auditEntry(metadata({ schemaFingerprint: 'obsolete-schema' })));
    await expect(service.undo(batch.id, actor)).rejects.toThrow('schema mudou');

    jest.mocked(authorization.hasEventManagerAccess).mockReturnValue(false);
    await expect(service.undo(batch.id, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a super-admin to undo another actor’s batch while preserving mutation permissions', async () => {
    const foreignBatch = auditEntry(metadata(), { actorId: 'original-organizer' });
    const { service, authorization, auditLogEntry } = fixture();
    auditLogEntry.findUnique.mockResolvedValue(foreignBatch);
    jest.mocked(authorization.isSuperAdmin).mockReturnValue(true);

    await expect(service.undo(foreignBatch.id, actor)).resolves.toMatchObject({ undone: true });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Undo, Permission.EventGroup.Read, Permission.EventGroup.Update],
      { eventGroupId: 'group-1' },
    );
  });

  it('marks synchronization complete only for the matching undo state and treats unreadable state as pending', async () => {
    const { service, prisma, auditLogEntry, batch } = fixture();
    await service.markSynchronized(batch.id, true);
    expect(auditLogEntry.update).not.toHaveBeenCalled();

    await service.markSynchronized(batch.id, false);
    expect(batch.metadata).toMatchObject({ synchronizationPending: false, undone: false });

    auditLogEntry.findUnique.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.synchronizationPending(batch.id)).resolves.toBe(true);
    expect(prisma.auditLogEntry.findUnique).toHaveBeenCalled();
  });
});
