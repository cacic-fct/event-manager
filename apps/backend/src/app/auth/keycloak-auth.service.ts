import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { Buffer } from 'node:buffer';
import { createPublicKey, type JsonWebKey, type KeyObject, randomBytes, verify as verifySignature } from 'node:crypto';
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

type ClientSecretAuthMethod = 'client_secret_basic' | 'client_secret_post';

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);
  private readonly userCache = new Map<string, CachedUser>();
  private jwksCache?: { keys: Map<string, KeyObject>; expiresAt: number };
  private readonly keycloakFailureLogs = new Map<string, { loggedAt: number; suppressed: number }>();
  private readonly accessTokenRefreshSkewMs = 30_000;
  private readonly keycloakFailureLogSuppressionMs = 60_000;

  private readonly realmUrl = this.readEnv('KEYCLOAK_REALM_URL', DEFAULT_KEYCLOAK_REALM_URL).replace(/\/+$/, '');

  private readonly clientId = this.readEnv('KEYCLOAK_CLIENT_ID', DEFAULT_KEYCLOAK_CLIENT_ID);
  private readonly allowedAccessTokenClients = this.readAllowedAccessTokenClients();

  private readonly clientSecret = this.readOptionalEnv('KEYCLOAK_CLIENT_SECRET');
  private readonly tokenEndpointAuthMethod = this.readTokenEndpointAuthMethod();
  private readonly defaultRedirectUri = this.readEnv('KEYCLOAK_REDIRECT_URI', 'http://localhost:3000/api/auth/callback');

  private readonly defaultPostLogoutRedirectUri = this.readOptionalEnv('KEYCLOAK_POST_LOGOUT_REDIRECT_URI');

  private readonly cacheTtlMs = this.parsePositiveIntegerEnv(
    process.env.KEYCLOAK_PRINCIPAL_CACHE_TTL_MS ?? process.env.KEYCLOAK_INTROSPECTION_CACHE_TTL_MS,
    10_000,
  );
  private readonly jwksCacheTtlMs = this.parsePositiveIntegerEnv(process.env.KEYCLOAK_JWKS_CACHE_TTL_MS, 600_000);
  private readonly jwtClockSkewSeconds = this.parsePositiveIntegerEnv(
    process.env.KEYCLOAK_JWT_CLOCK_SKEW_SECONDS,
    30,
  );

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
    payload.set('code', code);
    payload.set('redirect_uri', exchangeRedirectUri);
    const headers = this.createFormHeaders();
    this.addClientAuthentication(payload, headers);

    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers,
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
    payload.set('refresh_token', refreshToken);
    const headers = this.createFormHeaders();
    this.addClientAuthentication(payload, headers);

    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers,
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
      payload.set('token', input.refreshToken);
      payload.set('token_type_hint', 'refresh_token');
      const headers = this.createFormHeaders();
      this.addClientAuthentication(payload, headers);

      try {
        await axios.post(`${this.realmUrl}/protocol/openid-connect/revoke`, payload.toString(), {
          headers,
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

  async getSessionExpiration(sessionId: string): Promise<number | null> {
    return (await this.sessions.get(sessionId))?.sessionExpiresAt ?? null;
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

    const mergedClaims = await this.verifyAccessTokenClaims(accessToken);

    const roles = extractRoles(this.clientId, mergedClaims);
    const roleSet = new Set(roles);
    const oidcScopes = extractOidcScopes(mergedClaims);
    const oidcScopeSet = new Set(oidcScopes);

    const principal: AuthenticatedUser = {
      realm_access: {
        roles: extractRealmRoles(mergedClaims['realm_access']),
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

  private async verifyAccessTokenClaims(accessToken: string): Promise<TokenClaims> {
    const segments = accessToken.split('.');
    if (
      segments.length !== 3 ||
      segments.some((segment) => segment.length === 0)
    ) {
      throw new UnauthorizedException('Invalid token format.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = this.decodeJwtJsonSegment(encodedHeader, 'header');
    const alg = readStringClaim(header, 'alg');
    const kid = readStringClaim(header, 'kid');

    if (alg !== 'RS256') {
      throw new UnauthorizedException('Unsupported token signature algorithm.');
    }

    if (!kid) {
      throw new UnauthorizedException('Token signing key id is missing.');
    }

    const claims = this.decodeJwtJsonSegment(encodedPayload, 'payload');
    await this.assertJwtSignature(kid, encodedHeader, encodedPayload, encodedSignature);
    this.assertJwtIssuer(claims);
    this.assertJwtTimeClaims(claims);

    return {
      ...claims,
      active: true,
    };
  }

  private async assertJwtSignature(
    kid: string,
    encodedHeader: string,
    encodedPayload: string,
    encodedSignature: string,
  ): Promise<void> {
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8');
    const signature = this.decodeBase64UrlSegment(encodedSignature);
    const signingKey = await this.getSigningKey(kid);

    if (verifySignature('RSA-SHA256', signingInput, signingKey, signature)) {
      return;
    }

    const refreshedSigningKey = await this.getSigningKey(kid, true);
    if (verifySignature('RSA-SHA256', signingInput, refreshedSigningKey, signature)) {
      return;
    }

    throw new UnauthorizedException('Invalid token signature.');
  }

  private async getSigningKey(kid: string, forceRefresh = false): Promise<KeyObject> {
    const keys = await this.getJwksKeys(forceRefresh);
    const key = keys.get(kid);
    if (key) {
      return key;
    }

    if (!forceRefresh) {
      const refreshedKeys = await this.getJwksKeys(true);
      const refreshedKey = refreshedKeys.get(kid);
      if (refreshedKey) {
        return refreshedKey;
      }
    }

    throw new UnauthorizedException('Unable to verify token signature.');
  }

  private async getJwksKeys(forceRefresh = false): Promise<Map<string, KeyObject>> {
    const now = Date.now();
    if (!forceRefresh && this.jwksCache && this.jwksCache.expiresAt > now) {
      return this.jwksCache.keys;
    }

    const jwksUrl = `${this.realmUrl}/protocol/openid-connect/certs`;

    try {
      const response = await fetch(jwksUrl, {
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Keycloak JWKS lookup failed. status=${response.status} ${response.statusText}.`);
        throw new UnauthorizedException('Unable to load Keycloak signing keys.');
      }

      const body: unknown = await response.json();
      const keys = this.parseJwks(body);
      if (keys.size === 0) {
        this.logger.warn('Keycloak JWKS response did not include usable RS256 signing keys.');
        throw new UnauthorizedException('Unable to load Keycloak signing keys.');
      }

      this.jwksCache = {
        keys,
        expiresAt: now + this.jwksCacheTtlMs,
      };

      return keys;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(
        `Keycloak JWKS lookup failed. ${error instanceof Error ? `message=${error.message}.` : 'unknown error.'}`,
      );
      throw new UnauthorizedException('Unable to load Keycloak signing keys.');
    }
  }

  private parseJwks(body: unknown): Map<string, KeyObject> {
    const keys = new Map<string, KeyObject>();
    if (!isRecord(body) || !Array.isArray(body['keys'])) {
      return keys;
    }

    for (const rawKey of body['keys']) {
      if (!isRecord(rawKey)) {
        continue;
      }

      const kid = readStringClaim(rawKey, 'kid');
      const kty = readStringClaim(rawKey, 'kty');
      const use = readStringClaim(rawKey, 'use');
      const alg = readStringClaim(rawKey, 'alg');
      if (!kid || kty !== 'RSA' || (use && use !== 'sig') || (alg && alg !== 'RS256')) {
        continue;
      }

      try {
        keys.set(
          kid,
          createPublicKey({
            key: { ...rawKey } as JsonWebKey,
            format: 'jwk',
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Ignoring unusable Keycloak JWKS key. kid=${kid}; ${
            error instanceof Error ? `message=${error.message}.` : 'unknown error.'
          }`,
        );
      }
    }

    return keys;
  }

  private decodeJwtJsonSegment(segment: string, description: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(this.decodeBase64UrlSegment(segment).toString('utf8'));
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to a stable UnauthorizedException below.
    }

    throw new UnauthorizedException(`Invalid token ${description}.`);
  }

  private decodeBase64UrlSegment(segment: string): Buffer {
    try {
      return Buffer.from(segment, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid token encoding.');
    }
  }

  private assertJwtIssuer(claims: Record<string, unknown>): void {
    if (readStringClaim(claims, 'iss') !== this.realmUrl) {
      throw new UnauthorizedException('Invalid token issuer.');
    }
  }

  private assertJwtTimeClaims(claims: Record<string, unknown>): void {
    const now = Math.floor(Date.now() / 1000);
    const exp = readNumberClaim(claims, 'exp');
    if (!exp) {
      throw new UnauthorizedException('Token missing expiration.');
    }

    if (exp < now - this.jwtClockSkewSeconds) {
      throw new UnauthorizedException('Token expired.');
    }

    const nbf = readNumberClaim(claims, 'nbf');
    if (nbf && nbf > now + this.jwtClockSkewSeconds) {
      throw new UnauthorizedException('Token is not active yet.');
    }

    const iat = readNumberClaim(claims, 'iat');
    if (iat && iat > now + this.jwtClockSkewSeconds) {
      throw new UnauthorizedException('Token issued in the future.');
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
    )}; clientSecretConfigured=${this.clientSecret ? 'true' : 'false'}; tokenEndpointAuthMethod=${
      this.clientSecret ? this.tokenEndpointAuthMethod : 'none'
    }.`;
  }

  private createFormHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    return {
      'content-type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    };
  }

  private addClientAuthentication(payload: URLSearchParams, headers: Record<string, string>): void {
    if (!this.clientSecret) {
      payload.set('client_id', this.clientId);
      return;
    }

    if (this.tokenEndpointAuthMethod === 'client_secret_post') {
      payload.set('client_id', this.clientId);
      payload.set('client_secret', this.clientSecret);
      return;
    }

    headers.Authorization = `Basic ${this.getClientSecretBasicCredentials()}`;
  }

  private getClientSecretBasicCredentials(): string {
    const clientSecret = this.clientSecret;
    if (!clientSecret) {
      return '';
    }

    return Buffer.from(`${this.formEncode(this.clientId)}:${this.formEncode(clientSecret)}`, 'utf8').toString('base64');
  }

  private formEncode(value: string): string {
    const params = new URLSearchParams();
    params.set('value', value);
    return params.toString().slice('value='.length);
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

  private parsePositiveIntegerEnv(rawValue: string | undefined, fallback: number): number {
    const parsedTtl = Number.parseInt(rawValue ?? '', 10);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      return fallback;
    }

    return parsedTtl;
  }

  private readEnv(key: string, fallback: string): string {
    return this.readOptionalEnv(key) ?? fallback;
  }

  private readTokenEndpointAuthMethod(): ClientSecretAuthMethod {
    const value = process.env.KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD?.trim();

    if (value === 'client_secret_basic' || value === 'client_secret_post') {
      return value;
    }

    if (value) {
      this.logger.warn(
        `Unsupported KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD="${value}". Falling back to client_secret_basic.`,
      );
    }

    return 'client_secret_basic';
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
    const clientId = this.readClientId(principal);
    return Boolean(clientId && principal.preferredUsername === `service-account-${clientId}`);
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
