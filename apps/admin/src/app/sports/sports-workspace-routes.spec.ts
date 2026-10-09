import { UrlSegment, convertToParamMap } from '@angular/router';
import { canReadFeatureGuard } from '../app-shell/access.guard';
import { routes } from '../app-shell/admin-shell.routes';
import {
  legacySportsWorkspaceRoute,
  parseLegacySportsWorkspaceRoute,
  parseSportsWorkspaceRoute,
  matchSportsWorkspaceSegments,
  sportsWorkspaceMatcher,
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
  it('keeps sports routes behind the sports read permission guard', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    const sportsRoute = children.find((route) => route.matcher === sportsWorkspaceMatcher);
    expect(sportsRoute?.canMatch).toContain(canReadFeatureGuard);
  });

  it('matches global, scoped, and legacy tournament deep-link shapes', () => {
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
    expect(matchWorkspaceUrl('/sports/tournament-1')).toEqual({
      consumed: ['sports', 'tournament-1'],
      params: { legacyTournamentId: 'tournament-1' },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1/categories/category-1')).toEqual({
      consumed: ['sports', 'tournament-1', 'categories', 'category-1'],
      params: { legacyTournamentId: 'tournament-1', area: 'categories', entityId: 'category-1' },
    });
    expect(matchWorkspaceUrl('/sports/tournament-1/matches/category-1/match-1')).toEqual({
      consumed: ['sports', 'tournament-1', 'matches', 'category-1', 'match-1'],
      params: {
        legacyTournamentId: 'tournament-1',
        area: 'matches',
        categoryId: 'category-1',
        matchId: 'match-1',
      },
    });
    expect(matchWorkspaceUrl('/sports/major-event')).toBeNull();
    expect(matchWorkspaceUrl('/sports/major-event/major-1/matches/category-1/match-1/extra')).toBeNull();
  });

  it('maps legacy tournament match links to major-event-scoped URLs', () => {
    const legacy = convertToParamMap({
      legacyTournamentId: 'tournament-1',
      area: 'matches',
      categoryId: 'category-1',
      matchId: 'match-1',
    });
    expect(parseLegacySportsWorkspaceRoute(legacy)).toEqual({
      tournamentId: 'tournament-1',
      area: 'matches',
      categoryId: 'category-1',
      teamId: null,
      matchId: 'match-1',
    });
    expect(legacySportsWorkspaceRoute(legacy, 'major-1')).toEqual([
      '/sports', 'major-event', 'major-1', 'matches', 'category-1', 'match-1',
    ]);
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
