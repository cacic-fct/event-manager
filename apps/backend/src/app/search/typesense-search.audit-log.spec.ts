import { AUDIT_LOG_QUERY_BY, AUDIT_LOG_SEARCH_SELECT, toAuditLogSearchDocument } from './typesense-search.audit-log';

describe('typesense audit-log search helpers', () => {
  it('exposes the select and query fields required for audit-log search', () => {
    expect(AUDIT_LOG_SEARCH_SELECT).toMatchObject({
      id: true,
      entityType: true,
      changes: true,
      revertedAt: true,
      metadata: true,
    });
    expect(AUDIT_LOG_QUERY_BY).toContain('actorEmail');
    expect(AUDIT_LOG_QUERY_BY).toContain('changesText');
    expect(AUDIT_LOG_QUERY_BY).toContain('revertTargetId');
  });

  it('maps audit-log entries into searchable text and facets', () => {
    const recordedAt = new Date('2026-06-25T12:00:00.000Z');

    expect(
      toAuditLogSearchDocument({
        id: 'audit-1',
        entityType: 'PERSON',
        entityId: 'person-1',
        entityLabel: ' Ana ',
        operation: 'UPDATE',
        summary: ' Atualizou pessoa ',
        actorId: 'actor-1',
        actorName: 'Admin',
        actorEmail: ' admin@example.com ',
        actorType: 'USER',
        permission: 'person:update',
        eventId: null,
        majorEventId: null,
        eventGroupId: null,
        before: { name: 'Ana' },
        after: { name: 'Ana Silva' },
        changes: [{ field: 'name', label: 'Nome', before: 'Ana', after: 'Ana Silva' }],
        changedFields: ['name'],
        groupedCount: 1,
        firstRecordedAt: recordedAt,
        lastRecordedAt: recordedAt,
        createdAt: recordedAt,
        revertedAt: recordedAt,
        revertedById: 'admin-2',
        revertedByName: ' Revisor ',
        revertedByEntryId: 'audit-0',
        revertTargetId: 'audit-target',
        revertMode: 'FULL',
        metadata: { reason: 'test' },
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'audit-1',
        entityLabel: 'Ana',
        summary: 'Atualizou pessoa',
        actorEmail: 'admin@example.com',
        changedFields: ['name'],
        changedFieldLabels: ['Nome'],
        changesText: expect.stringContaining('Ana Silva'),
        beforeText: '{"name":"Ana"}',
        afterText: '{"name":"Ana Silva"}',
        metadataText: '{"reason":"test"}',
        firstRecordedAt: 1782388800,
        reverted: true,
        revertedByName: 'Revisor',
      }),
    );
  });

  it('normalizes required actor names and omits empty changed-field labels', () => {
    const recordedAt = new Date('2026-06-25T12:00:00.000Z');
    const document = toAuditLogSearchDocument({
      id: 'audit-2',
      entityType: 'SYSTEM',
      entityId: 'import-1',
      entityLabel: null,
      operation: 'IMPORT',
      summary: null,
      actorId: null,
      actorName: '   ',
      actorEmail: null,
      actorType: 'SYSTEM',
      permission: null,
      eventId: null,
      majorEventId: null,
      eventGroupId: null,
      before: null,
      after: null,
      changes: [{ field: 'rows', before: 0, after: 2 }],
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
    });

    expect(document.actorName).toBe('Sistema');
    expect(document.changedFields).toBeUndefined();
    expect(document.changedFieldLabels).toBeUndefined();
  });

  it('never copies private JSON import snapshots or uploaded identities to the search index', () => {
    const now = new Date();
    const document = toAuditLogSearchDocument({
      id: 'batch-1',
      entityType: 'SYSTEM',
      entityId: 'data-transfer:batch-1',
      entityLabel: 'Importação JSON',
      operation: 'IMPORT',
      summary: 'Importação confirmada.',
      actorId: 'organizer-1',
      actorName: 'Organizador',
      actorEmail: null,
      actorType: 'USER',
      permission: 'data-transfer#import',
      eventId: null,
      majorEventId: null,
      eventGroupId: null,
      before: null,
      after: null,
      changes: [],
      changedFields: [],
      groupedCount: 1,
      firstRecordedAt: now,
      lastRecordedAt: now,
      createdAt: now,
      revertedAt: null,
      revertedById: null,
      revertedByName: null,
      revertedByEntryId: null,
      revertTargetId: null,
      revertMode: null,
      metadata: {
        type: 'data-transfer-batch',
        version: 1,
        summary: { create: 1, update: 0, unchanged: 0, skip: 0 },
        undone: false,
        synchronizationPending: true,
        requestFingerprint: 'private-request-fingerprint',
        requestItems: [{ id: 'private-request-item' }],
        mutations: [{ before: { privateToken: 'private-rollback-token' }, after: null }],
        document: { resources: [{ person: { email: 'private-person@example.test' } }] },
      },
    });
    expect(document.metadataText).toContain('data-transfer-batch');
    expect(document.metadataText).toContain('"create":1');
    expect(JSON.stringify(document)).not.toContain('private-rollback-token');
    expect(JSON.stringify(document)).not.toContain('private-person@example.test');
    expect(JSON.stringify(document)).not.toContain('private-request-fingerprint');
    expect(JSON.stringify(document)).not.toContain('private-request-item');
    expect(document.metadataText).not.toContain('mutations');
    expect(document.metadataText).not.toContain('document');
  });
});
