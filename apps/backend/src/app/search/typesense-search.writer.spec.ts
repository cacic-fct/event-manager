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

  it('leaves structurally drifted collections for rebuild instead of applying incremental updates', async () => {
    const client = createClientMock();
    client.collection.retrieve.mockResolvedValueOnce({
      fields: [{ name: 'status', type: 'string', facet: false }],
    });

    await ensureTypesenseCollection(client.instance as never, {
      name: 'events',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'status', type: 'string', facet: true },
      ],
    });

    expect(client.collection.update).not.toHaveBeenCalled();
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

  it('does not swap the alias when a bulk import row fails', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.documents.import.mockResolvedValueOnce([{ success: false, error: 'Invalid field type.', code: 400 }]);

    await replaceTypesenseCollectionDocuments({
      client: client.instance as never,
      logger: logger as never,
      schema: { name: 'events', fields: [{ name: 'id', type: 'string' }] },
      documents: [{ id: 'event-1', name: 'Aula' }],
    });

    expect(client.aliasesRoot.upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to replace Typesense documents for events.',
      expect.objectContaining({
        message: 'Failed to import Typesense documents into events: Invalid field type.',
      }),
    );
  });

  it('preserves the new active collection when old collection cleanup fails after alias swap', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.collection.delete.mockRejectedValueOnce(new Error('delete failed'));

    await replaceTypesenseCollectionDocuments({
      client: client.instance as never,
      logger: logger as never,
      schema: { name: 'events', fields: [{ name: 'id', type: 'string' }] },
      documents: [{ id: 'event-1', name: 'Aula' }],
    });

    const temporaryCollectionName = client.rootCollections.create.mock.calls[0]?.[0]?.name;
    expect(client.aliasesRoot.upsert).toHaveBeenCalledWith('events', {
      collection_name: temporaryCollectionName,
    });
    expect(client.instance.collections.mock.calls.filter(([name]) => name === temporaryCollectionName)).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to replace Typesense documents for events.', expect.any(Error));
  });

  it('restores a direct public collection when alias migration fails after conflict cleanup', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.alias.retrieve.mockRejectedValueOnce({ httpStatus: 404 });
    client.collection.retrieve.mockResolvedValue({
      name: 'events',
      fields: [{ name: 'id', type: 'string' }],
    });
    client.aliasesRoot.upsert.mockRejectedValueOnce({ httpStatus: 409 }).mockRejectedValueOnce(new Error('alias down'));

    await replaceTypesenseCollectionDocuments({
      client: client.instance as never,
      logger: logger as never,
      schema: { name: 'events', fields: [{ name: 'id', type: 'string' }] },
      documents: [{ id: 'event-1', name: 'Aula' }],
    });

    expect(client.aliasesRoot.upsert).toHaveBeenCalledTimes(2);
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^events_migration_backup_reindex_/),
      }),
    );
    expect(client.rootCollections.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'events',
        fields: [{ name: 'id', type: 'string' }],
      }),
    );
    expect(logger.error).toHaveBeenCalledWith('Failed to replace Typesense documents for events.', expect.any(Error));
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
    export: jest.fn().mockResolvedValue('{"id":"event-1"}\n'),
    import: jest.fn().mockResolvedValue([{ success: true }]),
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
