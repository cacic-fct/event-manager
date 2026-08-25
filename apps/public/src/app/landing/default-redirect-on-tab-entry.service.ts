import { isPlatformBrowser, Location } from '@angular/common';
import { Service, PLATFORM_ID, inject } from '@angular/core';
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, catchError, defer, filter, from, map, of } from 'rxjs';
import { DefaultRedirectService } from './default-redirect.service';
import {
  INTERRUPTION_PRIORITY_ORDERS,
  Interruption,
  InterruptionContext,
  InterruptionFlow,
} from '../interruption/interruption-flow';

const TAB_ROUTES = new Set(['/calendar', '/major-event', '/notifications', '/menu']);
export const NO_REDIRECT_QUERY_PARAM = 'noredirect';
const URL_SERIALIZER = new DefaultUrlSerializer();

@Service()
export class DefaultRedirectOnTabEntryService implements InterruptionFlow {
  readonly isFallback = true;

  private readonly auth = inject(AuthService);
  private readonly defaultRedirect = inject(DefaultRedirectService);
  private readonly location = inject(Location);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private hasHandledInitialNavigation = false;
  private initialTabPath: string | null = null;
  private started = false;

  start(): void {
    if (this.started || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.started = true;

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (this.hasHandledInitialNavigation) {
          this.initialTabPath = null;
          return;
        }
        this.hasHandledInitialNavigation = true;

        const initialPath = event.urlAfterRedirects.split(/[?#]/, 1)[0];
        if (!TAB_ROUTES.has(initialPath)) {
          return;
        }

        const urlWithoutNoRedirect = this.removeNoRedirectQueryParam(event.urlAfterRedirects);
        if (urlWithoutNoRedirect) {
          this.location.replaceState(urlWithoutNoRedirect);
          return;
        }

        if (!this.auth.isAuthenticated()) {
          return;
        }

        this.initialTabPath = initialPath;
      });
  }

  resolve(context: InterruptionContext): Observable<Interruption | null> {
    const initialPath = this.initialTabPath;
    if (!initialPath || !this.auth.isAuthenticated() || this.pathFromUrl(context.currentUrl) !== initialPath) {
      return of(null);
    }

    return defer(() => from(this.defaultRedirect.resolve())).pipe(
      map((route) => {
        this.initialTabPath = null;
        if (route === initialPath) {
          return null;
        }

        return {
          id: `default-redirect:${initialPath}`,
          priority: 'NORMAL',
          priorityOrder: INTERRUPTION_PRIORITY_ORDERS.DEFAULT_REDIRECT,
          target: URL_SERIALIZER.parse(route),
        } satisfies Interruption;
      }),
      catchError(() => {
        this.initialTabPath = null;
        return of(null);
      }),
    );
  }

  private removeNoRedirectQueryParam(url: string): string | null {
    const urlTree = URL_SERIALIZER.parse(url);
    if (!Object.prototype.hasOwnProperty.call(urlTree.queryParams, NO_REDIRECT_QUERY_PARAM)) {
      return null;
    }

    delete urlTree.queryParams[NO_REDIRECT_QUERY_PARAM];
    return URL_SERIALIZER.serialize(urlTree);
  }

  private pathFromUrl(url: string): string {
    return url.split(/[?#]/, 1)[0];
  }
}
