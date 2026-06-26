import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'node:crypto';
import { AuthSessionStoreService } from './auth-session-store.service';
import { DEFAULT_KEYCLOAK_CLIENT_ID, DEFAULT_KEYCLOAK_REALM_URL } from './auth.constants';
import { AuthorizationState, AuthorizationStateService } from './authorization-state.service';
import { LogoutDto } from './dto/logout.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import {
  decodeJwtPayload,
  extractRealmRoles,
  extractRoles,
  extractOidcScopes,
  isRecord,
  readNumberClaim,
  readStringClaim,
} from './keycloak-claims.utils';
import { AuthSession, CachedUser, TokenClaims, TokenResponse } from './keycloak-auth.types';
import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';
import { summarizeKeycloakFailure } from './keycloak-error-logging';

type MachineToMachinePrincipalOptions = {
  requiredRoles?: string[];
  audience?: string;
  allowedClients?: string[];
  resourceClientId?: string;
};

type AuthorizationRequirements = {
  roles?: readonly string[];
};

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);
  private readonly userCache = new Map<string, CachedUser>();
  private readonly keycloakFailureLogs = new Map<string, { loggedAt: number; suppressed: number }>();
  private readonly accessTokenRefreshSkewMs = 30_000;
  private readonly keycloakFailureLogSuppressionMs = 60_000;

  private readonly realmUrl = this.readEnv('KEYCLOAK_REALM_URL', DEFAULT_KEYCLOAK_REALM_URL).replace(/\/+$/, '');

  private readonly clientId = this.readEnv('KEYCLOAK_CLIENT_ID', DEFAULT_KEYCLOAK_CLIENT_ID);
  private readonly allowedAccessTokenClients = this.readAllowedAccessTokenClients();

  private readonly clientSecret = this.readOptionalEnv('KEYCLOAK_CLIENT_SECRET');
  private readonly defaultRedirectUri = this.readEnv('KEYCLOAK_REDIRECT_URI', 'http://localhost:3000/api/auth/callback');

  private readonly defaultPostLogoutRedirectUri = this.readOptionalEnv('KEYCLOAK_POST_LOGOUT_REDIRECT_URI');

  private readonly cacheTtlMs = this.parseCacheTtlMs(process.env.KEYCLOAK_INTROSPECTION_CACHE_TTL_MS);

  constructor(
    private readonly sessions: AuthSessionStoreService,
    private readonly authorizationState: AuthorizationStateService,
    private readonly userClaimSync?: AuthenticatedUserSyncService,
  ) {
    if (process.env.NODE_ENV === 'production' && !this.clientSecret) {
      throw new Error('KEYCLOAK_CLIENT_SECRET must be set for production authentication.');
    }
  }

  async authenticateAccessToken(
    accessToken: string,
    requirements: AuthorizationRequirements = {},
  ): Promise<AuthenticatedUser> {
    const principal = await this.getOrCreatePrincipal(accessToken);

    const requiredRoles = requirements.roles ?? [];
    this.assertClientRoles(principal, requiredRoles);

    return principal;
  }

  assertClientRoles(principal: AuthenticatedUser | undefined, requiredRoles: readonly string[]): void {
    if (!principal) {
      throw new UnauthorizedException('Missing authenticated principal.');
    }

    const missingRoles = requiredRoles.filter((role) => !principal.roleSet.has(role));

    if (missingRoles.length > 0) {
      throw new ForbiddenException(
        `Missing required client roles: ${missingRoles.join(', ')}. Granted client roles: ${
          principal.roles.join(', ') || '(none)'
        }.`,
      );
    }
  }

  async buildAuthorizationUrl(options?: {
    redirectUri?: string;
    returnTo?: string;
    state?: string;
    scope?: string;
    prompt?: string;
  }): Promise<{ authorizationUrl: string; state: string }> {
    const redirectUri = options?.redirectUri ?? this.defaultRedirectUri;
    const state = await this.authorizationState.create({
      redirectUri,
      returnTo: options?.returnTo,
      state: options?.state,
      prompt: options?.prompt,
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: options?.scope ?? 'openid profile email identity-document academic-profile',
      kc_idp_hint: 'google',
      state,
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    });

    const authorizationUrl = new URL(`${this.realmUrl}/protocol/openid-connect/auth?${params.toString()}`);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
    };
  }

  async exchangeCodeForTokens(
    code: string,
    state?: AuthorizationState,
    redirectUri?: string,
  ): Promise<Record<string, unknown>> {
    const exchangeRedirectUri =
      this.authorizationState.getAuthorizationRedirectUri(state) ?? redirectUri ?? this.defaultRedirectUri;
    const payload = new URLSearchParams();
    payload.set('grant_type', 'authorization_code');
    payload.set('client_id', this.clientId);
    payload.set('code', code);
    payload.set('redirect_uri', exchangeRedirectUri);

    if (this.clientSecret) {
      payload.set('client_secret', this.clientSecret);
    }

    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return data;
    } catch (error) {
      this.logKeycloakFailure(
        'authorization code token exchange',
        error,
        this.getTokenExchangeFailureContext(exchangeRedirectUri),
      );
      throw new UnauthorizedException('Could not exchange authorization code for tokens.');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
    const payload = new URLSearchParams();
    payload.set('grant_type', 'refresh_token');
    payload.set('client_id', this.clientId);
    payload.set('refresh_token', refreshToken);

    if (this.clientSecret) {
      payload.set('client_secret', this.clientSecret);
    }

    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return data;
    } catch (error) {
      this.logKeycloakFailure('refresh token exchange', error);
      throw new UnauthorizedException('Could not refresh access token.');
    }
  }

  async logout(input: LogoutDto): Promise<{
    refreshTokenRevoked: boolean;
    logoutUrl: string;
  }> {
    let refreshTokenRevoked = false;

    if (input.refreshToken && this.clientSecret) {
      const payload = new URLSearchParams();
      payload.set('client_id', this.clientId);
      payload.set('client_secret', this.clientSecret);
      payload.set('token', input.refreshToken);
      payload.set('token_type_hint', 'refresh_token');

      try {
        await axios.post(`${this.realmUrl}/protocol/openid-connect/revoke`, payload.toString(), {
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
        });
        refreshTokenRevoked = true;
      } catch (error) {
        this.logKeycloakFailure('refresh token revocation', error);
      }
    }

    const logoutUrl = new URL(`${this.realmUrl}/protocol/openid-connect/logout`);
    logoutUrl.searchParams.set('client_id', this.clientId);

    if (input.idTokenHint) {
      logoutUrl.searchParams.set('id_token_hint', input.idTokenHint);
    }

    const postLogoutRedirectUri = input.postLogoutRedirectUri ?? this.defaultPostLogoutRedirectUri;
    if (postLogoutRedirectUri) {
      logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
    }

    return {
      refreshTokenRevoked,
      logoutUrl: logoutUrl.toString(),
    };
  }

  async createSession(tokenResponse: Record<string, unknown>): Promise<{
    sessionId: string;
    expiresAt: number;
    sessionExpiresAt: number;
  }> {
    const tokens = tokenResponse as TokenResponse;
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      throw new UnauthorizedException('Missing access token in auth response.');
    }

    const accessTokenExpiresAt = this.resolveAccessTokenExpiration(tokens.access_token, tokens.expires_in);
    const sessionExpiresAt = this.resolveRefreshTokenExpiration(tokens, accessTokenExpiresAt);
    const sessionId = randomBytes(32).toString('base64url');

    await this.sessions.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
      idTokenHint: typeof tokens.id_token === 'string' ? tokens.id_token : undefined,
      accessTokenExpiresAt,
      sessionExpiresAt,
    });
    await this.syncLoginClaims(tokens.access_token);

    return {
      sessionId,
      expiresAt: accessTokenExpiresAt,
      sessionExpiresAt,
    };
  }

  updateSession(
    sessionId: string,
    tokenResponse: Record<string, unknown>,
  ): Promise<{ expiresAt: number; sessionExpiresAt: number }> {
    return this.updateStoredSessionFromTokenResponse(sessionId, tokenResponse);
  }

  async refreshSession(sessionId: string): Promise<{ expiresAt: number; sessionExpiresAt: number }> {
    const session = await this.sessions.get(sessionId);
    if (!session?.refreshToken) {
      throw new UnauthorizedException('Missing refresh token in session.');
    }

    const refreshedSession = await this.refreshStoredSession(sessionId, session.refreshToken);

    return {
      expiresAt: refreshedSession.accessTokenExpiresAt,
      sessionExpiresAt: refreshedSession.sessionExpiresAt,
    };
  }

  private async updateStoredSessionFromTokenResponse(
    sessionId: string,
    tokenResponse: Record<string, unknown>,
  ): Promise<{ expiresAt: number; sessionExpiresAt: number }> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    const tokens = tokenResponse as TokenResponse;
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      throw new UnauthorizedException('Missing access token in auth response.');
    }

    const accessTokenExpiresAt = this.resolveAccessTokenExpiration(tokens.access_token, tokens.expires_in);
    const sessionExpiresAt = this.resolveRefreshTokenExpiration(tokens, session.sessionExpiresAt);

    await this.sessions.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : session.refreshToken,
      idTokenHint: typeof tokens.id_token === 'string' ? tokens.id_token : session.idTokenHint,
      accessTokenExpiresAt,
      sessionExpiresAt,
    });

    return { expiresAt: accessTokenExpiresAt, sessionExpiresAt };
  }

  async authenticateSession(
    sessionId: string,
    requirements: AuthorizationRequirements = {},
  ): Promise<AuthenticatedUser> {
    let session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    if (this.shouldRefreshSessionAccessToken(session.accessTokenExpiresAt) && session.refreshToken) {
      session = await this.refreshStoredSession(sessionId, session.refreshToken);
    }

    try {
      return await this.authenticateAccessToken(session.accessToken, requirements);
    } catch (error) {
      if (!session.refreshToken || !(error instanceof UnauthorizedException)) {
        throw error;
      }

      const refreshedSession = await this.refreshStoredSession(sessionId, session.refreshToken);
      return this.authenticateAccessToken(refreshedSession.accessToken, requirements);
    }
  }

  assertMachineToMachinePrincipal(
    principal: AuthenticatedUser | undefined,
    options: MachineToMachinePrincipalOptions = {},
  ): AuthenticatedUser {
    if (!principal) {
      throw new UnauthorizedException('Missing authenticated M2M principal.');
    }

    const requireServiceAccount = process.env.KEYCLOAK_M2M_REQUIRE_SERVICE_ACCOUNT !== 'false';
    if (requireServiceAccount && !this.isServiceAccountPrincipal(principal)) {
      throw new ForbiddenException('A Keycloak service-account token is required.');
    }

    const audience = this.readRequiredM2mAudience(options.audience);
    if (!this.hasAudience(principal.claims['aud'], audience)) {
      throw new ForbiddenException(`Token audience must include ${audience}.`);
    }

    const allowedClients = this.readRequiredAllowedM2mClients(options.allowedClients);
    const clientId = this.readClientId(principal);
    if (!clientId || !allowedClients.has(clientId)) {
      throw new ForbiddenException('M2M client is not allowed.');
    }

    const requiredRoles = options.requiredRoles ?? [];
    const resourceClientId = options.resourceClientId?.trim() || audience;
    const missingRoles = requiredRoles.filter(
      (role) => !this.hasResourceClientRole(principal, resourceClientId, role),
    );
    if (missingRoles.length > 0) {
      throw new ForbiddenException(`Missing required M2M roles: ${missingRoles.join(', ')}.`);
    }

    return principal;
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.sessions.delete(sessionId);
  }

  async getSessionLogoutInput(sessionId: string): Promise<LogoutDto | null> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      refreshToken: session.refreshToken,
      idTokenHint: session.idTokenHint,
    };
  }

  private async refreshStoredSession(sessionId: string, refreshToken: string): Promise<AuthSession> {
    const lockOwner = randomBytes(16).toString('base64url');
    const hasLock = await this.sessions.acquireRefreshLock(sessionId, lockOwner);

    if (!hasLock) {
      await this.sessions.waitForRefreshLockRelease(sessionId);

      const session = await this.sessions.get(sessionId);
      if (!session) {
        throw new UnauthorizedException('Missing authenticated session.');
      }

      if (!this.shouldRefreshSessionAccessToken(session.accessTokenExpiresAt)) {
        return session;
      }

      return this.refreshStoredSessionAfterLockTimeout(sessionId, session.refreshToken ?? refreshToken);
    }

    try {
      const tokenResponse = await this.refreshAccessToken(refreshToken);
      await this.updateStoredSessionFromTokenResponse(sessionId, tokenResponse);
    } finally {
      await this.sessions.releaseRefreshLock(sessionId, lockOwner);
    }

    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return session;
  }

  private async refreshStoredSessionAfterLockTimeout(sessionId: string, refreshToken: string): Promise<AuthSession> {
    const lockOwner = randomBytes(16).toString('base64url');
    const hasLock = await this.sessions.acquireRefreshLock(sessionId, lockOwner);

    if (!hasLock) {
      await this.sessions.waitForRefreshLockRelease(sessionId);

      const session = await this.sessions.get(sessionId);
      if (!session) {
        throw new UnauthorizedException('Missing authenticated session.');
      }

      return session;
    }

    try {
      const tokenResponse = await this.refreshAccessToken(refreshToken);
      await this.updateStoredSessionFromTokenResponse(sessionId, tokenResponse);
    } finally {
      await this.sessions.releaseRefreshLock(sessionId, lockOwner);
    }

    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return session;
  }

  getPostLoginRedirectUri(state?: AuthorizationState): string {
    return this.authorizationState.getPostLoginRedirectUri(state);
  }

  consumeAuthorizationState(state?: string): Promise<AuthorizationState | undefined> {
    return this.authorizationState.consume(state);
  }

  private async getOrCreatePrincipal(accessToken: string): Promise<AuthenticatedUser> {
    const now = Date.now();
    const cachedUser = this.userCache.get(accessToken);
    if (cachedUser && cachedUser.expiresAt > now) {
      return cachedUser.user;
    }

    const keycloakClaims = await this.fetchTokenClaims(accessToken);
    const decodedClaims = decodeJwtPayload(accessToken);
    const introspectionJwtClaims = decodeJwtPayload(readStringClaim(keycloakClaims, 'jwt') ?? '');
    const mergedClaims: Record<string, unknown> = {
      ...decodedClaims,
      ...introspectionJwtClaims,
      ...keycloakClaims,
    };

    const roles = extractRoles(this.clientId, decodedClaims, introspectionJwtClaims, keycloakClaims);
    const roleSet = new Set(roles);
    const oidcScopes = extractOidcScopes(decodedClaims, introspectionJwtClaims, keycloakClaims);
    const oidcScopeSet = new Set(oidcScopes);

    const principal: AuthenticatedUser = {
      realm_access: {
        roles: extractRealmRoles(
          decodedClaims['realm_access'],
          introspectionJwtClaims['realm_access'],
          keycloakClaims['realm_access'],
        ),
      },
      sub: readStringClaim(mergedClaims, 'sub'),
      preferredUsername: readStringClaim(mergedClaims, 'preferred_username'),
      email: readStringClaim(mergedClaims, 'email'),
      token: accessToken,
      roles,
      roleSet,
      permissions: [],
      permissionSet: new Set(),
      oidcScopes,
      oidcScopeSet,
      scopes: oidcScopes,
      scopeSet: oidcScopeSet,
      claims: mergedClaims,
    };
    this.assertAccessTokenClientAllowed(principal);

    const expSeconds = readNumberClaim(mergedClaims, 'exp');
    const expBasedCache = expSeconds ? expSeconds * 1000 : now + this.cacheTtlMs;

    this.userCache.set(accessToken, {
      user: principal,
      expiresAt: Math.min(expBasedCache, now + this.cacheTtlMs),
    });

    return principal;
  }

  private async syncLoginClaims(accessToken: string): Promise<void> {
    const principal = await this.getOrCreatePrincipal(accessToken);
    await this.userClaimSync?.syncLoginClaims(principal);
  }

  private async fetchTokenClaims(accessToken: string): Promise<TokenClaims> {
    let introspectionClaims: TokenClaims | null = null;

    if (this.clientSecret) {
      const payload = new URLSearchParams();
      payload.set('token', accessToken);
      payload.set('token_type_hint', 'access_token');
      payload.set('client_id', this.clientId);
      payload.set('client_secret', this.clientSecret);

      try {
        const { data } = await axios.post<TokenClaims>(
          `${this.realmUrl}/protocol/openid-connect/token/introspect`,
          payload.toString(),
          {
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              accept: 'application/jwt, application/json',
            },
          },
        );

        if (data.active === false) {
          throw new UnauthorizedException('Token is not active.');
        }

        if (data.active === true) {
          introspectionClaims = data;
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }

        this.logKeycloakFailure('token introspection', error, 'Falling back to userinfo endpoint.');
      }
    }

    try {
      const { data } = await axios.get<TokenClaims>(`${this.realmUrl}/protocol/openid-connect/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (introspectionClaims) {
        return {
          ...introspectionClaims,
          ...data,
          active: true,
        };
      }

      return {
        ...data,
        active: true,
      };
    } catch (error) {
      if (introspectionClaims) {
        this.logKeycloakFailure('userinfo lookup', error, 'Using token introspection claims.');
        return introspectionClaims;
      }

      this.logKeycloakFailure('userinfo lookup', error);
      throw new UnauthorizedException('Unable to validate access token with Keycloak.');
    }
  }

  private logKeycloakFailure(operation: string, error: unknown, continuation?: string): void {
    const summary = summarizeKeycloakFailure(error);
    const logKey = `${operation}|${summary.dedupeKey}`;
    const now = Date.now();
    const previousLog = this.keycloakFailureLogs.get(logKey);

    if (previousLog && now - previousLog.loggedAt < this.keycloakFailureLogSuppressionMs) {
      previousLog.suppressed += 1;
      return;
    }

    const suppressedCount = previousLog?.suppressed ?? 0;
    this.keycloakFailureLogs.set(logKey, {
      loggedAt: now,
      suppressed: 0,
    });

    const continuationMessage = continuation ? ` ${continuation}` : '';
    const suppressionMessage =
      suppressedCount > 0
        ? ` Suppressed ${suppressedCount} similar Keycloak failure log${
            suppressedCount === 1 ? '' : 's'
          } in the last ${Math.round(this.keycloakFailureLogSuppressionMs / 1000)} seconds.`
        : '';

    this.logger.warn(`Keycloak ${operation} failed. ${summary.message}.${continuationMessage}${suppressionMessage}`);
  }

  private getTokenExchangeFailureContext(redirectUri: string): string {
    return `clientId=${this.clientId}; redirectUri=${this.formatRedirectUriForLog(
      redirectUri,
    )}; clientSecretConfigured=${this.clientSecret ? 'true' : 'false'}.`;
  }

  private formatRedirectUriForLog(redirectUri: string): string {
    try {
      const url = new URL(redirectUri);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return '[invalid-url]';
    }
  }

  private resolveAccessTokenExpiration(accessToken: string, expiresInSeconds?: number): number {
    const now = Date.now();
    if (typeof expiresInSeconds === 'number' && expiresInSeconds > 0) {
      return now + expiresInSeconds * 1000;
    }

    const claims = decodeJwtPayload(accessToken);
    const exp = readNumberClaim(claims, 'exp');
    if (exp) {
      return exp * 1000;
    }

    return now + 60 * 60 * 1000;
  }

  private resolveRefreshTokenExpiration(tokens: TokenResponse, fallbackExpiresAt: number): number {
    const now = Date.now();
    if (typeof tokens.refresh_expires_in === 'number' && tokens.refresh_expires_in > 0) {
      return now + tokens.refresh_expires_in * 1000;
    }

    if (typeof tokens.refresh_token === 'string') {
      const claims = decodeJwtPayload(tokens.refresh_token);
      const exp = readNumberClaim(claims, 'exp');
      if (exp) {
        return exp * 1000;
      }
    }

    return fallbackExpiresAt;
  }

  private shouldRefreshSessionAccessToken(accessTokenExpiresAt: number): boolean {
    return accessTokenExpiresAt - this.accessTokenRefreshSkewMs <= Date.now();
  }

  private parseCacheTtlMs(rawTtl?: string): number {
    const parsedTtl = Number.parseInt(rawTtl ?? '10000', 10);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      return 10000;
    }

    return parsedTtl;
  }

  private readEnv(key: string, fallback: string): string {
    return this.readOptionalEnv(key) ?? fallback;
  }

  private readOptionalEnv(key: string): string | undefined {
    const value = process.env[key]?.trim();
    return value ? value : undefined;
  }

  private readAllowedAccessTokenClients(): Set<string> {
    const clients = new Set<string>([this.clientId]);

    for (const client of (process.env.KEYCLOAK_ALLOWED_ACCESS_TOKEN_CLIENTS ?? '').split(',')) {
      const normalizedClient = client.trim();
      if (normalizedClient) {
        clients.add(normalizedClient);
      }
    }

    return clients;
  }

  private assertAccessTokenClientAllowed(principal: AuthenticatedUser): void {
    if (this.isServiceAccountPrincipal(principal)) {
      return;
    }

    const authorizedParty = this.readClientId(principal);
    if (authorizedParty && this.allowedAccessTokenClients.has(authorizedParty)) {
      return;
    }

    for (const client of this.allowedAccessTokenClients) {
      if (this.hasAudience(principal.claims['aud'], client)) {
        return;
      }
    }

    throw new UnauthorizedException('Access token was not issued for an allowed Event Manager client.');
  }

  private readRequiredM2mAudience(configuredAudience?: string): string {
    const audience = (configuredAudience ?? process.env.KEYCLOAK_M2M_AUDIENCE ?? '').trim();
    if (!audience) {
      throw new ForbiddenException('M2M audience is not configured.');
    }

    return audience;
  }

  private readRequiredAllowedM2mClients(configuredClients?: string[]): Set<string> {
    const clients =
      configuredClients ??
      (process.env.KEYCLOAK_M2M_ALLOWED_CLIENTS ?? '')
        .split(',')
        .map((client) => client.trim());
    const allowedClients = new Set(clients.map((client) => client.trim()).filter((client) => client.length > 0));

    if (allowedClients.size === 0) {
      throw new ForbiddenException('M2M allowed clients are not configured.');
    }

    return allowedClients;
  }

  private hasResourceClientRole(principal: AuthenticatedUser, resourceClientId: string, role: string): boolean {
    const resourceAccess = principal.claims['resource_access'];
    if (!isRecord(resourceAccess)) {
      return false;
    }

    const clientAccess = resourceAccess[resourceClientId];
    if (!isRecord(clientAccess)) {
      return false;
    }

    const clientRoles = clientAccess['roles'];
    if (!Array.isArray(clientRoles)) {
      return false;
    }

    return clientRoles.some((clientRole) => typeof clientRole === 'string' && clientRole.trim() === role);
  }

  private isServiceAccountPrincipal(principal: AuthenticatedUser): boolean {
    if (principal.preferredUsername?.startsWith('service-account-')) {
      return true;
    }

    if (principal.sub?.startsWith('service-account-')) {
      return true;
    }

    return Boolean(readStringClaim(principal.claims, 'client_id')?.startsWith('service-account-'));
  }

  private readClientId(principal: AuthenticatedUser): string | undefined {
    return readStringClaim(principal.claims, 'azp') ?? readStringClaim(principal.claims, 'client_id');
  }

  private hasAudience(rawAudience: unknown, expectedAudience: string): boolean {
    if (typeof rawAudience === 'string') {
      return rawAudience === expectedAudience;
    }

    if (!Array.isArray(rawAudience)) {
      return false;
    }

    return rawAudience.some((audience) => audience === expectedAudience);
  }

}
