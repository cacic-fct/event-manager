import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

@Injectable()
export class AppRouteReuseStrategy implements RouteReuseStrategy, OnDestroy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return route.data['reuseTab'] === true;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!handle) return;

    const key = this.key(route);
    const previousHandle = this.handles.get(key);
    if (previousHandle && previousHandle !== handle) {
      this.destroyHandle(previousHandle);
    }

    this.handles.set(key, handle);
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return route.data['reuseTab'] === true && this.handles.has(this.key(route));
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.key(route);
    const handle = this.handles.get(key) ?? null;
    this.handles.delete(key);
    return handle;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === current.routeConfig;
  }

  ngOnDestroy(): void {
    for (const handle of this.handles.values()) {
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
}
