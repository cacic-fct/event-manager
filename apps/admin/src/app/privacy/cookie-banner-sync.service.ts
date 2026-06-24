import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, catchError, map, of, tap } from 'rxjs';

const COOKIE_BANNER_ACCEPTED_STORAGE_KEY = 'cacic.cookieBanner.accepted';
const COOKIE_BANNER_SYNCED_STORAGE_PREFIX = 'cacic.cookieBanner.synced.';

@Injectable({ providedIn: 'root' })
export class CookieBannerSyncService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly syncingUserIds = new Set<string>();

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.sub;
      if (userId) {
        this.syncLocalAcceptanceForUser(userId);
      }
    });
  }

  acceptCookieBanner(syncedUserId = this.auth.user()?.sub): Observable<boolean> {
    return this.http.post<{ synced: boolean }>('/api/privacy/cookie-banner/accept', {}).pipe(
      tap((response) => {
        if (response.synced && syncedUserId) {
          this.markSynced(syncedUserId);
        }
      }),
      map((response) => response.synced),
      catchError(() => of(false)),
    );
  }

  private syncLocalAcceptanceForUser(userId: string): void {
    if (!this.isBrowser || this.syncingUserIds.has(userId) || !this.hasAcceptedLocally() || this.hasSynced(userId)) {
      return;
    }

    this.syncingUserIds.add(userId);
    this.acceptCookieBanner(userId).subscribe({
      next: () => this.syncingUserIds.delete(userId),
      error: () => this.syncingUserIds.delete(userId),
    });
  }

  private hasAcceptedLocally(): boolean {
    try {
      return window.localStorage.getItem(COOKIE_BANNER_ACCEPTED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private hasSynced(userId: string): boolean {
    try {
      return window.localStorage.getItem(this.syncedStorageKey(userId)) === 'true';
    } catch {
      return false;
    }
  }

  private markSynced(userId: string): void {
    try {
      window.localStorage.setItem(this.syncedStorageKey(userId), 'true');
    } catch {
      return;
    }
  }

  private syncedStorageKey(userId: string): string {
    return `${COOKIE_BANNER_SYNCED_STORAGE_PREFIX}${userId}`;
  }
}
