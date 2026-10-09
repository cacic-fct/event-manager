import type { UrlMatcher, UrlSegment } from '@angular/router';
import { adminSportsWorkspaceRoute } from '@cacic-fct/shared-utils';

export const SPORTS_WORKSPACE_AREAS = ['categories', 'teams', 'matches', 'reviews'] as const;

export type SportsWorkspaceArea = 'overview' | (typeof SPORTS_WORKSPACE_AREAS)[number];

export interface SportsWorkspaceRouteState {
  majorEventId: string | null;
  area: SportsWorkspaceArea;
  categoryId: string | null;
  teamId: string | null;
  matchId: string | null;
}

export interface LegacySportsWorkspaceRouteState {
  tournamentId: string;
  area: SportsWorkspaceArea;
  categoryId: string | null;
  teamId: string | null;
  matchId: string | null;
}

interface RouteParamReader {
  get(name: string): string | null;
}

export const sportsWorkspaceMatcher: UrlMatcher = (segments) => matchSportsWorkspaceSegments(segments);

export function matchSportsWorkspaceSegments(segments: UrlSegment[]) {
  if (segments.length === 1 && segments[0]?.path === 'sports') {
    return { consumed: segments, posParams: {} };
  }

  if (segments[0]?.path !== 'sports') {
    return null;
  }

  if (segments[1]?.path === 'major-event') {
    if (segments.length < 3 || segments.length > 6) return null;
    const majorEventId = segments[2];
    if (!majorEventId) return null;
    const area = segments[3];
    const entityId = segments[4];
    const matchId = segments[5];
    const posParams: Record<string, UrlSegment> = { majorEventId };
    if (area) posParams['area'] = area;
    if (entityId) posParams[area?.path === 'matches' ? 'categoryId' : 'entityId'] = entityId;
    if (matchId) posParams['matchId'] = matchId;
    return { consumed: segments, posParams };
  }

  if (segments.length < 2 || segments.length > 5) return null;
  const tournamentId = segments[1];
  if (!tournamentId) return null;
  const area = segments[2];
  const entityId = segments[3];
  const matchId = segments[4];
  const posParams: Record<string, UrlSegment> = { legacyTournamentId: tournamentId };
  if (area) {
    posParams['area'] = area;
  }
  if (entityId) {
    posParams[area?.path === 'matches' ? 'categoryId' : 'entityId'] = entityId;
  }
  if (matchId) {
    posParams['matchId'] = matchId;
  }

  return { consumed: segments, posParams };
}

export function parseLegacySportsWorkspaceRoute(params: RouteParamReader): LegacySportsWorkspaceRouteState | null {
  const tournamentId = params.get('legacyTournamentId');
  if (!tournamentId) return null;
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

export function parseSportsWorkspaceRoute(params: RouteParamReader): SportsWorkspaceRouteState {
  const majorEventId = params.get('majorEventId');
  const areaParam = params.get('area');
  const area = isSportsWorkspaceArea(areaParam) ? areaParam : 'overview';
  const entityId = params.get('entityId') ?? params.get('categoryId');

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

export function legacySportsWorkspaceRoute(
  params: RouteParamReader,
  majorEventId: string,
): string[] | null {
  const route = parseLegacySportsWorkspaceRoute(params);
  return route
    ? sportsWorkspaceRoute(majorEventId, route.area, {
        categoryId: route.categoryId ?? undefined,
        teamId: route.teamId ?? undefined,
        matchId: route.matchId ?? undefined,
      })
    : null;
}
