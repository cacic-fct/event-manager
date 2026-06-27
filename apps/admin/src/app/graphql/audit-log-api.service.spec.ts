import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { AuditLogApiService } from './audit-log-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('AuditLogApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: AuditLogApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('AuditLogExplorer')) {
          return of({
            auditLogExplorer: {
              entries: [auditLogEntryFixture()],
              skip: 0,
              take: 25,
              total: 1,
              typesenseAvailable: true,
            },
          });
        }
        if (query.includes('RevertAuditLogEntry')) {
          return of({ revertAuditLogEntry: auditLogEntryFixture({ id: 'audit-revert' }) });
        }
        return of({ auditLogEntries: [auditLogEntryFixture()] });
      }),
    };

    TestBed.configureTestingModule({
      providers: [AuditLogApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(AuditLogApiService);
  });

  it('maps entity history, explorer, and revert operations', async () => {
    await expect(firstValueFrom(service.listEntityHistory({ entityType: 'PERSON', entityId: 'person-1' }))).resolves.toEqual([
      auditLogEntryFixture(),
    ]);
    await expect(
      firstValueFrom(
        service.searchExplorer({
          actor: 'Renan',
          entity: 'person-1',
          operation: 'UPDATE',
          revertedStatus: 'NOT_REVERTED',
          skip: 0,
          take: 25,
        }),
      ),
    ).resolves.toEqual({
      entries: [auditLogEntryFixture()],
      skip: 0,
      take: 25,
      total: 1,
      typesenseAvailable: true,
    });
    await expect(firstValueFrom(service.revertEntry({ entryId: 'audit-1', mode: 'ENTRY_ONLY' }))).resolves.toEqual(
      auditLogEntryFixture({ id: 'audit-revert' }),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('AuditLogEntries'), {
      input: { entityType: 'PERSON', entityId: 'person-1' },
      take: 80,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('auditLogExplorer'),
      expect.objectContaining({
        input: expect.objectContaining({
          actor: 'Renan',
          entity: 'person-1',
          operation: 'UPDATE',
        }),
      }),
    );
    expect(graphqlHttp.request.mock.calls[1][0]).toContain('beforeJson');
    expect(graphqlHttp.request.mock.calls[1][0]).toContain('metadataJson');
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('RevertAuditLogEntry'), {
      input: { entryId: 'audit-1', mode: 'ENTRY_ONLY' },
    });
  });
});

function auditLogEntryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    entityType: 'PERSON',
    entityId: 'person-1',
    entityLabel: 'Ana Silva',
    operation: 'UPDATE',
    summary: 'Pessoa atualizada.',
    actorId: 'admin-1',
    actorName: 'Renan Yudi',
    actorEmail: 'renan@example.com',
    actorType: 'USER',
    permission: 'person#update',
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: [],
    changedFields: [],
    groupedCount: 1,
    firstRecordedAt: '2026-06-25T12:00:00.000Z',
    lastRecordedAt: '2026-06-25T12:00:00.000Z',
    createdAt: '2026-06-25T12:00:00.000Z',
    revertedAt: null,
    revertedById: null,
    revertedByName: null,
    revertedByEntryId: null,
    revertTargetId: null,
    revertMode: null,
    canRevert: true,
    beforeJson: '{"name":"Ana"}',
    afterJson: '{"name":"Ana Silva"}',
    metadataJson: '{"source":"spec"}',
    ...overrides,
  };
}
