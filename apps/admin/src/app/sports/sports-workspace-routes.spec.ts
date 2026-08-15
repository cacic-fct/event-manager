import { Route, UrlSegment, UrlSegmentGroup, convertToParamMap } from '@angular/router';
import {
  parseSportsWorkspaceRoute,
  sportsWorkspaceMatcher,
  sportsWorkspaceRoute,
} from './sports-workspace-routes';

function matchWorkspaceUrl(url: string) {
  const result = sportsWorkspaceMatcher(
    url
      .split('/')
      .filter(Boolean)
      .map((segment) => new UrlSegment(segment, {})),
    new UrlSegmentGroup([], {}),
    {} as Route,
  );
  return result && {
    consumed: result.consumed.map((segment) => segment.path),
    params: Object.fromEntries(
      Object.entries(result.posParams ?? {}).map(([key, segment]) => [key, segment.path]),
    ),
  };
}

describe('sports workspace routes', () => {
  it('matches all deep-link shapes with one route configuration', () => {
    expect(matchWorkspaceUrl('/sports')).toEqual({ consumed: ['sports'], params: {} });
    expect(matchWorkspaceUrl('/sports/tournament-1')).toEqual({
      consumed: ['sports', 'tournament-1'],
      params: { tournamentId: 'tournament-1' },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1/categories/category-1')).toEqual({
      consumed: ['sports', 'tournament-1', 'categories', 'category-1'],
      params: { tournamentId: 'tournament-1', area: 'categories', entityId: 'category-1' },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1/matches/category-1/match-1')).toEqual({
      consumed: ['sports', 'tournament-1', 'matches', 'category-1', 'match-1'],
      params: {
        tournamentId: 'tournament-1',
        area: 'matches',
        categoryId: 'category-1',
        matchId: 'match-1',
      },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1/matches/category-1/match-1/extra')).toBeNull();
  });

  it('parses the overview and each deep-linked detail shape', () => {
    expect(parseSportsWorkspaceRoute(convertToParamMap({ tournamentId: 'tournament-1' }))).toEqual({
      tournamentId: 'tournament-1',
      area: 'overview',
      categoryId: null,
      teamId: null,
      matchId: null,
    });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({ tournamentId: 'tournament-1', area: 'categories', entityId: 'category-1' }),
      ),
    ).toMatchObject({ area: 'categories', categoryId: 'category-1' });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({ tournamentId: 'tournament-1', area: 'matches', categoryId: 'category-1', matchId: 'match-1' }),
      ),
    ).toEqual({
      tournamentId: 'tournament-1',
      area: 'matches',
      categoryId: 'category-1',
      teamId: null,
      matchId: 'match-1',
    });
    expect(
      parseSportsWorkspaceRoute(
        convertToParamMap({ tournamentId: 'tournament-1', area: 'reviews', entityId: 'team-1' }),
      ),
    ).toMatchObject({ area: 'reviews', teamId: 'team-1' });
  });

  it('builds stable list, entity, and match URLs', () => {
    expect(sportsWorkspaceRoute('tournament-1', 'overview')).toEqual(['/sports', 'tournament-1']);
    expect(sportsWorkspaceRoute('tournament-1', 'categories')).toEqual([
      '/sports',
      'tournament-1',
      'categories',
    ]);
    expect(sportsWorkspaceRoute('tournament-1', 'teams', { teamId: 'team-1' })).toEqual([
      '/sports',
      'tournament-1',
      'teams',
      'team-1',
    ]);
    expect(sportsWorkspaceRoute('tournament-1', 'matches', { categoryId: 'category-1', matchId: 'match-1' })).toEqual([
      '/sports',
      'tournament-1',
      'matches',
      'category-1',
      'match-1',
    ]);
  });
});
