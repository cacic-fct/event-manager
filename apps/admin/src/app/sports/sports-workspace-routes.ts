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

interface RouteParamReader {
  get(name: string): string | null;
}

export const sportsWorkspaceMatcher: UrlMatcher = (segments) => matchSportsWorkspaceSegments(segments);

export function matchSportsWorkspaceSegments(segments: UrlSegment[]) {
  if (segments.length === 1 && segments[0]?.path === 'sports') {
    return { consumed: segments, posParams: {} };
  }

  if (segments.length < 3 || segments[0]?.path !== 'sports' || segments[1]?.path !== 'major-event' || segments.length > 6) {
    return null;
  }

  const majorEventId = segments[2];
  if (!majorEventId) {
    return null;
  }
  const area = segments[3];
  const entityId = segments[4];
  const matchId = segments[5];
  const posParams: Record<string, UrlSegment> = {};
  posParams['majorEventId'] = majorEventId;
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
