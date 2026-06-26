import Typesense from 'typesense';
import { TypesenseSearchService } from './typesense-search.service';

jest.mock('typesense', () => ({
  __esModule: true,
  default: {
    Client: jest.fn(),
  },
}));

const typesenseClientConstructor = Typesense.Client as unknown as jest.Mock;

describe('TypesenseSearchService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TYPESENSE_ENABLED;
    delete process.env.TYPESENSE_URL;
    delete process.env.TYPESENSE_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('builds a client from TYPESENSE_URL when search is enabled', () => {
    const client = createTypesenseClientMock();
    typesenseClientConstructor.mockReturnValue(client.instance);
    process.env.TYPESENSE_ENABLED = 'true';
    process.env.TYPESENSE_URL = 'https://search.example.com';
    process.env.TYPESENSE_API_KEY = 'secret';

    const service = new TypesenseSearchService(createPrismaMock() as never);

    expect(service.isEnabled()).toBe(true);
    expect(typesenseClientConstructor).toHaveBeenCalledWith({
      apiKey: 'secret',
      nodes: [
        {
          host: 'search.example.com',
          port: 443,
          protocol: 'https',
        },
      ],
      connectionTimeoutSeconds: 5,
    });
  });

  it('keeps search unavailable when enabled without a valid TYPESENSE_URL', () => {
    process.env.TYPESENSE_ENABLED = 'true';
    process.env.TYPESENSE_URL = '';
    process.env.TYPESENSE_API_KEY = 'secret';

    const missingUrlService = new TypesenseSearchService(createPrismaMock() as never);

    expect(missingUrlService.isEnabled()).toBe(false);
    expect(typesenseClientConstructor).not.toHaveBeenCalled();

    process.env.TYPESENSE_URL = 'postgresql://search.example.com';

    const invalidProtocolService = new TypesenseSearchService(createPrismaMock() as never);

    expect(invalidProtocolService.isEnabled()).toBe(false);
    expect(typesenseClientConstructor).not.toHaveBeenCalled();
  });

  it('keeps search unavailable when disabled or queried with blank text', async () => {
    const service = new TypesenseSearchService(createPrismaMock() as never);

    await expect(service.searchEvents('   ')).resolves.toEqual({
      available: false,
      ids: [],
    });
    expect(service.isEnabled()).toBe(false);
  });

  it('searches configured collections and filters invalid hit ids', async () => {
    const { client, service } = createEnabledService();
    client.documents.search
      .mockResolvedValueOnce({
        hits: [{ document: { id: 'event-2' } }, { document: { id: '' } }, { document: { id: 'event-1' } }],
      })
      .mockResolvedValueOnce({ hits: [{ document: { id: 'major-1' } }] })
      .mockResolvedValueOnce({ hits: [{ document: { id: 'group-1' } }] })
      .mockResolvedValueOnce({ hits: [{ document: { id: 'person-1' } }] })
      .mockResolvedValueOnce({ hits: [{ document: { id: 'place-1' } }] })
      .mockResolvedValueOnce({ hits: [{ document: { id: 'template-1' } }] });

    await expect(service.searchEvents(' aula ', 7)).resolves.toEqual({
      available: true,
      ids: ['event-2', 'event-1'],
    });
    await expect(service.searchMajorEvents('major', 3)).resolves.toEqual({
      available: true,
      ids: ['major-1'],
    });
    await expect(service.searchEventGroups('grupo', 4)).resolves.toEqual({
      available: true,
      ids: ['group-1'],
    });
    await expect(service.searchPeople('ana', 5)).resolves.toEqual({
      available: true,
      ids: ['person-1'],
    });
    await expect(service.searchPlacePresets('lab', 6)).resolves.toEqual({
      available: true,
      ids: ['place-1'],
    });
    await expect(service.searchCertificateTemplates('certificado', 8)).resolves.toEqual({
      available: true,
      ids: ['template-1'],
    });

    expect(client.instance.collections).toHaveBeenNthCalledWith(1, 'cacic_event_manager_events');
    expect(client.documents.search).toHaveBeenNthCalledWith(1, {
      q: 'aula',
      query_by: 'name,description,shortDescription,locationDescription,majorEventName,eventGroupName,emoji',
      per_page: 7,
    });
    expect(client.instance.collections).toHaveBeenNthCalledWith(4, 'cacic_event_manager_people');
    expect(client.documents.search).toHaveBeenNthCalledWith(4, {
      q: 'ana',
      query_by: 'name,email,secondaryEmails,phone,identityDocument,academicId',
      per_page: 5,
    });
  });

  it('passes Typesense filters and offsets while chunking large result windows', async () => {
    const { client, service } = createEnabledService();
    client.documents.search
      .mockResolvedValueOnce({
        hits: Array.from({ length: 250 }, (_, index) => ({ document: { id: `event-${index}` } })),
      })
      .mockResolvedValueOnce({
        hits: [
          { document: { id: 'event-250' } },
          { document: { id: 'event-251' } },
          { document: { id: 'event-252' } },
        ],
      });

    await expect(
      service.searchEvents('aula', {
        filterBy: 'publiclyVisible:=true',
        limit: 253,
        offset: 250,
      }),
    ).resolves.toEqual({
      available: true,
      ids: [...Array.from({ length: 250 }, (_, index) => `event-${index}`), 'event-250', 'event-251', 'event-252'],
    });

    expect(client.documents.search).toHaveBeenNthCalledWith(1, {
      q: 'aula',
      query_by: 'name,description,shortDescription,locationDescription,majorEventName,eventGroupName,emoji',
      per_page: 250,
      offset: 250,
      filter_by: 'publiclyVisible:=true',
    });
    expect(client.documents.search).toHaveBeenNthCalledWith(2, {
      q: 'aula',
      query_by: 'name,description,shortDescription,locationDescription,majorEventName,eventGroupName,emoji',
      per_page: 3,
      offset: 500,
      filter_by: 'publiclyVisible:=true',
    });
  });

  it('searches audit logs with match-all queries, filters, sorting, and totals', async () => {
    const { client, service } = createEnabledService();
    client.documents.search.mockResolvedValueOnce({
      found: 42,
      hits: [{ document: { id: 'audit-2' } }, { document: { id: 'audit-1' } }],
    });

    await expect(
      service.searchAuditLogEntries('', {
        filterBy: 'operation:=`UPDATE` && reverted:=false',
        limit: 25,
        offset: 50,
        sortBy: 'lastRecordedAt:desc,createdAt:desc',
      }),
    ).resolves.toEqual({
      available: true,
      found: 42,
      ids: ['audit-2', 'audit-1'],
    });

    expect(client.instance.collections).toHaveBeenCalledWith('cacic_event_manager_audit_logs');
    expect(client.documents.search).toHaveBeenCalledWith({
      q: '*',
      query_by: expect.stringContaining('actorEmail'),
      per_page: 25,
      offset: 50,
      filter_by: 'operation:=`UPDATE` && reverted:=false',
      sort_by: 'lastRecordedAt:desc,createdAt:desc',
    });
  });

  it('returns an unavailable result when Typesense search fails', async () => {
    const { client, service } = createEnabledService();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    client.documents.search.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.searchEvents('aula')).resolves.toEqual({
      available: false,
      ids: [],
    });
  });

  it('upserts event documents with denormalized active parent names', async () => {
    const prisma = createPrismaMock();
    prisma.majorEvent.findFirst
      .mockResolvedValueOnce({ name: '  Semana academica  ' })
      .mockResolvedValueOnce({ publicationState: 'PUBLISHED' });
    prisma.eventGroup.findFirst.mockResolvedValue({
      name: '  Minicursos  ',
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: true,
    });
    const { client, service } = createEnabledService(prisma);
    const startDate = new Date('2026-06-22T12:00:00.000Z');
    const endDate = new Date('2026-06-22T13:30:00.000Z');

    await service.upsertEvent({
      id: 'event-1',
      name: 'Aula inaugural',
      emoji: 'calendar',
      type: 'LECTURE',
      description: '  Descricao  ',
      shortDescription: '  ',
      locationDescription: null,
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      shouldIssueCertificate: true,
      publiclyVisible: true,
      publicationState: 'PUBLISHED',
      startDate,
      endDate,
    });

    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'major-1', deletedAt: null },
      select: { name: true },
    });
    expect(prisma.eventGroup.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      select: {
        name: true,
        shouldIssueCertificate: true,
        shouldIssueCertificateForEachEvent: true,
      },
    });
    expect(client.documents.upsert).toHaveBeenCalledWith({
      id: 'event-1',
      name: 'Aula inaugural',
      emoji: 'calendar',
      type: 'LECTURE',
      description: 'Descricao',
      shortDescription: undefined,
      locationDescription: undefined,
      majorEventId: 'major-1',
      majorEventName: 'Semana academica',
      eventGroupId: 'group-1',
      eventGroupName: 'Minicursos',
      startDate: Math.floor(startDate.getTime() / 1000),
      endDate: Math.floor(endDate.getTime() / 1000),
      publiclyVisible: true,
      publicationState: 'PUBLISHED',
      majorEventPublicationState: 'PUBLISHED',
      isIssuableCertificateEvent: false,
    });
  });

  it('deletes documents from their collection and logs failures without throwing', async () => {
    const { client, service } = createEnabledService();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    client.document.delete.mockRejectedValueOnce(new Error('missing'));

    await expect(service.deleteEvent('event-1')).resolves.toBeUndefined();

    expect(client.collection.documents).toHaveBeenCalledWith('event-1');
    expect(client.document.delete).toHaveBeenCalledTimes(1);
  });

  it('syncs supported documents and reindexes events tied to parent changes', async () => {
    const reindexedEvent = {
      id: 'event-1',
      name: 'Evento',
      emoji: 'calendar',
      type: 'LECTURE',
      description: null,
      shortDescription: null,
      locationDescription: 'Sala 1',
      majorEventId: 'major-1',
      majorEvent: {
        name: 'Grande evento',
        deletedAt: null,
      },
      eventGroupId: 'group-1',
      eventGroup: {
        name: 'Grupo',
        deletedAt: null,
        shouldIssueCertificate: true,
        shouldIssueCertificateForEachEvent: true,
      },
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
      shouldIssueCertificate: true,
      publiclyVisible: true,
    };
    const prisma = createPrismaMock({
      event: [reindexedEvent],
    });
    const { client, service } = createEnabledService(prisma);

    await service.upsertMajorEvent({
      id: 'major-1',
      name: 'Grande evento',
      description: '  Principal  ',
      startDate: new Date('2026-06-20T12:00:00.000Z'),
      endDate: new Date('2026-06-25T12:00:00.000Z'),
    });
    await service.deleteMajorEvent('major-1');
    await service.upsertEventGroup({
      id: 'group-1',
      name: 'Grupo',
    });
    await service.deleteEventGroup('group-1');
    await service.upsertPerson({
      id: 'person-1',
      name: 'Ana',
      email: ' ana@example.com ',
      secondaryEmails: ['ana@unesp.br', ''],
      phone: ' ',
      identityDocument: '123',
      academicId: null,
      userId: 'user-1',
    });
    await service.deletePerson('person-1');
    await service.upsertPlacePreset({
      id: 'place-1',
      name: 'Sala 1',
      locationDescription: ' Bloco A ',
    });
    await service.deletePlacePreset('place-1');
    await service.upsertCertificateTemplate({
      id: 'template-1',
      name: 'Certificado',
      description: null,
      version: 2,
      isActive: true,
    });
    await service.deleteCertificateTemplate('template-1');

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          majorEventId: 'major-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventGroupId: 'group-1',
          deletedAt: null,
        },
      }),
    );
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'major-1',
        description: 'Principal',
      }),
    );
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        majorEventName: 'Grande evento',
        eventGroupName: 'Grupo',
      }),
    );
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'person-1',
        email: 'ana@example.com',
        secondaryEmails: ['ana@unesp.br'],
        phone: undefined,
        academicId: undefined,
      }),
    );
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'place-1',
        locationDescription: 'Bloco A',
      }),
    );
    expect(client.documents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'template-1',
        description: undefined,
      }),
    );
    expect(client.document.delete).toHaveBeenCalledWith();
  });

  it('returns early from sync helpers when no client is configured', async () => {
    const service = new TypesenseSearchService(createPrismaMock() as never);

    await service.onModuleInit();
    await service.upsertEvent({
      id: 'event-1',
      name: 'Evento',
      emoji: 'calendar',
      type: 'LECTURE',
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
    });
    await service['ensureCollections']();
    await service['reindexAll']();
    await service['replaceCollectionDocuments'](service['createCollectionSchema']('cacic_event_manager_events', []), [
      { id: 'event-1' },
    ]);
    await service['upsertDocument']('cacic_event_manager_events', { id: 'event-1' });
    await service['deleteDocument']('cacic_event_manager_events', 'event-1');
    await service.upsertAuditLogEntry(createAuditLogEntry());
    await expect(service.searchAuditLogEntries('', { limit: 10 })).resolves.toEqual({
      available: false,
      found: 0,
      ids: [],
    });

    expect(typesenseClientConstructor).not.toHaveBeenCalled();
  });

  it('logs initialization and document synchronization failures without throwing', async () => {
    const { client, service } = createEnabledService();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    client.collection.exists.mockRejectedValueOnce(new Error('schema unavailable'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    client.collection.delete.mockRejectedValueOnce(new Error('collection delete failed'));
    await expect(
      service['replaceCollectionDocuments'](service['createCollectionSchema']('cacic_event_manager_events', []), [
        { id: 'event-1' },
      ]),
    ).resolves.toBeUndefined();

    client.documents.upsert.mockRejectedValueOnce(new Error('upsert failed'));
    await expect(service.upsertPerson({ id: 'person-1', name: 'Ana' })).resolves.toBeUndefined();
  });

  it('creates missing collections and indexes current database records during startup', async () => {
    const prisma = createPrismaMock({
      event: [
        {
          id: 'event-1',
          name: 'Evento',
          emoji: 'calendar',
          type: 'LECTURE',
          description: null,
          shortDescription: 'Resumo',
          locationDescription: 'Sala 1',
          majorEventId: 'major-1',
          majorEvent: {
            name: 'Grande evento',
            deletedAt: null,
          },
          eventGroupId: 'group-1',
          eventGroup: {
            name: 'Grupo removido',
            deletedAt: new Date('2026-06-01T00:00:00.000Z'),
            shouldIssueCertificate: true,
            shouldIssueCertificateForEachEvent: true,
          },
          startDate: new Date('2026-06-22T12:00:00.000Z'),
          endDate: new Date('2026-06-22T13:00:00.000Z'),
          shouldIssueCertificate: true,
          publiclyVisible: true,
        },
      ],
      majorEvent: [
        {
          id: 'major-1',
          name: 'Grande evento',
          description: 'Descricao',
          startDate: new Date('2026-06-20T12:00:00.000Z'),
          endDate: new Date('2026-06-25T12:00:00.000Z'),
        },
      ],
      eventGroup: [{ id: 'group-1', name: 'Grupo' }],
      people: [
        {
          id: 'person-1',
          name: 'Ana',
          email: 'ana@example.com',
          secondaryEmails: ['ana@unesp.br', ''],
          phone: null,
          identityDocument: '123',
          academicId: null,
          userId: 'user-1',
        },
      ],
      placePreset: [{ id: 'place-1', name: 'Sala 1', locationDescription: 'Bloco A' }],
      certificateTemplate: [
        {
          id: 'template-1',
          name: 'Certificado',
          description: null,
          version: 2,
          isActive: true,
        },
      ],
    });
    const { client, service } = createEnabledService(prisma);
    client.collection.exists.mockResolvedValue(false);

    await service.onModuleInit();

    expect(client.rootCollections.create).toHaveBeenCalledTimes(14);
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_events' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_major_events' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_event_groups' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_people' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_place_presets' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_certificate_templates' }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cacic_event_manager_audit_logs' }),
    );
    expect(client.collection.delete).toHaveBeenCalledTimes(7);
    expect(client.documents.import).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'event-1',
          majorEventName: 'Grande evento',
          eventGroupName: undefined,
          startDate: Math.floor(new Date('2026-06-22T12:00:00.000Z').getTime() / 1000),
          publiclyVisible: true,
          isIssuableCertificateEvent: false,
        }),
      ],
      { action: 'upsert' },
    );
    expect(client.documents.import).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'person-1',
          secondaryEmails: ['ana@unesp.br'],
          phone: undefined,
          academicId: undefined,
        }),
      ],
      { action: 'upsert' },
    );
  });

  it('updates existing collections when schema fields are missing', async () => {
    const { client, service } = createEnabledService();
    client.collection.exists.mockResolvedValue(true);
    client.collection.retrieve.mockResolvedValue({ fields: [] });

    await service['ensureCollections']();

    expect(client.collection.update).toHaveBeenCalledWith({
      fields: expect.arrayContaining([expect.objectContaining({ name: 'name' })]),
    });
    expect(client.collection.update).not.toHaveBeenCalledWith({
      fields: expect.arrayContaining([expect.objectContaining({ name: 'id' })]),
    });
  });

  it('reindexes audit logs in bounded batches', async () => {
    const prisma = createPrismaMock();
    const firstBatch = Array.from({ length: 500 }, (_, index) => createAuditLogEntry({ id: `audit-${index + 1}` }));
    const secondBatch = [createAuditLogEntry({ id: 'audit-501' })];
    prisma.auditLogEntry.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch);
    const { client, service } = createEnabledService(prisma);

    await service['replaceAuditLogDocuments']({
      name: 'cacic_event_manager_audit_logs',
      fields: [],
    });

    expect(prisma.auditLogEntry.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        select: expect.objectContaining({ id: true, before: true, metadata: true }),
        take: 500,
      }),
    );
    expect(prisma.auditLogEntry.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'audit-500' },
        skip: 1,
        take: 500,
      }),
    );
    expect(client.documents.import).toHaveBeenCalledTimes(2);
    expect(client.documents.import).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'audit-501' })]),
      { action: 'upsert' },
    );
  });
});

