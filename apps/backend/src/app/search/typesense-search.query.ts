import type { Logger } from '@nestjs/common';
import type { SearchParams } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { TYPESENSE_MAX_PER_PAGE } from './typesense-search.collections';
import type { TypesensePagedSearchResult, TypesenseSearchOptions, TypesenseSearchResult } from './typesense-search.types';

const TYPESENSE_MAX_RESULT_WINDOW = 10_000;

export async function searchTypesenseDocumentIds<T extends { id: string }>(input: {
  client: TypesenseClient | null;
  logger: Logger;
  collectionName: string;
  query: string;
  queryBy: string;
  options: number | TypesenseSearchOptions;
}): Promise<TypesenseSearchResult> {
  const result = await searchTypesensePagedDocumentIds<T>({
    ...input,
    allowMatchAll: false,
  });
  return {
    available: result.available,
    ids: result.ids,
  };
}

export async function searchTypesensePagedDocumentIds<T extends { id: string }>(input: {
  client: TypesenseClient | null;
  logger: Logger;
  collectionName: string;
  query: string;
  queryBy: string;
  options: number | TypesenseSearchOptions;
  allowMatchAll: boolean;
}): Promise<TypesensePagedSearchResult> {
  const normalizedQuery = input.query.trim();
  if (!input.client || (!normalizedQuery && !input.allowMatchAll)) {
    return { available: false, ids: [], found: 0 };
  }

  const { filterBy, limit, offset, sortBy } = normalizeSearchOptions(input.options);
  if (limit === 0) {
    return { available: true, ids: [], found: 0 };
  }

  try {
    const ids: string[] = [];
    let found = 0;
    let nextOffset = offset;

    while (ids.length < limit) {
      const pageSize = Math.min(TYPESENSE_MAX_PER_PAGE, limit - ids.length);
      const searchParameters: SearchParams<T & Record<string, unknown>> = {
        q: normalizedQuery || '*',
        query_by: input.queryBy,
        per_page: pageSize,
        limit_hits: offset + limit,
      };

      if (nextOffset > 0) {
        searchParameters.offset = nextOffset;
      }
      if (filterBy) {
        searchParameters.filter_by = filterBy;
      }
      if (sortBy) {
        searchParameters.sort_by = sortBy;
      }

      const result = await input.client
        .collections<T & Record<string, unknown>>(input.collectionName)
        .documents()
        .search(searchParameters);
      if (ids.length === 0) {
        found = typeof result.found === 'number' ? result.found : 0;
      }
      const hits = result.hits ?? [];
      ids.push(...hits.map((hit) => hit.document.id).filter((id) => Boolean(id)));

      if (hits.length < pageSize) {
        break;
      }
      nextOffset += hits.length;
    }

    return {
      available: true,
      ids,
      found,
    };
  } catch (error) {
    if (isTypesenseConfigurationError(error)) {
      input.logger.error(`Typesense search request is invalid for collection ${input.collectionName}.`, error);
      throw error;
    }

    input.logger.error(`Typesense search failed for collection ${input.collectionName}.`, error);
    return { available: false, ids: [], found: 0 };
  }
}

function normalizeSearchOptions(options: number | TypesenseSearchOptions): Required<TypesenseSearchOptions> {
  if (typeof options === 'number') {
    const offset = 0;
    return {
      filterBy: '',
      limit: normalizeSearchLimit(options, offset),
      offset,
      sortBy: '',
    };
  }

  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  return {
    filterBy: options.filterBy?.trim() ?? '',
    limit: normalizeSearchLimit(options.limit ?? 50, offset),
    offset,
    sortBy: options.sortBy?.trim() ?? '',
  };
}

function normalizeSearchLimit(limit: number, offset: number): number {
  const windowRemaining = Math.max(0, TYPESENSE_MAX_RESULT_WINDOW - offset);
  return Math.min(windowRemaining, Math.max(0, Math.floor(limit)));
}

function isTypesenseConfigurationError(error: unknown): boolean {
  const httpStatus = readHttpStatus(error);
  return httpStatus === 400 || httpStatus === 401 || httpStatus === 403 || httpStatus === 422;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('httpStatus' in error)) {
    return undefined;
  }

  const httpStatus = (error as { httpStatus?: unknown }).httpStatus;
  return typeof httpStatus === 'number' ? httpStatus : undefined;
}
