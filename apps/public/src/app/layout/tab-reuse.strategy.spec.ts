import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, DetachedRouteHandle, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AppRouteReuseStrategy } from './tab-reuse.strategy';

describe('AppRouteReuseStrategy', () => {
  let strategy: AppRouteReuseStrategy;
  let router: { events: Subject<NavigationStart>; url: string };

  beforeEach(() => {
    router = {
      events: new Subject<NavigationStart>(),
      url: '/menu',
    };
    TestBed.configureTestingModule({
      providers: [AppRouteReuseStrategy, { provide: Router, useValue: router }],
    });
    strategy = TestBed.inject(AppRouteReuseStrategy);
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

  it('keeps certificate validation alive only for the linked event round trip', () => {
    const destroy = vi.fn();
    const route = routeSnapshot(['validate'], true, undefined, true);
    const handle = { componentRef: { destroy } } as unknown as DetachedRouteHandle;

    router.url = '/validate?certificateId=certificate-1';
    router.events.next(new NavigationStart(1, '/event/event-1?back=%2Fvalidate%3FcertificateId%3Dcertificate-1'));
    expect(strategy.shouldDetach(route)).toBe(true);
    strategy.store(route, handle);

    router.events.next(new NavigationStart(2, '/validate?certificateId=certificate-1'));
    expect(strategy.shouldAttach(route)).toBe(true);
    expect(strategy.retrieve(route)).toBe(handle);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('does not detach certificate validation when navigating anywhere other than an event', () => {
    const route = routeSnapshot(['validate'], true, undefined, true);

    router.events.next(new NavigationStart(1, '/menu'));

    expect(strategy.shouldDetach(route)).toBe(false);
  });

  it('destroys a detached certificate validation component when navigation leaves the event return flow', () => {
    const destroy = vi.fn();
    const route = routeSnapshot(['validate'], true, undefined, true);
    const handle = { componentRef: { destroy } } as unknown as DetachedRouteHandle;

    router.url = '/validate?certificateId=certificate-1';
    router.events.next(new NavigationStart(1, '/event/event-1'));
    strategy.store(route, handle);

    router.events.next(new NavigationStart(2, '/menu'));

    expect(destroy).toHaveBeenCalledOnce();
    expect(strategy.shouldAttach(route)).toBe(false);
  });
});

function routeSnapshot(
  paths: string[],
  reuseTab: boolean,
  routeConfig: unknown = { path: paths.at(-1) },
  reuseTabForEventNavigation = false,
): ActivatedRouteSnapshot {
  const snapshots = paths.map((path) => ({ routeConfig: { path } }));
  return {
    data: { reuseTab, reuseTabForEventNavigation },
    routeConfig,
    pathFromRoot: snapshots,
  } as unknown as ActivatedRouteSnapshot;
}
