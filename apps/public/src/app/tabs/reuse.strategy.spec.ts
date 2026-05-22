import { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';
import { AppRouteReuseStrategy } from './reuse.strategy';

describe('AppRouteReuseStrategy', () => {
  const strategy = new AppRouteReuseStrategy();

  it('detaches, stores, and retrieves reusable tab routes by path from root', () => {
    const route = routeSnapshot(['tabs', 'calendar'], true);
    const handle = { componentRef: 'calendar' } as unknown as DetachedRouteHandle;

    expect(strategy.shouldDetach(route)).toBe(true);
    expect(strategy.shouldAttach(route)).toBe(false);

    strategy.store(route, handle);

    expect(strategy.shouldAttach(route)).toBe(true);
    expect(strategy.retrieve(route)).toBe(handle);
  });

  it('ignores non-reusable routes and null handles', () => {
    const route = routeSnapshot(['tabs', 'menu'], false);

    expect(strategy.shouldDetach(route)).toBe(false);
    strategy.store(route, null);

    expect(strategy.shouldAttach(route)).toBe(false);
    expect(strategy.retrieve(route)).toBeNull();
  });

  it('reuses routes only when their route config object is identical', () => {
    const current = routeSnapshot(['tabs', 'menu'], false);
    const future = routeSnapshot(['tabs', 'menu'], false, current.routeConfig);
    const different = routeSnapshot(['tabs', 'calendar'], false);

    expect(strategy.shouldReuseRoute(future, current)).toBe(true);
    expect(strategy.shouldReuseRoute(different, current)).toBe(false);
  });
});

function routeSnapshot(paths: string[], reuseTab: boolean, routeConfig: unknown = { path: paths.at(-1) }): ActivatedRouteSnapshot {
  const snapshots = paths.map((path) => ({ routeConfig: { path } }));
  return {
    data: { reuseTab },
    routeConfig,
    pathFromRoot: snapshots,
  } as unknown as ActivatedRouteSnapshot;
}
