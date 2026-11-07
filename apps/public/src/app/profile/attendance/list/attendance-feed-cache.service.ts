import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, Service, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { merge, of, retry, tap, throwError, timeout, timer } from 'rxjs';
import { RealtimeInvalidationService } from '../../../shared/realtime-invalidation.service';
import { AttendancesApiService } from '../attendances-api.service';

const ATTENDANCE_FEED_CACHE_TTL_MS = 2 * 60_000;
const ATTENDANCE_FEED_TIMEOUT_MS = 60_000;

@Service()
export class AttendanceFeedCacheService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly offlineData = inject(PublicDataAccessService);
  private readonly realtime = inject(RealtimeInvalidationService);
  private readonly cachedFeed = linkedSignal<string | null, { feed: SubscriptionsFeed; fetchedAt: number } | null>({
    source: () => this.auth.user()?.sub ?? null,
    computation: () => null,
  });
  private readonly version = signal(0);
  readonly revision = this.version.asReadonly();

  constructor() {
    merge(this.realtime.watchCurrentUserData(), this.realtime.watchCatalog())
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.cachedFeed.set(null);
        this.version.update((value) => value + 1);
      });
  }

  load(userId: string) {
    const cached = this.isBrowser && this.auth.user()?.sub === userId ? this.cachedFeed() : null;
    if (cached && Date.now() - cached.fetchedAt < ATTENDANCE_FEED_CACHE_TTL_MS) {
      return of(cached.feed);
    }

    const revision = this.revision();
    return this.api.getSubscriptionsFeed().pipe(
      retry({
        count: 1,
        delay: (error: unknown) =>
          error instanceof HttpErrorResponse && [0, 408, 502, 503, 504].includes(error.status)
            ? timer(1_000)
            : throwError(() => error),
      }),
      // Bound the entire load, including the retry, so stalled requests still offer manual recovery.
      timeout({ first: ATTENDANCE_FEED_TIMEOUT_MS }),
      tap((feed) => {
        if (this.auth.user()?.sub !== userId || this.revision() !== revision) {
          return;
        }
        if (this.isBrowser) {
          this.cachedFeed.set({ feed, fetchedAt: Date.now() });
        }
        // Cache the feed for offline use without delaying the online result.
        void this.offlineData.replaceAttendanceFeed(userId, feed).catch(() => undefined);
      }),
    );
  }
}
