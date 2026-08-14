export const SPORTS_WORKSPACE_AREAS = ['categories', 'teams', 'matches', 'reviews'] as const;

export type SportsWorkspaceArea = 'overview' | (typeof SPORTS_WORKSPACE_AREAS)[number];

export interface SportsWorkspaceRouteState {
  tournamentId: string | null;
  area: SportsWorkspaceArea;
  categoryId: string | null;
  teamId: string | null;
  matchId: string | null;
}

interface RouteParamReader {
  get(name: string): string | null;
}

export function parseSportsWorkspaceRoute(params: RouteParamReader): SportsWorkspaceRouteState {
  const tournamentId = params.get('tournamentId');
  const areaParam = params.get('area');
  const area = isSportsWorkspaceArea(areaParam) ? areaParam : 'overview';
  const entityId = params.get('entityId') ?? params.get('categoryId');

  return {
    tournamentId,
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
  tournamentId: string,
  area: SportsWorkspaceArea,
  selection: { categoryId?: string; teamId?: string; matchId?: string } = {},
): string[] {
  if (area === 'overview') {
    return ['/sports', tournamentId];
  }

  const route = ['/sports', tournamentId, area];
  if (area === 'categories' && selection.categoryId) {
    route.push(selection.categoryId);
  } else if (area === 'teams' && selection.teamId) {
    route.push(selection.teamId);
  } else if (area === 'matches') {
    if (selection.categoryId) {
      route.push(selection.categoryId);
      if (selection.matchId) {
        route.push(selection.matchId);
      }
    }
  } else if (area === 'reviews' && selection.teamId) {
    route.push(selection.teamId);
  }

  return route;
}
