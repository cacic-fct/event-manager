import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';

export type PublicMapAudienceFilter = 'ALL' | 'MINE';
export type PublicMapDateFilter = 'ALL' | 'TODAY';

export interface PublicMapFilters {
  audience: PublicMapAudienceFilter;
  date: PublicMapDateFilter;
}

export interface PublicMapData {
  events: PublicMapEvent[];
  currentUserEventIds: ReadonlySet<string>;
}

export const DEFAULT_PUBLIC_MAP_FILTERS: PublicMapFilters = {
  audience: 'ALL',
  date: 'ALL',
};
