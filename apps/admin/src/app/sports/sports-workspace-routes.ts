import { adminSportsWorkspaceRoute } from '@cacic-fct/shared-utils';

export const SPORTS_WORKSPACE_AREAS = ['categories', 'teams', 'matches', 'reviews'] as const;

export const sportsWorkspaceRoutePaths = [
  'sports',
  'sports/major-event/:majorEventId',
  'sports/major-event/:majorEventId/:area',
  'sports/major-event/:majorEventId/:area/:entityId',
  'sports/major-event/:majorEventId/:area/:entityId/:matchId',
] as const;

export type SportsWorkspaceArea = 'overview' | (typeof SPORTS_WORKSPACE_AREAS)[number];

export interface SportsWorkspaceRouteState {
  majorEventId: string | null;
  area: SportsWorkspaceArea;
  categoryId: string | null;
  teamId: string | null;
  matchId: string | null;
}

interface RouteParamReader {
  get(name: string): string | null;
}

export function parseSportsWorkspaceRoute(params: RouteParamReader): SportsWorkspaceRouteState {
  const majorEventId = params.get('majorEventId');
  const areaParam = params.get('area');
  const area = isSportsWorkspaceArea(areaParam) ? areaParam : 'overview';
  const entityId = params.get('entityId');

  return {
    majorEventId,
    area,
    categoryId: area === 'categories' || area === 'matches' ? entityId : null,
    teamId: area === 'teams' || area === 'reviews' ? entityId : null,
    matchId: area === 'matches' ? params.get('matchId') : null,
  };
}

export function isSportsWorkspaceArea(value: string | null): value is Exclude<SportsWorkspaceArea, 'overview'> {
  return value !== null && (SPORTS_WORKSPACE_AREAS as readonly string[]).includes(value);
}

export function sportsWorkspaceRoute(
  majorEventId: string | null,
  area: SportsWorkspaceArea,
  selection: { categoryId?: string; teamId?: string; matchId?: string } = {},
): string[] {
  if (!majorEventId) return ['/sports'];
  return adminSportsWorkspaceRoute({ majorEventId, area, ...selection });
}
