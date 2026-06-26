import {
  deleteTypesenseDocument,
  ensureTypesenseCollection,
  ensureTypesenseCollections,
  replaceTypesenseCollectionDocuments,
  upsertTypesenseDocument,
} from './typesense-search.writer';

describe('typesense writer helpers', () => {
  it('creates missing collections and updates missing fields on existing collections', async () => {
    const client = createClientMock();
    client.collection.retrieve.mockRejectedValueOnce({ httpStatus: 404 }).mockResolvedValueOnce({
      fields: [{ name: 'name', type: 'string' }],
    });

    await ensureTypesenseCollection(client.instance as never, {
      name: 'events',
      fields: [{ name: 'id', type: 'string' }],
    });
    await ensureTypesenseCollection(client.instance as never, {
      name: 'events',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string', facet: true },
      ],
    });

    expect(client.rootCollections.create).toHaveBeenCalledWith({ name: 'events', fields: [{ name: 'id', type: 'string' }] });
    expect(client.collection.update).toHaveBeenCalledWith({
      fields: [{ name: 'status', type: 'string', facet: true }],
    });
  });

  it('ensures all configured collections', async () => {
    const client = createClientMock();

    await ensureTypesenseCollections(client.instance as never);

    expect(client.instance.collections).toHaveBeenCalledWith('cacic_event_manager_events');
    expect(client.instance.collections).toHaveBeenCalledWith('cacic_event_manager_audit_logs');
  });

  it('replaces, upserts, and deletes documents', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.alias.retrieve.mockRejectedValueOnce({ httpStatus: 404 });
    client.aliasesRoot.upsert.mockRejectedValueOnce({ httpStatus: 409 }).mockResolvedValueOnce({
      name: 'events',
      collection_name: 'events_reindex_test',
    });

    await replaceTypesenseCollectionDocuments({
      client: client.instance as never,
      logger: logger as never,
      schema: { name: 'events', fields: [{ name: 'id', type: 'string' }] },
      documents: [{ id: 'event-1', name: 'Aula' }],
    });
    await upsertTypesenseDocument({
      client: client.instance as never,
      logger: logger as never,
      collectionName: 'events',
      document: { id: 'event-2' },
    });
    await deleteTypesenseDocument({
      client: client.instance as never,
      logger: logger as never,
      collectionName: 'events',
      id: 'event-2',
    });

    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^events_reindex_/),
        fields: [{ name: 'id', type: 'string' }],
      }),
    );
    expect(client.aliasesRoot.upsert).toHaveBeenLastCalledWith('events', {
      collection_name: expect.stringMatching(/^events_reindex_/),
    });
    expect(client.collection.delete).toHaveBeenCalled();
    expect(client.documents.import).toHaveBeenCalledWith([{ id: 'event-1', name: 'Aula' }], { action: 'upsert' });
    expect(client.documents.upsert).toHaveBeenCalledWith({ id: 'event-2' });
    expect(client.document.delete).toHaveBeenCalled();
  });

  it('logs write failures instead of throwing', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.documents.upsert.mockRejectedValueOnce(new Error('boom'));

    await expect(
      upsertTypesenseDocument({
        client: client.instance as never,
        logger: logger as never,
        collectionName: 'events',
        document: { id: 'event-1' },
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to upsert Typesense document event-1 in events.',
      expect.any(Error),
    );
  });
});

function createClientMock() {
  const documents = {
    import: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const document = {
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const collection = {
    delete: jest.fn().mockResolvedValue(undefined),
    documents: jest.fn((id?: string) => (id ? document : documents)),
    retrieve: jest.fn().mockResolvedValue({ fields: [] }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const rootCollections = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const alias = {
    retrieve: jest.fn().mockResolvedValue({
      name: 'events',
      collection_name: 'events_previous',
    }),
  };
  const aliasesRoot = {
    upsert: jest.fn().mockResolvedValue({
      name: 'events',
      collection_name: 'events_reindex_test',
    }),
  };
  const instance = {
    collections: jest.fn((name?: string) => (name ? collection : rootCollections)),
    aliases: jest.fn((name?: string) => (name ? alias : aliasesRoot)),
  };

  return {
    alias,
    aliasesRoot,
    collection,
    document,
    documents,
    instance,
    rootCollections,
  };
}
