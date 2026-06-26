import {
  TYPESENSE_COLLECTIONS,
  createTypesenseCollectionSchema,
  createTypesenseCollectionSchemas,
  findMissingTypesenseFields,
} from './typesense-search.collections';

describe('typesense collection helpers', () => {
  it('builds prefixed schemas for every search collection', () => {
    const schemas = createTypesenseCollectionSchemas();

    expect(Object.values(TYPESENSE_COLLECTIONS)).toEqual(
      expect.arrayContaining(schemas.map((schema) => schema.name)),
    );
    expect(TYPESENSE_COLLECTIONS.events).toBe('cacic_event_manager_events');
    expect(schemas.find((schema) => schema.name === TYPESENSE_COLLECTIONS.events)?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'publiclyVisible', facet: true }),
        expect.objectContaining({ name: 'publicationState', facet: true }),
        expect.objectContaining({ name: 'isIssuableCertificateEvent', facet: true }),
      ]),
    );
    expect(schemas.find((schema) => schema.name === TYPESENSE_COLLECTIONS.auditLogs)?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', sort: true }),
        expect.objectContaining({ name: 'operation', facet: true }),
        expect.objectContaining({ name: 'lastRecordedAt', sort: true }),
        expect.objectContaining({ name: 'reverted', facet: true }),
      ]),
    );
  });

  it('finds fields absent from an existing collection without trying to add id', () => {
    const schema = createTypesenseCollectionSchema('collection', [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'status', type: 'string', facet: true },
    ]);

    expect(
      findMissingTypesenseFields(schema, {
        name: 'collection',
        fields: [{ name: 'name', type: 'string' }],
      }),
    ).toEqual([{ name: 'status', type: 'string', facet: true }]);
  });
});
