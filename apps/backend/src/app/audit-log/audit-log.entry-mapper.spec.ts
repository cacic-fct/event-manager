import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogEntry,
  AuditLogOperation,
  AuditLogRevertMode,
  Prisma,
} from '@prisma/client';
import { mapAuditLogEntry, mapAuditLogExplorerEntry } from './audit-log.entry-mapper';

describe('audit log entry mapper', () => {
  it('maps stored changes using explicit labels and field-label fallbacks', () => {
    const entry = createAuditEntry({
      changes: [
        {
          field: 'name',
          label: 'Nome salvo',
          before: 'Ana',
          after: 'Ana Clara',
        },
        {
          field: 'allowSubscription',
          before: false,
          after: true,
        },
      ],
      changedFields: ['name', 'allowSubscription'],
      revertedAt: new Date('2026-06-22T13:00:00.000Z'),
      revertedById: 'admin-2',
      revertedByName: 'Coordenador',
      revertedByEntryId: 'audit-revert-1',
      revertTargetId: 'audit-0',
      revertMode: AuditLogRevertMode.ENTRY_ONLY,
    });

    const mapped = mapAuditLogEntry(entry, (candidate) => candidate.revertedAt === null);

    expect(mapped).toMatchObject({
      id: 'audit-1',
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Pessoa',
      operation: AuditLogOperation.UPDATE,
      actorId: 'admin-1',
      actorName: 'Admin',
      actorEmail: 'admin@example.com',
      actorType: AuditLogActorType.USER,
      changedFields: ['name', 'allowSubscription'],
      groupedCount: 1,
      revertedById: 'admin-2',
      revertedByName: 'Coordenador',
      revertedByEntryId: 'audit-revert-1',
      revertTargetId: 'audit-0',
      revertMode: AuditLogRevertMode.ENTRY_ONLY,
      canRevert: false,
    });
    expect(mapped.changes).toEqual([
      {
        field: 'name',
        label: 'Nome salvo',
        beforeValue: 'Ana',
        afterValue: 'Ana Clara',
      },
      {
        field: 'allowSubscription',
        label: 'Permitir inscrição',
        beforeValue: 'Não',
        afterValue: 'Sim',
      },
    ]);
  });

  it('maps explorer JSON snapshots for readable display', () => {
    const entry = createAuditEntry({
      before: null,
      after: { name: 'Ana Clara' },
      metadata: { source: 'test' },
    });

    expect(mapAuditLogExplorerEntry(entry, () => true)).toMatchObject({
      beforeJson: null,
      afterJson: JSON.stringify({ name: 'Ana Clara' }, null, 2),
      metadataJson: JSON.stringify({ source: 'test' }, null, 2),
      canRevert: true,
    });
  });

  it('exposes only safe batch summary metadata in audit explorer results', () => {
    const entry = createAuditEntry({
      entityType: AuditLogEntityType.SYSTEM,
      entityId: 'data-transfer:batch-1',
      operation: AuditLogOperation.IMPORT,
      metadata: {
        type: 'data-transfer-batch',
        version: 1,
        summary: { create: 1, update: 2, unchanged: 3, skip: 4, private: 'drop-me' },
        undone: false,
        synchronizationPending: true,
        dataTransferBatchId: 'batch-1',
        requestFingerprint: 'private-fingerprint',
        requestItems: [{ id: 'private-resource-id' }],
        allocationToken: 'private-allocation-token',
        rawFile: 'private-file-content',
        creationReferences: [{ model: 'eventGroup', key: { id: 'private-group-id' }, relations: {} }],
        mutations: [{ before: { privateToken: 'private-rollback-token' } }],
        document: { resources: [{ person: { email: 'private-person@example.test' } }] },
      },
    });

    const metadataJson = mapAuditLogExplorerEntry(entry, () => false).metadataJson;
    expect(metadataJson).toBe(
      JSON.stringify(
        {
          type: 'data-transfer-batch',
          version: 1,
          summary: { create: 1, update: 2, unchanged: 3, skip: 4 },
          undone: false,
          synchronizationPending: true,
          dataTransferBatchId: 'batch-1',
        },
        null,
        2,
      ),
    );
    expect(metadataJson).not.toContain('private');
  });
});

function createAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
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
    changes: [] as Prisma.JsonArray,
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
