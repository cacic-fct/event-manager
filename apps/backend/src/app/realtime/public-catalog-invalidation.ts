import { randomUUID } from 'node:crypto';

export const PUBLIC_CATALOG_REALTIME_CHANNEL = 'public-catalog-v2';

export interface PublicCatalogInvalidation {
  type: 'PUBLIC_CATALOG_INVALIDATED';
  revision: string;
}

export function createPublicCatalogInvalidation(): PublicCatalogInvalidation {
  return {
    type: 'PUBLIC_CATALOG_INVALIDATED',
    revision: randomUUID(),
  };
}
