import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { filter } from 'rxjs';
import { DefaultRedirectService } from './default-redirect.service';

const TAB_ROUTES = new Set(['/calendar', '/major-event', '/notifications', '/menu']);

@Injectable({ providedIn: 'root' })
export class DefaultRedirectOnTabEntryService {
  private readonly auth = inject(AuthService);
  private readonly defaultRedirect = inject(DefaultRedirectService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private hasHandledInitialNavigation = false;

  start(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      if (this.hasHandledInitialNavigation) {
        return;
      }
      this.hasHandledInitialNavigation = true;

      const initialPath = event.urlAfterRedirects.split(/[?#]/, 1)[0];
      if (!this.auth.isAuthenticated() || !TAB_ROUTES.has(initialPath)) {
        return;
      }

      void this.redirect(initialPath);
    });
  }

  private async redirect(initialPath: string): Promise<void> {
    const route = await this.defaultRedirect.resolve();
    if (route !== initialPath) {
      await this.router.navigateByUrl(route);
    }
  }
}
