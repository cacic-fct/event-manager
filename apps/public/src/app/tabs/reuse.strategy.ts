import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

@Injectable()
export class AppRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return route.data['reuseTab'] === true;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!handle) return;

    this.handles.set(this.key(route), handle);
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return route.data['reuseTab'] === true && this.handles.has(this.key(route));
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.handles.get(this.key(route)) ?? null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === current.routeConfig;
  }

  private key(route: ActivatedRouteSnapshot): string {
    return route.pathFromRoot
      .map((r) => r.routeConfig?.path)
      .filter(Boolean)
      .join('/');
  }
}
