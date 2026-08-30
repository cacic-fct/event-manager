import { PUBLIC_CATALOG_REALTIME_CHANNEL, createPublicCatalogInvalidation } from './public-catalog-invalidation';

describe('createPublicCatalogInvalidation', () => {
  it('creates opaque, non-deduplicating public invalidations without resource identifiers', () => {
    const first = createPublicCatalogInvalidation();
    const second = createPublicCatalogInvalidation();

    expect(first).toEqual({
      type: 'PUBLIC_CATALOG_INVALIDATED',
      revision: expect.any(String),
    });
    expect(second.revision).not.toBe(first.revision);
    expect(first).not.toHaveProperty('eventIds');
    expect(first).not.toHaveProperty('majorEventIds');
    expect(first).not.toHaveProperty('formId');
    expect(PUBLIC_CATALOG_REALTIME_CHANNEL).toBe('public-catalog-v2');
  });
});
