import { convertToParamMap } from '@angular/router';
import {
  parseSportsWorkspaceRoute,
  sportsWorkspaceRoute,
} from './sports-workspace-routes';

describe('sports workspace routes', () => {
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
