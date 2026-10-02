import {
  adminEventWorkspacePath,
  adminEventWorkspaceRoute,
  adminEventWorkspaceCreationPath,
  adminEventWorkspaceCreationRoute,
  adminSportsWorkspacePath,
  adminSportsWorkspaceRoute,
} from './admin-route-links';

describe('admin route links', () => {
  it('returns raw Angular commands and encoded event workspace paths from one target', () => {
    const target = { kind: 'event', id: 'event / 1', section: 'settings' as const };

    expect(adminEventWorkspaceRoute(target)).toEqual(['/event-workspace', 'event', 'event / 1', 'settings']);
    expect(adminEventWorkspacePath(target)).toBe('/event-workspace/event/event%20%2F%201/settings');
  });

  it('builds encoded sports paths while keeping router commands unencoded', () => {
    const target = {
      majorEventId: 'major / 1',
      area: 'matches' as const,
      categoryId: 'category / 1',
      matchId: 'match / 1',
    };

    expect(adminSportsWorkspaceRoute(target)).toEqual([
      '/sports',
      'major-event',
      'major / 1',
      'matches',
      'category / 1',
      'match / 1',
    ]);
    expect(adminSportsWorkspacePath(target)).toBe(
      '/sports/major-event/major%20%2F%201/matches/category%20%2F%201/match%20%2F%201',
    );
  });

  it('builds canonical creation commands and paths', () => {
    expect(adminEventWorkspaceCreationRoute('major-event')).toEqual([
      '/event-workspace',
      'new',
      'major-event',
    ]);
    expect(adminEventWorkspaceCreationPath('major-event')).toBe('/event-workspace/new/major-event');
  });

  it('keeps overview links at the scoped sports root', () => {
    expect(adminSportsWorkspaceRoute({ majorEventId: 'major-1', area: 'overview' })).toEqual([
      '/sports',
      'major-event',
      'major-1',
    ]);
  });
});
