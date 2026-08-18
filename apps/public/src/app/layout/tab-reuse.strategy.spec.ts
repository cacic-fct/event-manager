import { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';
import { AppRouteReuseStrategy } from './tab-reuse.strategy';

describe('AppRouteReuseStrategy', () => {
  let strategy: AppRouteReuseStrategy;

  beforeEach(() => {
    strategy = new AppRouteReuseStrategy();
  });

  it('detaches, stores, and retrieves reusable tab routes by path from root', () => {
    const route = routeSnapshot(['tabs', 'calendar'], true);
    const handle = { componentRef: 'calendar' } as unknown as DetachedRouteHandle;

    expect(strategy.shouldDetach(route)).toBe(true);
    expect(strategy.shouldAttach(route)).toBe(false);

    strategy.store(route, handle);

    expect(strategy.shouldAttach(route)).toBe(true);
    expect(strategy.retrieve(route)).toBe(handle);
    expect(strategy.shouldAttach(route)).toBe(false);
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

  it('destroys detached component handles when the strategy is destroyed', () => {
    const destroy = vi.fn();
    const route = routeSnapshot(['tabs', 'calendar'], true);
    const handle = { componentRef: { destroy } } as unknown as DetachedRouteHandle;

    strategy.store(route, handle);
    strategy.ngOnDestroy();

    expect(destroy).toHaveBeenCalledOnce();
    expect(strategy.shouldAttach(route)).toBe(false);
  });

  it('does not destroy a handle again when it is detached after being reattached', () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const route = routeSnapshot(['tabs', 'calendar'], true);
    const firstHandle = { componentRef: { destroy: firstDestroy } } as unknown as DetachedRouteHandle;
    const secondHandle = { componentRef: { destroy: secondDestroy } } as unknown as DetachedRouteHandle;

    strategy.store(route, firstHandle);
    expect(strategy.retrieve(route)).toBe(firstHandle);
    strategy.store(route, secondHandle);
    strategy.ngOnDestroy();

    expect(firstDestroy).not.toHaveBeenCalled();
    expect(secondDestroy).toHaveBeenCalledOnce();
  });
});

function routeSnapshot(
  paths: string[],
  reuseTab: boolean,
  routeConfig: unknown = { path: paths.at(-1) },
): ActivatedRouteSnapshot {
  const snapshots = paths.map((path) => ({ routeConfig: { path } }));
  return {
    data: { reuseTab },
    routeConfig,
    pathFromRoot: snapshots,
  } as unknown as ActivatedRouteSnapshot;
}
