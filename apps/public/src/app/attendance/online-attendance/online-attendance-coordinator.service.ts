import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subscription, catchError, of, take } from 'rxjs';
import { RealtimeEventsService } from '../../shared/realtime-events.service';
import { OnlineAttendanceApiService } from './online-attendance-api.service';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';

@Injectable({ providedIn: 'root' })
export class OnlineAttendanceCoordinatorService {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly realtime = inject(RealtimeEventsService);
  private readonly router = inject(Router);

  private realtimeSubscription: Subscription | null = null;
  private interruptedCurrentPageLoad = false;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.connect();
        this.maybeInterrupt();
        return;
      }

      this.disconnect();
    });
  }

  start(): void {
    if (this.auth.isAuthenticated()) {
      this.connect();
      this.maybeInterrupt();
    }
  }

  navigateToPending(returnUrl = this.currentUrl(), interrupt = false): void {
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

        if (interrupt) {
          this.interruptedCurrentPageLoad = true;
        }

        const target = items.length === 1 ? ['/attendance/register', items[0].eventId] : ['/attendance/register'];

        void this.router.navigate(target, {
          queryParams: {
            returnUrl,
          },
        });
      });
  }

  private maybeInterrupt(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.interruptedCurrentPageLoad) {
      return;
    }

    if (this.router.url.startsWith('/attendance/register')) {
      return;
    }

    this.navigateToPending(this.currentUrl(), true);
  }

  private connect(): void {
    if (!isPlatformBrowser(this.platformId) || this.realtimeSubscription) {
      return;
    }

    this.realtimeSubscription = this.realtime.watch().subscribe((message) => {
      const payload = message.payload as { eventIds?: string[] } | undefined;
      if (
        message.type === 'event' &&
        message.channel === ONLINE_ATTENDANCE_CHANNEL &&
        message.event === 'pendingOnlineAttendancesChanged' &&
        payload?.eventIds?.length
      ) {
        this.maybeInterrupt();
      }
    });
  }

  private disconnect(): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = null;
  }

  private currentUrl(): string {
    return this.router.url || '/menu';
  }
}
