import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, catchError, filter, map, of, take } from 'rxjs';
import {
  INTERRUPTION_PRIORITY_ORDERS,
  Interruption,
  InterruptionContext,
  InterruptionFlow,
} from '../../interruption/interruption-flow';
import { RealtimeEventsService } from '../../shared/realtime-events.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './api.service';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';

@Injectable({ providedIn: 'root' })
export class OnlineAttendanceCoordinatorService implements InterruptionFlow {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly realtime = inject(RealtimeEventsService);
  private readonly router = inject(Router);
  private dismissedEventIds = new Set<string>();

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.dismissedEventIds.clear();
      }
    });
  }

  navigateToPending(returnUrl = this.currentUrl()): void {
    this.clearDismissedEventIds();
    this.api
      .listPendingEvents()
      .pipe(
        take(1),
        catchError(() => of([])),
      )
      .subscribe((items) => {
        if (items.length === 0) {
          return;
        }

        const target = items.length === 1 ? ['/attendance/register', items[0].eventId] : ['/attendance/register'];

        void this.router.navigate(target, {
          queryParams: {
            returnUrl,
          },
        });
      });
  }

  dismissPending(eventIds: readonly string[], returnUrl = this.currentUrl()): void {
    if (eventIds.length > 0) {
      this.dismissEventIds(eventIds);
      void this.router.navigateByUrl(returnUrl);
      return;
    }

    this.api
      .listPendingEvents()
      .pipe(
        take(1),
        catchError(() => of([])),
      )
      .subscribe((items) => {
        this.dismissEventIds(items.map(({ eventId }) => eventId));
        void this.router.navigateByUrl(returnUrl);
      });
  }

  resolve(context: InterruptionContext): Observable<Interruption | null> {
    if (!isPlatformBrowser(this.platformId) || !this.auth.isAuthenticated() || this.isAttendancePage(context.currentUrl)) {
      return of(null);
    }

    return this.api.listPendingEvents().pipe(
      take(1),
      map((items) => {
        this.removeResolvedEventIds(items);
        if (items.length === 0) {
          return null;
        }

        if (items.every(({ eventId }) => this.dismissedEventIds.has(eventId))) {
          return null;
        }

        const target =
          items.length === 1
            ? this.router.createUrlTree(['/attendance/register', items[0].eventId], {
                queryParams: { returnUrl: context.currentUrl },
              })
            : this.router.createUrlTree(['/attendance/register'], {
                queryParams: { returnUrl: context.currentUrl },
              });
        return {
          id: 'online-attendance',
          priority: 'NORMAL',
          priorityOrder: INTERRUPTION_PRIORITY_ORDERS.ONLINE_ATTENDANCE,
          target,
        } satisfies Interruption;
      }),
      catchError(() => of(null)),
    );
  }

  changes(): Observable<void> {
    return this.realtime.watch().pipe(
      filter((message) => {
        const payload = message.payload as { eventIds?: string[] } | undefined;
        return Boolean(
          message.type === 'event' &&
            message.channel === ONLINE_ATTENDANCE_CHANNEL &&
            message.event === 'pendingOnlineAttendancesChanged' &&
            payload?.eventIds?.length,
        );
      }),
      map(() => undefined),
    );
  }

  private isAttendancePage(url: string): boolean {
    return url.startsWith('/attendance/register');
  }

  private currentUrl(): string {
    return this.router.url || '/menu';
  }

  private dismissEventIds(eventIds: readonly string[]): void {
    for (const eventId of eventIds) {
      this.dismissedEventIds.add(eventId);
    }
  }

  private removeResolvedEventIds(items: readonly PendingOnlineAttendanceEvent[]): void {
    const pendingEventIds = new Set(items.map(({ eventId }) => eventId));
    const dismissedEventIds = new Set([...this.dismissedEventIds].filter((eventId) => pendingEventIds.has(eventId)));
    if (dismissedEventIds.size === this.dismissedEventIds.size) {
      return;
    }

    this.dismissedEventIds = dismissedEventIds;
  }

  private clearDismissedEventIds(): void {
    if (this.dismissedEventIds.size === 0) {
      return;
    }

    this.dismissedEventIds.clear();
  }
}
