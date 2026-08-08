import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, catchError, map, of, take } from 'rxjs';
import { DefaultRedirectApiService } from '../../landing/default-redirect-api.service';
import { sportsAutorouteUrl } from '../../landing/default-redirect.service';
import {
  INTERRUPTION_PRIORITY_ORDERS,
  type Interruption,
  type InterruptionContext,
  type InterruptionFlow,
} from '../../interruption/interruption-flow';

@Injectable({ providedIn: 'root' })
export class SportsAutorouteInterruptionFlow implements InterruptionFlow {
  private readonly api = inject(DefaultRedirectApiService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);

  resolve(context: InterruptionContext): Observable<Interruption | null> {
    if (!isPlatformBrowser(this.platformId) || !this.auth.isAuthenticated()) {
      return of(null);
    }

    return this.api.getCurrentUserSportsAutoroute().pipe(
      take(1),
      map((route) => {
        if (!route || route.mode === 'MATCH_DETAIL') {
          return null;
        }
        const targetUrl = sportsAutorouteUrl(route);
        if (!targetUrl || this.isAlreadyAtTarget(context.currentUrl, targetUrl)) {
          return null;
        }
        return {
          id: `sports-autoroute:${route.mode}:${route.matchId ?? route.teamId ?? 'current'}`,
          priority: 'NORMAL',
          priorityOrder: INTERRUPTION_PRIORITY_ORDERS.SPORTS_MATCH,
          target: this.router.parseUrl(targetUrl),
        } satisfies Interruption;
      }),
      catchError(() => of(null)),
    );
  }

  private isAlreadyAtTarget(currentUrl: string, targetUrl: string): boolean {
    const currentPath = currentUrl.split('?')[0];
    const targetPath = targetUrl.split('?')[0];
    return currentPath === targetPath;
  }
}
