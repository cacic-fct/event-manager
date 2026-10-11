import { RESPONSE_INIT, Service, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationCancel, NavigationCancellationCode, NavigationEnd, NavigationError, RedirectCommand, Router, UrlTree } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type PageErrorStatus = 403 | 404 | 500 | 503;

export interface RouteErrorOptions {
  status?: PageErrorStatus;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionUrl?: string;
  /** A normal link for leaving the app, for example the public frontend at /app/. */
  actionHref?: string;
  /** Curated, non-sensitive diagnostics. Never pass a raw API response here. */
  technicalDetails?: string;
  /** Keep the requested browser address so refresh re-evaluates access. Defaults to true. */
  preserveUrl?: boolean;
}

export const PAGE_ERROR_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** Only pages/guards opt into this service; action-level HTTP errors stay local. */
@Service()
export class RouteErrorService {
  private readonly router = inject(Router);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly location = inject(Location, { optional: true });
  private pending: { status: PageErrorStatus; options: RouteErrorOptions } | null = null;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd || event instanceof NavigationError ||
        (event instanceof NavigationCancel && event.code !== NavigationCancellationCode.Redirect)) {
        this.pending = null;
      }
    });
  }

  redirect(status: PageErrorStatus, options: RouteErrorOptions = {}): UrlTree {
    this.pending = { status, options };
    return this.router.parseUrl(`/error/${status}`);
  }

  guardRedirect(status: PageErrorStatus, options: RouteErrorOptions = {}): RedirectCommand {
    return new RedirectCommand(this.redirect(status, options), {
      ...(options.preserveUrl === false ? {} : { browserUrl: this.requestedUrl() }),
    });
  }

  navigate(status: PageErrorStatus, options: RouteErrorOptions = {}): Promise<boolean> {
    return this.router.navigateByUrl(this.redirect(status, options), {
      ...(options.preserveUrl === false ? {} : { browserUrl: this.requestedUrl() }),
      replaceUrl: true,
    });
  }

  private requestedUrl(): string {
    const navigation = this.router.currentNavigation();
    const target = navigation?.extractedUrl ?? navigation?.initialUrl;
    return target ? this.router.serializeUrl(target) : (this.location?.path(true) || this.router.url);
  }

  take(status: PageErrorStatus): RouteErrorOptions {
    const options = this.pending?.status === status ? this.pending.options : {};
    this.pending = null;
    return options;
  }

  setResponseStatus(status: PageErrorStatus): void {
    if (!this.response) return;
    this.response.status = status;
    const headers = new Headers(this.response.headers);
    for (const [name, value] of Object.entries(PAGE_ERROR_HEADERS)) headers.set(name, value);
    this.response.headers = headers;
  }
}
