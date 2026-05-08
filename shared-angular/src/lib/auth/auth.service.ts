import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AuthenticatedUser, AuthRefreshResult } from './auth.types';
import type { LoginOptions } from './auth.types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly silentSsoAttemptStorageKey =
    'cacic-eventos:silent-sso-attempted';
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private refreshRequest$: Observable<AuthRefreshResult> | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;

  readonly user = signal<AuthenticatedUser | null>(null);
  readonly roles = computed(() => this.user()?.roles ?? []);
  readonly scopes = computed(() => this.user()?.scopes ?? []);
  readonly isAuthenticated = computed(() => Boolean(this.user()));

  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    await this.refreshMe();

    if (!this.isAuthenticated()) {
      this.loginWithExistingSsoSession();
    }
  }

  async login(options?: LoginOptions): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    window.location.assign(this.buildLoginRedirectUrl(options));
  }

  loginWithExistingSsoSession(): void {
    if (
      !isPlatformBrowser(this.platformId) ||
      window.sessionStorage.getItem(this.silentSsoAttemptStorageKey)
    ) {
      return;
    }

    window.sessionStorage.setItem(this.silentSsoAttemptStorageKey, 'true');
    window.location.assign(
      this.buildLoginRedirectUrl({
        prompt: 'none',
      }),
    );
  }

  async logout(): Promise<void> {
    this.clearRefreshTimer();

    if (isPlatformBrowser(this.platformId)) {
      const { logoutUrl } = await firstValueFrom(
        this.http.post<{ logoutUrl?: string }>('/api/auth/logout', {
          postLogoutRedirectUri: window.location.origin,
        }),
      );

      this.clearSession();
      if (logoutUrl) {
        window.location.assign(logoutUrl);
      }
      return;
    }

    this.clearSession();
  }

  async refreshMe(): Promise<void> {
    if (await this.loadCurrentUser()) {
      return;
    }

    try {
      await firstValueFrom(this.refreshTokenSilently());
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        this.clearSession();
        return;
      }

      throw error;
    }
  }

  refreshTokenSilently(): Observable<AuthRefreshResult> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    this.refreshRequest$ = this.http
      .post<AuthRefreshResult>('/api/auth/refresh', {})
      .pipe(
        tap(({ expiresAt }) => this.scheduleRefresh(expiresAt)),
        switchMap((result) =>
          this.http.get<AuthenticatedUser | null>('/api/auth/me').pipe(
            tap((user) => this.user.set(user)),
            tap((user) => this.scheduleRefreshFromUser(user)),
            map(() => result),
          ),
        ),
        catchError((error) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    return this.refreshRequest$;
  }

  evaluatePermissions(permissions: readonly string[]): Observable<string[]> {
    return this.http
      .post<{ permissions: string[] }>('/api/auth/permissions/evaluate', {
        permissions: [...new Set(permissions)],
      })
      .pipe(map((result) => result.permissions));
  }

  clearSession(): void {
    this.clearRefreshTimer();
    this.user.set(null);
  }

  private async loadCurrentUser(): Promise<boolean> {
    try {
      const user = await firstValueFrom(
        this.http.get<AuthenticatedUser | null>('/api/auth/me'),
      );
      this.user.set(user);
      if (user) {
        window.sessionStorage.removeItem(this.silentSsoAttemptStorageKey);
      }
      this.scheduleRefreshFromUser(user);
      return true;
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        return false;
      }

      throw error;
    }
  }

  private scheduleRefresh(expiresAt: number): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.clearRefreshTimer();

    const refreshDelayMs = Math.max(expiresAt - Date.now() - 60_000, 5_000);
    this.refreshTimerId = setTimeout(() => {
      this.refreshTokenSilently().subscribe({
        error: () => this.clearSession(),
      });
    }, refreshDelayMs);
  }

  private scheduleRefreshFromUser(user: AuthenticatedUser | null): void {
    if (!user?.token || !isPlatformBrowser(this.platformId)) {
      return;
    }

    const [, payload] = user.token.split('.');
    if (!payload) {
      return;
    }

    try {
      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = normalizedPayload.padEnd(
        Math.ceil(normalizedPayload.length / 4) * 4,
        '=',
      );
      const claims: unknown = JSON.parse(atob(paddedPayload));
      if (!this.isRecord(claims) || typeof claims['exp'] !== 'number') {
        return;
      }

      this.scheduleRefresh(claims['exp'] * 1000);
    } catch {
      return;
    }
  }

  private buildLoginRedirectUrl(options?: LoginOptions): string {
    const url = new URL('/api/auth/login/redirect', window.location.origin);
    const returnTo = options?.returnTo ?? this.getCurrentReturnPath();

    if (returnTo) {
      url.searchParams.set('returnTo', returnTo);
    }

    if (options?.prompt) {
      url.searchParams.set('prompt', options.prompt);
    }

    return `${url.pathname}${url.search}`;
  }

  private getCurrentReturnPath(): string {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search}${hash}`;
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  private isAuthenticationError(error: unknown): boolean {
    return (
      error instanceof HttpErrorResponse &&
      (error.status === 401 || error.status === 403)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