function createEnabledService(prisma = createPrismaMock()) {
  const client = createTypesenseClientMock();
  typesenseClientConstructor.mockReturnValue(client.instance);
  process.env.TYPESENSE_ENABLED = 'true';
  process.env.TYPESENSE_URL = 'http://search.example.com:8108';
  process.env.TYPESENSE_API_KEY = 'secret';

  const service = new TypesenseSearchService(prisma as never);

  return {
    client,
    service,
  };
}

function createTypesenseClientMock() {
  const documents = {
    delete: jest.fn().mockResolvedValue(undefined),
    import: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue({ hits: [] }),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const document = {
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const collection = {
    documents: jest.fn((id?: string) => (id ? document : documents)),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(true),
    retrieve: jest.fn().mockResolvedValue({ fields: [] }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const rootCollections = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const instance = {
    collections: jest.fn((name?: string) => (name ? collection : rootCollections)),
  };

  return {
    collection,
    document,
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
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue(records.majorEvent ?? []),
    },
    eventGroup: {
      findFirst: jest.fn(),
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

function createAuditLogEntry(overrides: Record<string, unknown> = {}) {
  const recordedAt = new Date('2026-06-25T12:00:00.000Z');

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
    before: { name: 'Ana' },
    after: { name: 'Ana Silva' },
    changes: [{ field: 'name', label: 'Nome', before: 'Ana', after: 'Ana Silva' }],
    changedFields: ['name'],
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
    metadata: { source: 'spec' },
    ...overrides,
  };
}
