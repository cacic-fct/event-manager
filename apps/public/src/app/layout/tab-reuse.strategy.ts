import { Service, OnDestroy } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, NavigationStart, RouteReuseStrategy, Router } from '@angular/router';
import { Subscription } from 'rxjs';

type StoredHandle = {
  handle: DetachedRouteHandle;
  restoreUrl: string | null;
};

@Service({ autoProvided: false })
export class AppRouteReuseStrategy implements RouteReuseStrategy, OnDestroy {
  private readonly handles = new Map<string, StoredHandle>();
  private navigationSourceUrl = '';
  private navigationTargetUrl = '';
  private navigationSubscription: Subscription | null = null;

  start(router: Pick<Router, 'events' | 'url'>): void {
    if (this.navigationSubscription) {
      return;
    }

    this.navigationSubscription = router.events.subscribe((event) => {
      if (!(event instanceof NavigationStart)) {
        return;
      }

      this.navigationSourceUrl = router.url;
      this.navigationTargetUrl = event.url;
      this.destroyHandlesThatCannotBeRestored(event.url);
    });
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    if (route.data['reuseTab'] !== true) {
      return false;
    }

    return !route.data['reuseTabForEventNavigation'] || this.isEventDetailUrl(this.navigationTargetUrl);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!handle) return;

    const key = this.key(route);
    const previousHandle = this.handles.get(key)?.handle;
    if (previousHandle && previousHandle !== handle) {
      this.destroyHandle(previousHandle);
    }

    this.handles.set(key, {
      handle,
      restoreUrl: route.data['reuseTabForEventNavigation'] === true ? this.navigationSourceUrl : null,
    });
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return route.data['reuseTab'] === true && this.handles.has(this.key(route));
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.key(route);
    const handle = this.handles.get(key)?.handle ?? null;
    this.handles.delete(key);
    return handle;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === current.routeConfig;
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();

    for (const { handle } of this.handles.values()) {
      this.destroyHandle(handle);
    }

    this.handles.clear();
  }

  private key(route: ActivatedRouteSnapshot): string {
    return route.pathFromRoot
      .map((r) => r.routeConfig?.path)
      .filter(Boolean)
      .join('/');
  }

  private destroyHandle(handle: DetachedRouteHandle): void {
    const componentRef = (handle as DetachedRouteHandle & { componentRef?: { destroy: () => void } }).componentRef;
    componentRef?.destroy();
  }

  private destroyHandlesThatCannotBeRestored(targetUrl: string): void {
    for (const [key, storedHandle] of this.handles) {
      if (storedHandle.restoreUrl !== null && storedHandle.restoreUrl !== targetUrl) {
        this.destroyHandle(storedHandle.handle);
        this.handles.delete(key);
      }
    }
  }

  private isEventDetailUrl(url: string): boolean {
    return url.split(/[?#]/, 1)[0].startsWith('/event/');
  }
}
