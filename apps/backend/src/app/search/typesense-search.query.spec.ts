import { searchTypesenseDocumentIds, searchTypesensePagedDocumentIds } from './typesense-search.query';

describe('typesense query helpers', () => {
  it('returns unavailable when the client is missing or the query is blank without match-all', async () => {
    const logger = { error: jest.fn() };

    await expect(
      searchTypesenseDocumentIds({
        client: null,
        logger: logger as never,
        collectionName: 'events',
        query: 'aula',
        queryBy: 'name',
        options: 10,
      }),
    ).resolves.toEqual({ available: false, ids: [] });
    await expect(
      searchTypesensePagedDocumentIds({
        client: createClientMock().instance as never,
        logger: logger as never,
        collectionName: 'events',
        query: '   ',
        queryBy: 'name',
        options: 10,
        allowMatchAll: false,
      }),
    ).resolves.toEqual({ available: false, ids: [], found: 0 });
  });

  it('searches with filters, sorting, match-all, totals, and chunked offsets', async () => {
    const client = createClientMock();
    client.documents.search
      .mockResolvedValueOnce({
        found: 300,
        hits: Array.from({ length: 250 }, (_, index) => ({ document: { id: `audit-${index}` } })),
      })
      .mockResolvedValueOnce({
        found: 300,
        hits: [{ document: { id: 'audit-250' } }, { document: { id: '' } }],
      });

    await expect(
      searchTypesensePagedDocumentIds({
        client: client.instance as never,
        logger: { error: jest.fn() } as never,
        collectionName: 'audit_logs',
        query: '',
        queryBy: 'actorName',
        options: {
          filterBy: 'reverted:=false',
          limit: 251,
          offset: 50,
          sortBy: 'lastRecordedAt:desc',
        },
        allowMatchAll: true,
      }),
    ).resolves.toEqual({
      available: true,
      found: 300,
      ids: [...Array.from({ length: 250 }, (_, index) => `audit-${index}`), 'audit-250'],
    });
    expect(client.documents.search).toHaveBeenNthCalledWith(1, {
      q: '*',
      query_by: 'actorName',
      per_page: 250,
      limit_hits: 301,
      offset: 50,
      filter_by: 'reverted:=false',
      sort_by: 'lastRecordedAt:desc',
    });
    expect(client.documents.search).toHaveBeenNthCalledWith(2, {
      q: '*',
      query_by: 'actorName',
      per_page: 1,
      limit_hits: 301,
      offset: 300,
      filter_by: 'reverted:=false',
      sort_by: 'lastRecordedAt:desc',
    });
  });

  it('logs and returns unavailable when Typesense fails', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    client.documents.search.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      searchTypesenseDocumentIds({
        client: client.instance as never,
        logger: logger as never,
        collectionName: 'events',
        query: 'aula',
        queryBy: 'name',
        options: 10,
      }),
    ).resolves.toEqual({ available: false, ids: [] });
    expect(logger.error).toHaveBeenCalledWith(
      'Typesense search failed for collection events.',
      expect.any(Error),
    );
  });

  it('falls back when the requested offset exhausts the Typesense result window', async () => {
    const client = createClientMock();

    await expect(
      searchTypesensePagedDocumentIds({
        client: client.instance as never,
        logger: { error: jest.fn() } as never,
        collectionName: 'audit_logs',
        query: '',
        queryBy: 'actorName',
        options: { limit: 25, offset: 10_000 },
        allowMatchAll: true,
      }),
    ).resolves.toEqual({ available: false, ids: [], found: 0 });
    expect(client.documents.search).not.toHaveBeenCalled();
  });

  it('surfaces Typesense request validation errors instead of treating them as downtime', async () => {
    const client = createClientMock();
    const logger = { error: jest.fn() };
    const error = Object.assign(new Error('bad request'), { httpStatus: 400 });
    client.documents.search.mockRejectedValueOnce(error);

    await expect(
      searchTypesensePagedDocumentIds({
        client: client.instance as never,
        logger: logger as never,
        collectionName: 'audit_logs',
        query: '',
        queryBy: 'actorName',
        options: { limit: 10 },
        allowMatchAll: true,
      }),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      'Typesense search request is invalid for collection audit_logs.',
      error,
    );
  });
});

function createClientMock() {
  const documents = {
    search: jest.fn().mockResolvedValue({ hits: [] }),
  };
  const instance = {
    collections: jest.fn(() => ({
      documents: jest.fn(() => documents),
    })),
  };

  return {
    documents,
    instance,
  };
}
