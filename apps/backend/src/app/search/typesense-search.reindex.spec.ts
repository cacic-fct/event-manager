import {
  reindexAllSearchDocuments,
  reindexEventGroupSearchDocuments,
  reindexEventSearchDocuments,
  replaceAuditLogSearchDocuments,
} from './typesense-search.reindex';
import { SEARCH_REINDEX_BATCH_SIZE } from './typesense-search.collections';
const { jest } = import.meta;

describe('typesense reindex helpers', () => {
  it('replaces every collection during a full reindex', async () => {
    const client = createClientMock();
    const prisma = createPrismaMock({
      event: [
        {
          id: 'event-1',
          name: 'Aula',
          emoji: 'calendar',
          type: 'LECTURE',
          startDate: new Date('2026-06-25T12:00:00.000Z'),
          endDate: new Date('2026-06-25T13:00:00.000Z'),
          shouldIssueCertificate: false,
          isPubliclyListed: true,
          publicationState: 'PUBLISHED',
        },
      ],
      majorEvent: [
        {
          id: 'major-1',
          name: 'Semana',
          startDate: new Date('2026-06-25T12:00:00.000Z'),
          endDate: new Date('2026-06-25T13:00:00.000Z'),
          publicationState: 'PUBLISHED',
        },
      ],
      eventGroup: [
        {
          id: 'group-1',
          name: 'Grupo',
          emoji: '👥',
          majorEventId: 'major-1',
          majorEvent: { name: 'Semana', deletedAt: null },
        },
      ],
      people: [{ id: 'person-1', name: 'Ana', secondaryEmails: [] }],
      placePreset: [{ id: 'place-1', name: 'Lab' }],
      certificateTemplate: [{ id: 'template-1', name: 'Certificado', isActive: true }],
    });

    await reindexAllSearchDocuments({
      client: client.instance as never,
      logger: { error: jest.fn() } as never,
      prisma: prisma as never,
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: expect.objectContaining({ id: true, publicationState: true }),
      orderBy: { id: 'asc' },
      take: SEARCH_REINDEX_BATCH_SIZE,
    });
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^cacic_event_manager_events_reindex_/) }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^cacic_event_manager_audit_logs_reindex_/) }),
    );
    expect(client.documents.import).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'event-1', isPubliclyListed: true })],
      { action: 'upsert' },
    );
    expect(client.documents.import).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'group-1',
          emoji: '👥',
          majorEventId: 'major-1',
          majorEventName: 'Semana',
        }),
      ],
      { action: 'upsert' },
    );
  });

  it('reindexes changed events with deletedAt protection', async () => {
    const client = createClientMock();
    const prisma = createPrismaMock({
      event: [
        {
          id: 'event-1',
          name: 'Aula',
          emoji: 'calendar',
          type: 'LECTURE',
          startDate: new Date('2026-06-25T12:00:00.000Z'),
          endDate: new Date('2026-06-25T13:00:00.000Z'),
          shouldIssueCertificate: true,
          isPubliclyListed: false,
          publicationState: 'DRAFT',
        },
      ],
    });

    await reindexEventSearchDocuments({
      client: client.instance as never,
      logger: { error: jest.fn() } as never,
      prisma: prisma as never,
      where: { majorEventId: 'major-1' },
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { majorEventId: 'major-1', deletedAt: null },
      select: expect.objectContaining({ id: true, majorEvent: expect.any(Object) }),
      orderBy: { id: 'asc' },
      take: SEARCH_REINDEX_BATCH_SIZE,
    });
    expect(client.documents.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }));
  });

  it('reindexes groups after major-event metadata changes', async () => {
    const client = createClientMock();
    const prisma = createPrismaMock({
      eventGroup: [
        {
          id: 'group-1',
          name: 'Grupo',
          emoji: '👥',
          majorEventId: 'major-1',
          majorEvent: { name: 'Semana atualizada', deletedAt: null },
        },
      ],
    });

    await reindexEventGroupSearchDocuments({
      client: client.instance as never,
      logger: { error: jest.fn() } as never,
      prisma: prisma as never,
      where: { majorEventId: 'major-1' },
    });

    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith({
      where: { majorEventId: 'major-1', deletedAt: null },
      select: expect.objectContaining({ id: true, majorEvent: expect.any(Object) }),
      orderBy: { id: 'asc' },
      take: SEARCH_REINDEX_BATCH_SIZE,
    });
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'group-1',
        majorEventName: 'Semana atualizada',
      }),
    );
  });

  it.each(['event', 'eventGroup'] as const)(
    'cursor-batches changed %s records and bounds indexing concurrency',
    async (model) => {
      const client = createClientMock();
      const prisma = createPrismaMock();
      const firstPage = Array.from({ length: SEARCH_REINDEX_BATCH_SIZE }, (_, index) => ({
        id: `record-${String(index).padStart(4, '0')}`,
        name: 'Evento',
        startDate: new Date(),
        endDate: new Date(),
        majorEvent: null,
      }));
      const lastPage = [{ ...firstPage[0], id: 'record-last' }];
      prisma[model].findMany.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(lastPage);
      let active = 0;
      let maximum = 0;
      client.documents.upsert.mockImplementation(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        return {};
      });
      const reindex = model === 'event' ? reindexEventSearchDocuments : reindexEventGroupSearchDocuments;
      await reindex({
        client: client.instance as never,
        prisma: prisma as never,
        logger: { error: jest.fn() } as never,
        where: { majorEventId: 'major' },
        throwOnError: true,
      });
      expect(prisma[model].findMany).toHaveBeenCalledTimes(2);
      expect(prisma[model].findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            AND: [{ majorEventId: 'major', deletedAt: null }, { id: { gt: firstPage[firstPage.length - 1].id } }],
          },
          orderBy: { id: 'asc' },
          take: SEARCH_REINDEX_BATCH_SIZE,
        }),
      );
      expect(client.documents.upsert).toHaveBeenCalledTimes(SEARCH_REINDEX_BATCH_SIZE + 1);
      expect(maximum).toBeLessThanOrEqual(4);
      expect(maximum).toBeGreaterThan(1);
      expect(client.documents.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'record-last' }));
    },
  );

  it.each(['event', 'eventGroup'] as const)('propagates changed %s indexing failures when requested', async (model) => {
    const client = createClientMock();
    const prisma = createPrismaMock({
      [model]: [{ id: 'record', name: 'Evento', startDate: new Date(), endDate: new Date() }],
    });
    const error = new Error('index unavailable');
    client.documents.upsert.mockRejectedValue(error);
    const reindex = model === 'event' ? reindexEventSearchDocuments : reindexEventGroupSearchDocuments;
    const input = {
      client: client.instance as never,
      prisma: prisma as never,
      logger: { error: jest.fn() } as never,
      where: { majorEventId: 'major' },
    };
    await expect(reindex({ ...input, throwOnError: true })).rejects.toBe(error);
    await expect(reindex(input)).resolves.toBeUndefined();
  });

  it('imports audit-log entries in cursor batches', async () => {
    const client = createClientMock();
    const firstBatch = Array.from({ length: 500 }, (_, index) => createAuditLogEntry(`audit-${index}`));
    const secondBatch = [createAuditLogEntry('audit-500')];
    const prisma = createPrismaMock({ auditLogEntry: firstBatch });
    prisma.auditLogEntry.findMany.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce(secondBatch);

    await replaceAuditLogSearchDocuments({
      client: client.instance as never,
      logger: { error: jest.fn() } as never,
      prisma: prisma as never,
      schema: { name: 'audit_logs', fields: [{ name: 'id', type: 'string' }] },
    });

    expect(prisma.auditLogEntry.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { lastRecordedAt: { gte: expect.any(Date) }, id: { gt: 'audit-499' } },
        orderBy: { id: 'asc' },
      }),
    );
    expect(client.documents.import).toHaveBeenCalledTimes(2);
    expect(client.documents.import).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'audit-500' })], {
      action: 'upsert',
    });
    expect(client.aliasesRoot.upsert).toHaveBeenCalledWith('audit_logs', {
      collection_name: expect.stringMatching(/^audit_logs_reindex_/),
    });
  });

  it('keeps the live audit-log collection published when a batch import fails', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    const prisma = createPrismaMock({ auditLogEntry: [createAuditLogEntry('audit-1')] });
    client.documents.import.mockResolvedValueOnce([{ success: false, error: 'Invalid document.', code: 400 }]);

    await replaceAuditLogSearchDocuments({
      client: client.instance as never,
      logger: logger as never,
      prisma: prisma as never,
      schema: { name: 'audit_logs', fields: [{ name: 'id', type: 'string' }] },
    });

    expect(client.aliasesRoot.upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to replace Typesense documents for audit_logs.',
      expect.objectContaining({
        message: 'Failed to import Typesense documents into audit_logs: Invalid document.',
      }),
    );
  });
});

