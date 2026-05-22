import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, isDevMode, signal } from '@angular/core';
import { Observable, catchError, finalize, firstValueFrom, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthOnlineStatusService } from './auth-online-status.service';
import { AuthenticatedUser, AuthRefreshResult } from './auth.types';
import type { LoginOptions } from './auth.types';
import { AUTH_ONBOARDING_ENFORCEMENT_ENABLED } from './auth-onboarding-enforcement.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accountLoginUrl = 'https://account.cacic.dev.br/api/auth/login';
  private readonly onboardingReturnStorageKey = 'cacic-eventos:onboarding-return-url';
  private readonly onboardingRefreshAttemptStorageKey = 'cacic-eventos:onboarding-refresh-attempted';
  private readonly silentSsoAttemptStorageKey = 'cacic-eventos:silent-sso-attempted';

  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly onlineStatus = inject(AuthOnlineStatusService);
  private readonly isOnboardingEnforcementEnabled = inject(AUTH_ONBOARDING_ENFORCEMENT_ENABLED);

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

    try {
      await this.refreshMe();

      if (!this.isAuthenticated() && this.onlineStatus.isOnline() && !isDevMode()) {
        this.loginWithExistingSsoSession();
      }
    } catch (error) {
      this.logUnexpectedAuthError('Auth initialization failed', error);
      this.clearSession();
    }
  }

  async login(options?: LoginOptions): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    window.location.assign(this.buildLoginRedirectUrl(options));
  }

  loginWithExistingSsoSession(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.getSessionStorageItem(this.silentSsoAttemptStorageKey)) {
      return;
    }

    this.setSessionStorageItem(this.silentSsoAttemptStorageKey, 'true');

    window.location.assign(
      this.buildLoginRedirectUrl({
        prompt: 'none',
      }),
    );
  }

  async logout(): Promise<void> {
    this.clearRefreshTimer();

    if (isPlatformBrowser(this.platformId)) {
      try {
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
      } catch (error) {
        this.logUnexpectedAuthError('Logout failed', error);
      }
    }

    this.clearSession();
  }

  async refreshMe(): Promise<void> {
    if (await this.loadCurrentUser()) {
      await this.redirectToOnboardingIfNeeded();
      return;
    }

    try {
      await firstValueFrom(this.refreshTokenSilently());
      await this.redirectToOnboardingIfNeeded();
    } catch (error) {
      this.logUnexpectedAuthError('Silent token refresh failed', error);
      this.clearSession();
    }
  }

  refreshTokenSilently(): Observable<AuthRefreshResult> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    this.refreshRequest$ = this.http.post<AuthRefreshResult>('/api/auth/refresh', {}).pipe(
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
      const user = await firstValueFrom(this.http.get<AuthenticatedUser | null>('/api/auth/me'));

      this.user.set(user);

      if (user) {
        this.removeSessionStorageItem(this.silentSsoAttemptStorageKey);
      }

      this.scheduleRefreshFromUser(user);

      return Boolean(user);
    } catch (error) {
      this.user.set(null);

      if (this.isHttpError(error)) {
        this.logUnexpectedAuthError('Failed to load current user', error);
        return false;
      }

      this.logUnexpectedAuthError('Unexpected error while loading user', error);
      return false;
    }
  }

  private async redirectToOnboardingIfNeeded(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const user = this.user();

    if (!user || !this.isOnboardingEnforcementEnabled() || this.isUserOnboarded(user)) {
      this.removeSessionStorageItem(this.onboardingReturnStorageKey);
      this.removeSessionStorageItem(this.onboardingRefreshAttemptStorageKey);
      return;
    }

    const currentUrl = this.getCurrentAbsoluteUrl();
    const pendingReturnUrl = this.getSessionStorageItem(this.onboardingReturnStorageKey);
    const refreshAttempted = this.getSessionStorageItem(this.onboardingRefreshAttemptStorageKey);

    if (pendingReturnUrl === currentUrl && !refreshAttempted) {
      this.setSessionStorageItem(this.onboardingRefreshAttemptStorageKey, 'true');

      try {
        await firstValueFrom(this.refreshTokenSilently());
      } catch (error) {
        this.logUnexpectedAuthError('Silent token refresh before onboarding failed', error);
        this.clearSession();
        return;
      }

      if (this.isUserOnboarded(this.user())) {
        this.removeSessionStorageItem(this.onboardingReturnStorageKey);
        this.removeSessionStorageItem(this.onboardingRefreshAttemptStorageKey);
        return;
      }
    }

    this.setSessionStorageItem(this.onboardingReturnStorageKey, currentUrl);
    window.location.assign(this.buildAccountOnboardingRedirectUrl(currentUrl));
  }

  private isUserOnboarded(user: AuthenticatedUser | null): boolean {
    if (!user) {
      return true;
    }

    const claimValue = user.claims?.['is_onboarded'];
    return claimValue === true || claimValue === 'true';
  }

  private scheduleRefresh(expiresAt: number): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.clearRefreshTimer();

    const refreshDelayMs = Math.max(expiresAt - Date.now() - 60_000, 5_000);

    this.refreshTimerId = setTimeout(() => {
      this.refreshTokenSilently().subscribe({
        error: (error) => {
          this.logUnexpectedAuthError('Scheduled token refresh failed', error);
          this.clearSession();
        },
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
      const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');

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

  private getCurrentAbsoluteUrl(): string {
    const { href } = window.location;
    return href;
  }

  private buildAccountOnboardingRedirectUrl(returnTo: string): string {
    const url = new URL(this.accountLoginUrl);
    url.searchParams.set('ru', returnTo);
    return url.toString();
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  private isHttpError(error: unknown): error is HttpErrorResponse {
    return error instanceof HttpErrorResponse;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getSessionStorageItem(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private setSessionStorageItem(key: string, value: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      return;
    }
  }

  private removeSessionStorageItem(key: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      return;
    }
  }

  private logUnexpectedAuthError(message: string, error: unknown): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.isHttpError(error)) {
      console.warn(message, {
        status: error.status,
        statusText: error.statusText,
        url: error.url,
        message: error.message,
      });
      return;
    }

    console.warn(message, error);
  }
}
