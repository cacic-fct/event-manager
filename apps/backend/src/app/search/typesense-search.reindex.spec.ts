import {
  reindexAllSearchDocuments,
  reindexEventSearchDocuments,
  replaceAuditLogSearchDocuments,
} from './typesense-search.reindex';

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
          publiclyVisible: true,
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
      eventGroup: [{ id: 'group-1', name: 'Grupo' }],
      people: [{ id: 'person-1', name: 'Ana', secondaryEmails: [] }],
      placePreset: [{ id: 'place-1', name: 'Lab' }],
      certificateTemplate: [{ id: 'template-1', name: 'Certificado', version: 1, isActive: true }],
    });

    await reindexAllSearchDocuments({
      client: client.instance as never,
      logger: { error: jest.fn() } as never,
      prisma: prisma as never,
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: expect.objectContaining({ id: true, publicationState: true }),
    });
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_events' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_audit_logs' }),
    );
    expect(client.documents.import).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'event-1', publiclyVisible: true })],
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
          publiclyVisible: false,
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
    });
    expect(client.documents.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }));
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
      expect.objectContaining({ cursor: { id: 'audit-499' }, skip: 1 }),
    );
    expect(client.documents.import).toHaveBeenCalledTimes(2);
    expect(client.documents.import).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'audit-500' })], {
      action: 'upsert',
    });
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
  };
  const rootCollections = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const instance = {
    collections: jest.fn((name?: string) => (name ? collection : rootCollections)),
  };

  return {
    collection,
    documents,
    instance,
    rootCollections,
  };
}

function createPrismaMock(records: Partial<{
  event: unknown[];
  majorEvent: unknown[];
  eventGroup: unknown[];
  people: unknown[];
  placePreset: unknown[];
  certificateTemplate: unknown[];
  auditLogEntry: unknown[];
}> = {}) {
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