function createClientMock() {
  const documents = {
    import: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const collection = {
    delete: jest.fn().mockResolvedValue(undefined),
    documents: jest.fn(() => documents),
    retrieve: jest.fn().mockRejectedValue({ httpStatus: 404 }),
  };
  const rootCollections = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const alias = {
    retrieve: jest.fn().mockRejectedValue({ httpStatus: 404 }),
  };
  const aliasesRoot = {
    upsert: jest.fn().mockResolvedValue({}),
  };
  const instance = {
    collections: jest.fn((name?: string) => (name ? collection : rootCollections)),
    aliases: jest.fn((name?: string) => (name ? alias : aliasesRoot)),
  };

  return {
    alias,
    aliasesRoot,
    collection,
    documents,
    instance,
    rootCollections,
  };
}

function createPrismaMock(
  records: Partial<{
    event: unknown[];
    majorEvent: unknown[];
    eventGroup: unknown[];
    people: unknown[];
    placePreset: unknown[];
    certificateTemplate: unknown[];
    auditLogEntry: unknown[];
  }> = {},
) {
  return {
    event: {
      findMany: jest.fn().mockResolvedValue(records.event ?? []),
    },
    majorEvent: {
      findMany: jest.fn().mockResolvedValue(records.majorEvent ?? []),
    },
    eventGroup: {
      findMany: jest.fn().mockResolvedValue(records.eventGroup ?? []),
    },
    people: {
      findMany: jest.fn().mockResolvedValue(records.people ?? []),
    },
    placePreset: {
      findMany: jest.fn().mockResolvedValue(records.placePreset ?? []),
    },
    certificateTemplate: {
      findMany: jest.fn().mockResolvedValue(records.certificateTemplate ?? []),
    },
    auditLogEntry: {
      findMany: jest.fn().mockResolvedValue(records.auditLogEntry ?? []),
    },
  };
}

function createAuditLogEntry(id: string) {
  const recordedAt = new Date('2026-06-25T12:00:00.000Z');

  return {
    id,
    entityType: 'PERSON',
    entityId: 'person-1',
    operation: 'UPDATE',
    actorName: 'Admin',
    actorType: 'USER',
    before: null,
    after: null,
    changes: [],
    changedFields: [],
    groupedCount: 1,
    firstRecordedAt: recordedAt,
    lastRecordedAt: recordedAt,
    createdAt: recordedAt,
  };
}
