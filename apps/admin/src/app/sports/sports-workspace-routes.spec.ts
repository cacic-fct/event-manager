import { UrlSegment, convertToParamMap } from '@angular/router';
import {
  parseSportsWorkspaceRoute,
  matchSportsWorkspaceSegments,
  sportsWorkspaceRoute,
} from './sports-workspace-routes';

function matchWorkspaceUrl(url: string) {
  const result = matchSportsWorkspaceSegments(
    url
      .split('/')
      .filter(Boolean)
      .map((segment) => new UrlSegment(segment, {})),
  );
  return (
    result && {
      consumed: result.consumed.map((segment) => segment.path),
      params: Object.fromEntries(Object.entries(result.posParams ?? {}).map(([key, segment]) => [key, segment.path])),
    }
  );
}

describe('sports workspace routes', () => {
  it('matches global and major-event-scoped deep-link shapes', () => {
    expect(matchWorkspaceUrl('/sports')).toEqual({ consumed: ['sports'], params: {} });
    expect(matchWorkspaceUrl('/sports/major-event/major-1')).toEqual({
      consumed: ['sports', 'major-event', 'major-1'],
      params: { majorEventId: 'major-1' },
    });
    expect(matchWorkspaceUrl('/sports/major-event/major-1/categories/category-1')).toEqual({
      consumed: ['sports', 'major-event', 'major-1', 'categories', 'category-1'],
      params: { majorEventId: 'major-1', area: 'categories', entityId: 'category-1' },
    });
    expect(matchWorkspaceUrl('/sports/major-event/major-1/matches/category-1/match-1')).toEqual({
      consumed: ['sports', 'major-event', 'major-1', 'matches', 'category-1', 'match-1'],
      params: {
        majorEventId: 'major-1',
        area: 'matches',
        categoryId: 'category-1',
        matchId: 'match-1',
      },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1')).toBeNull();
    expect(matchWorkspaceUrl('/sports/tournament-1/matches/category-1/match-1')).toBeNull();
    expect(matchWorkspaceUrl('/sports/major-event/major-1/matches/category-1/match-1/extra')).toBeNull();
  });

  it('parses the overview and each deep-linked detail shape', () => {
    expect(parseSportsWorkspaceRoute(convertToParamMap({}))).toEqual({
      majorEventId: null,
      area: 'overview',
      categoryId: null,
      teamId: null,
      matchId: null,
    });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({ majorEventId: 'major-1', area: 'categories', entityId: 'category-1' }),
      ),
    ).toMatchObject({ majorEventId: 'major-1', area: 'categories', categoryId: 'category-1' });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({
          majorEventId: 'major-1',
          area: 'matches',
          categoryId: 'category-1',
          matchId: 'match-1',
        }),
      ),
    ).toEqual({
      majorEventId: 'major-1',
      area: 'matches',
      categoryId: 'category-1',
      teamId: null,
      matchId: 'match-1',
    });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({ majorEventId: 'major-1', area: 'reviews', entityId: 'team-1' }),
      ),
    ).toMatchObject({ area: 'reviews', teamId: 'team-1' });
  });

  it('builds stable list, entity, and match URLs', () => {
    expect(sportsWorkspaceRoute(null, 'overview')).toEqual(['/sports']);
    expect(sportsWorkspaceRoute('major-1', 'overview')).toEqual(['/sports', 'major-event', 'major-1']);
    expect(sportsWorkspaceRoute('major-1', 'categories')).toEqual([
      '/sports',
      'major-event',
      'major-1',
      'categories',
    ]);
    expect(sportsWorkspaceRoute('major-1', 'teams', { teamId: 'team-1' })).toEqual([
      '/sports',
      'major-event',
      'major-1',
      'teams',
      'team-1',
    ]);
    expect(sportsWorkspaceRoute('major-1', 'matches', { categoryId: 'category-1', matchId: 'match-1' })).toEqual([
      '/sports',
      'major-event',
      'major-1',
      'matches',
      'category-1',
      'match-1',
    ]);
  });
});
