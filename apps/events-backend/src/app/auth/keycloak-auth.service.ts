import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'node:crypto';
import { AuthSessionStoreService } from './auth-session-store.service';
import { DEFAULT_KEYCLOAK_CLIENT_ID, DEFAULT_KEYCLOAK_REALM_URL } from './auth.constants';
import { AuthorizationStateService } from './authorization-state.service';
import { LogoutDto } from './dto/logout.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import {
  decodeJwtPayload,
  extractPermissionClaims,
  extractPermissions,
  extractRealmRoles,
  extractRoles,
  extractOidcScopes,
  readNumberClaim,
  readStringClaim,
} from './keycloak-claims.utils';
import { CachedUser, TokenClaims, TokenResponse } from './keycloak-auth.types';

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);
  private readonly userCache = new Map<string, CachedUser>();

  private readonly realmUrl = (process.env.KEYCLOAK_REALM_URL ?? DEFAULT_KEYCLOAK_REALM_URL).replace(/\/+$/, '');

  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID ?? DEFAULT_KEYCLOAK_CLIENT_ID;

  private readonly clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  private readonly defaultRedirectUri = process.env.KEYCLOAK_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback';

  private readonly defaultPostLogoutRedirectUri = process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI;

  private readonly cacheTtlMs = this.parseCacheTtlMs(process.env.KEYCLOAK_INTROSPECTION_CACHE_TTL_MS);

  constructor(
    private readonly sessions: AuthSessionStoreService,
    private readonly authorizationState: AuthorizationStateService,
  ) {}

  async authenticateAccessToken(accessToken: string, requiredAuthorities: string[] = []): Promise<AuthenticatedUser> {
    const principal = await this.getOrCreatePrincipal(accessToken);

    const requiredPermissions = requiredAuthorities.filter((value) => this.isPermissionRequirement(value));
    const requiredRoles = requiredAuthorities.filter((value) => !this.isPermissionRequirement(value));

    const missingRoles = requiredRoles.filter((role) => !principal.roleSet.has(role));

    let missingPermissions = requiredPermissions.filter((permission) => !principal.permissionSet.has(permission));

    if (missingPermissions.length > 0) {
      const grantedPermissions = await this.evaluatePermissions(accessToken, missingPermissions);

      for (const permission of grantedPermissions) {
        principal.permissionSet.add(permission);
      }
      principal.permissions = [...principal.permissionSet];

      missingPermissions = requiredPermissions.filter((permission) => !principal.permissionSet.has(permission));
    }

    const missing = [...missingRoles, ...missingPermissions];

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required roles or permissions: ${missing.join(', ')}. Granted roles: ${
          principal.roles.join(', ') || '(none)'
        }. Granted permissions: ${principal.permissions.join(', ') || '(none)'}`,
      );
    }

    return principal;
  }

  buildAuthorizationUrl(options?: {
    redirectUri?: string;
    returnTo?: string;
    state?: string;
    scope?: string;
    prompt?: string;
  }): string {
    const redirectUri = options?.redirectUri ?? this.defaultRedirectUri;
    const state = this.authorizationState.build({
      redirectUri,
      returnTo: options?.returnTo,
      state: options?.state,
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: options?.scope ?? 'openid profile email identity-document academic-profile',
      kc_idp_hint: 'google',
      ...(state ? { state } : {}),
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    });

    const authorizationUrl = new URL(`${this.realmUrl}/protocol/openid-connect/auth?${params.toString()}`);

    return authorizationUrl.toString();
  }

  async exchangeCodeForTokens(code: string, state?: string, redirectUri?: string): Promise<Record<string, unknown>> {
    const payload = new URLSearchParams();
    payload.set('grant_type', 'authorization_code');
    payload.set('client_id', this.clientId);
    payload.set('code', code);
    payload.set(
      'redirect_uri',
      this.authorizationState.getAuthorizationRedirectUri(state) ?? redirectUri ?? this.defaultRedirectUri,
    );

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
      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data);
      }

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
    } catch {
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
      } catch {
        this.logger.warn('Failed to revoke refresh token at Keycloak.');
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
    return this.updateStoredSession(sessionId, tokenResponse);
  }

  private async updateStoredSession(
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

  async authenticateSession(sessionId: string, requiredRoles: string[] = []): Promise<AuthenticatedUser> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return this.authenticateAccessToken(session.accessToken, requiredRoles);
  }

  async evaluateAccessTokenPermissions(accessToken: string, requiredPermissions: string[]): Promise<string[]> {
    const principal = await this.getOrCreatePrincipal(accessToken);
    const permissionRequirements = requiredPermissions.filter((value) => this.isPermissionRequirement(value));
    const missingPermissions = permissionRequirements.filter((permission) => !principal.permissionSet.has(permission));

    if (missingPermissions.length > 0) {
      const grantedPermissions = await this.evaluatePermissions(accessToken, missingPermissions);

      for (const permission of grantedPermissions) {
        principal.permissionSet.add(permission);
      }
      principal.permissions = [...principal.permissionSet];
    }

    return permissionRequirements.filter((permission) => principal.permissionSet.has(permission));
  }

  async evaluateSessionPermissions(sessionId: string, requiredPermissions: string[]): Promise<string[]> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return this.evaluateAccessTokenPermissions(session.accessToken, requiredPermissions);
  }

  assertMachineToMachinePrincipal(
    principal: AuthenticatedUser | undefined,
    options: { requiredRoles?: string[] } = {},
  ): AuthenticatedUser {
    if (!principal) {
      throw new UnauthorizedException('Missing authenticated M2M principal.');
    }

    const requireServiceAccount = process.env.KEYCLOAK_M2M_REQUIRE_SERVICE_ACCOUNT !== 'false';
    if (requireServiceAccount && !this.isServiceAccountPrincipal(principal)) {
      throw new ForbiddenException('A Keycloak service-account token is required.');
    }

    const audience = process.env.KEYCLOAK_M2M_AUDIENCE?.trim();
    if (audience && !this.hasAudience(principal.claims['aud'], audience)) {
      throw new ForbiddenException(`Token audience must include ${audience}.`);
    }

    const allowedClients = this.readAllowedM2mClients();
    const clientId = this.readClientId(principal);
    if (allowedClients.size > 0 && (!clientId || !allowedClients.has(clientId))) {
      throw new ForbiddenException('M2M client is not allowed.');
    }

    const requiredRoles = options.requiredRoles ?? [];
    const missingRoles = requiredRoles.filter((role) => !principal.roleSet.has(role));
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

  getPostLoginRedirectUri(state?: string): string {
    return this.authorizationState.getPostLoginRedirectUri(state);
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

    const roles = extractRoles(decodedClaims, introspectionJwtClaims, keycloakClaims);
    const roleSet = new Set(roles);
    const permissions = extractPermissions(decodedClaims, introspectionJwtClaims, keycloakClaims);
    const permissionSet = new Set(permissions);
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
      permissions,
      permissionSet,
      oidcScopes,
      oidcScopeSet,
      scopes: oidcScopes,
      scopeSet: oidcScopeSet,
      claims: mergedClaims,
    };

    const expSeconds = readNumberClaim(mergedClaims, 'exp');
    const expBasedCache = expSeconds ? expSeconds * 1000 : now + this.cacheTtlMs;

    this.userCache.set(accessToken, {
      user: principal,
      expiresAt: Math.min(expBasedCache, now + this.cacheTtlMs),
    });

    return principal;
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

        this.logger.warn('Keycloak token introspection failed; falling back to userinfo endpoint.');
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
    } catch {
      if (introspectionClaims) {
        return introspectionClaims;
      }

      throw new UnauthorizedException('Unable to validate access token with Keycloak.');
    }
  }

  private async evaluatePermissions(accessToken: string, requiredPermissions: string[]): Promise<string[]> {
    const payload = new URLSearchParams();
    payload.set('grant_type', 'urn:ietf:params:oauth:grant-type:uma-ticket');
    payload.set('audience', this.clientId);
    payload.set('response_mode', 'permissions');
    payload.set('response_include_resource_name', 'true');
    payload.set('client_id', this.clientId);

    if (this.clientSecret) {
      payload.set('client_secret', this.clientSecret);
    }

    for (const permission of requiredPermissions) {
      payload.append('permission', permission);
    }

    try {
      const { data } = await axios.post(`${this.realmUrl}/protocol/openid-connect/token`, payload.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
      });

      const grantedPermissions = new Set<string>();
      extractPermissionClaims(data, grantedPermissions);
      return [...grantedPermissions];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        return [];
      }

      this.logger.warn('Keycloak authorization permission evaluation failed while resolving required permissions.');
      return [];
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

  private parseCacheTtlMs(rawTtl?: string): number {
    const parsedTtl = Number.parseInt(rawTtl ?? '10000', 10);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      return 10000;
    }

    return parsedTtl;
  }

  private readAllowedM2mClients(): Set<string> {
    return new Set(
      (process.env.KEYCLOAK_M2M_ALLOWED_CLIENTS ?? '')
        .split(',')
        .map((client) => client.trim())
        .filter((client) => client.length > 0),
    );
  }

  private isPermissionRequirement(value: string): boolean {
    return value.includes('#');
  }

  private isServiceAccountPrincipal(principal: AuthenticatedUser): boolean {
    if (principal.preferredUsername?.startsWith('service-account-')) {
      return true;
    }

    return Boolean(readStringClaim(principal.claims, 'client_id'));
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
