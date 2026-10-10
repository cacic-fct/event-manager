import { convertToParamMap } from '@angular/router';
import { canReadFeatureGuard } from '../app-shell/access.guard';
import { routes } from '../app-shell/admin-shell.routes';
import {
  parseSportsWorkspaceRoute,
  sportsWorkspaceRoutePaths,
  sportsWorkspaceRoute,
} from './sports-workspace-routes';

describe('sports workspace routes', () => {
  it('keeps sports routes behind the sports read permission guard', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];
    const sportsRoutes = children.filter((route) => route.path === 'sports' || route.path?.startsWith('sports/'));
    expect(sportsRoutes.map((route) => route.path)).toEqual(sportsWorkspaceRoutePaths);
    expect(sportsRoutes.every((route) => route.canMatch?.includes(canReadFeatureGuard))).toBe(true);
  });

  it('declares major-event-scoped deep-link shapes as concrete routes', () => {
    expect(sportsWorkspaceRoutePaths).toEqual([
      'sports',
      'sports/major-event/:majorEventId',
      'sports/major-event/:majorEventId/:area',
      'sports/major-event/:majorEventId/:area/:entityId',
      'sports/major-event/:majorEventId/:area/:entityId/:matchId',
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
          entityId: 'category-1',
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
