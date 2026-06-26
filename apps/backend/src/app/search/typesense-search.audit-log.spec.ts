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
});
