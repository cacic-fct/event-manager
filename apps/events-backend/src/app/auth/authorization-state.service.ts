import { Injectable, Logger } from '@nestjs/common';

type AuthorizationState = {
  redirectUri?: string;
  returnTo?: string;
  state?: string;
};

@Injectable()
export class AuthorizationStateService {
  private readonly logger = new Logger(AuthorizationStateService.name);
  private readonly defaultPostLoginRedirectUri =
    process.env.KEYCLOAK_POST_LOGIN_REDIRECT_URI ?? 'http://localhost:4200';
  private readonly allowedPostLoginRedirectOrigins = this.readAllowedPostLoginRedirectOrigins();

  build(options?: { redirectUri?: string; returnTo?: string; state?: string }): string | undefined {
    const returnTo = this.normalizePostLoginReturnTo(options?.returnTo);
    if (!options?.redirectUri && !returnTo && !options?.state) {
      return undefined;
    }

    return Buffer.from(
      JSON.stringify({
        ...(options?.redirectUri ? { redirectUri: options.redirectUri } : {}),
        ...(returnTo ? { returnTo } : {}),
        ...(options?.state ? { state: options.state } : {}),
      }),
      'utf8',
    ).toString('base64url');
  }

  getPostLoginRedirectUri(state?: string): string {
    const returnTo = this.readReturnToFromState(state);
    return returnTo ?? this.defaultPostLoginRedirectUri;
  }

  getAuthorizationRedirectUri(state?: string): string | undefined {
    const decodedState = this.readAuthorizationState(state);
    if (!decodedState) {
      return undefined;
    }

    return this.readStringClaim(decodedState, 'redirectUri');
  }

  private readReturnToFromState(state?: string): string | undefined {
    const decodedState = this.readAuthorizationState(state);
    if (!decodedState) {
      return undefined;
    }

    const returnTo = this.readStringClaim(decodedState, 'returnTo');
    return this.normalizePostLoginReturnTo(returnTo);
  }

  private readAuthorizationState(state?: string): AuthorizationState | undefined {
    if (!state) {
      return undefined;
    }

    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));

      if (!this.isRecord(decodedState)) {
        return undefined;
      }

      return decodedState as AuthorizationState;
    } catch {
      return undefined;
    }
  }

  private normalizePostLoginReturnTo(returnTo?: string): string | undefined {
    const normalizedReturnTo = returnTo?.trim();
    if (!normalizedReturnTo) {
      return undefined;
    }

    if (normalizedReturnTo.startsWith('//')) {
      return undefined;
    }

    if (normalizedReturnTo.startsWith('/')) {
      return this.isAllowedAppPath(normalizedReturnTo) ? normalizedReturnTo : undefined;
    }

    try {
      const returnToUrl = new URL(normalizedReturnTo);
      return this.allowedPostLoginRedirectOrigins.has(returnToUrl.origin) && this.isAllowedAppPath(returnToUrl.pathname)
        ? returnToUrl.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private isAllowedAppPath(pathname: string): boolean {
    return pathname === '/app' || pathname === '/admin'
      ? true
      : pathname.startsWith('/app/') || pathname.startsWith('/admin/');
  }

  private readAllowedPostLoginRedirectOrigins(): Set<string> {
    const origins = new Set<string>();
    this.addUrlOrigin(origins, this.defaultPostLoginRedirectUri);

    for (const origin of (process.env.KEYCLOAK_ALLOWED_POST_LOGIN_REDIRECT_ORIGINS ?? '').split(',')) {
      this.addUrlOrigin(origins, origin.trim());
    }

    return origins;
  }

  private addUrlOrigin(origins: Set<string>, rawUrl?: string): void {
    if (!rawUrl) {
      return;
    }

    try {
      origins.add(new URL(rawUrl).origin);
    } catch {
      this.logger.warn(`Ignoring invalid Keycloak post-login redirect origin: ${rawUrl}`);
    }
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
    const value = claims[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
