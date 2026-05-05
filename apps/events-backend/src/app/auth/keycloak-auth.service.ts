import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_KEYCLOAK_CLIENT_ID,
  DEFAULT_KEYCLOAK_REALM_URL,
} from './auth.constants';
import { LogoutDto } from './dto/logout.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

type TokenClaims = Record<string, unknown> & {
  active?: boolean;
};

interface CachedUser {
  user: AuthenticatedUser;
  expiresAt: number;
}

interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  idTokenHint?: string;
  accessTokenExpiresAt: number;
  sessionExpiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);
  private readonly userCache = new Map<string, CachedUser>();
  private readonly sessionCache = new Map<string, AuthSession>();

  private readonly realmUrl = (
    process.env.KEYCLOAK_REALM_URL ?? DEFAULT_KEYCLOAK_REALM_URL
  ).replace(/\/+$/, '');

  private readonly clientId =
    process.env.KEYCLOAK_CLIENT_ID ?? DEFAULT_KEYCLOAK_CLIENT_ID;

  private readonly clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  private readonly defaultRedirectUri =
    process.env.KEYCLOAK_REDIRECT_URI ??
    'http://localhost:3000/api/auth/callback';

  private readonly defaultPostLogoutRedirectUri =
    process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI;
  private readonly defaultPostLoginRedirectUri =
    process.env.KEYCLOAK_POST_LOGIN_REDIRECT_URI ?? 'http://localhost:4200';

  private readonly cacheTtlMs = this.parseCacheTtlMs(
    process.env.KEYCLOAK_INTROSPECTION_CACHE_TTL_MS,
  );

  async authenticateAccessToken(
    accessToken: string,
    requiredAuthorities: string[] = [],
  ): Promise<AuthenticatedUser> {
    const principal = await this.getOrCreatePrincipal(accessToken);

    const requiredPermissions = requiredAuthorities.filter((value) =>
      this.isPermissionRequirement(value),
    );
    const requiredRoles = requiredAuthorities.filter(
      (value) => !this.isPermissionRequirement(value),
    );

    const missingRoles = requiredRoles.filter(
      (role) => !principal.roleSet.has(role),
    );

    let missingPermissions = requiredPermissions.filter(
      (permission) => !principal.permissionSet.has(permission),
    );

    if (missingPermissions.length > 0) {
      const grantedPermissions = await this.evaluatePermissions(
        accessToken,
        missingPermissions,
      );

      for (const permission of grantedPermissions) {
        principal.permissionSet.add(permission);
      }
      principal.permissions = [...principal.permissionSet];

      missingPermissions = requiredPermissions.filter(
        (permission) => !principal.permissionSet.has(permission),
      );
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
    state?: string;
    scope?: string;
    prompt?: string;
  }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: options?.redirectUri ?? this.defaultRedirectUri,
      response_type: 'code',
      scope:
        options?.scope ??
        'openid profile email identity-document academic-profile',
      kc_idp_hint: 'google',
      ...(options?.state ? { state: options.state } : {}),
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    });

    const authorizationUrl = new URL(
      `${this.realmUrl}/protocol/openid-connect/auth?${params.toString()}`,
    );

    return authorizationUrl.toString();
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri?: string,
  ): Promise<Record<string, unknown>> {
    const payload = new URLSearchParams();
    payload.set('grant_type', 'authorization_code');
    payload.set('client_id', this.clientId);
    payload.set('code', code);
    payload.set('redirect_uri', redirectUri ?? this.defaultRedirectUri);

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
      throw new UnauthorizedException(
        'Could not exchange authorization code for tokens.',
      );
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<Record<string, unknown>> {
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
        await axios.post(
          `${this.realmUrl}/protocol/openid-connect/revoke`,
          payload.toString(),
          {
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
          },
        );
        refreshTokenRevoked = true;
      } catch {
        this.logger.warn('Failed to revoke refresh token at Keycloak.');
      }
    }

    const logoutUrl = new URL(
      `${this.realmUrl}/protocol/openid-connect/logout`,
    );
    logoutUrl.searchParams.set('client_id', this.clientId);

    if (input.idTokenHint) {
      logoutUrl.searchParams.set('id_token_hint', input.idTokenHint);
    }

    const postLogoutRedirectUri =
      input.postLogoutRedirectUri ?? this.defaultPostLogoutRedirectUri;
    if (postLogoutRedirectUri) {
      logoutUrl.searchParams.set(
        'post_logout_redirect_uri',
        postLogoutRedirectUri,
      );
    }

    return {
      refreshTokenRevoked,
      logoutUrl: logoutUrl.toString(),
    };
  }

  createSession(tokenResponse: Record<string, unknown>): {
    sessionId: string;
    expiresAt: number;
    sessionExpiresAt: number;
  } {
    const tokens = tokenResponse as TokenResponse;
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      throw new UnauthorizedException('Missing access token in auth response.');
    }

    const accessTokenExpiresAt = this.resolveAccessTokenExpiration(
      tokens.access_token,
      tokens.expires_in,
    );
    const sessionExpiresAt = this.resolveRefreshTokenExpiration(
      tokens,
      accessTokenExpiresAt,
    );
    const sessionId = randomBytes(32).toString('base64url');

    this.sessionCache.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken:
        typeof tokens.refresh_token === 'string'
          ? tokens.refresh_token
          : undefined,
      idTokenHint:
        typeof tokens.id_token === 'string' ? tokens.id_token : undefined,
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
  ): { expiresAt: number; sessionExpiresAt: number } {
    const session = this.readSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    const tokens = tokenResponse as TokenResponse;
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      throw new UnauthorizedException('Missing access token in auth response.');
    }

    const accessTokenExpiresAt = this.resolveAccessTokenExpiration(
      tokens.access_token,
      tokens.expires_in,
    );
    const sessionExpiresAt = this.resolveRefreshTokenExpiration(
      tokens,
      session.sessionExpiresAt,
    );

    this.sessionCache.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken:
        typeof tokens.refresh_token === 'string'
          ? tokens.refresh_token
          : session.refreshToken,
      idTokenHint:
        typeof tokens.id_token === 'string'
          ? tokens.id_token
          : session.idTokenHint,
      accessTokenExpiresAt,
      sessionExpiresAt,
    });

    return { expiresAt: accessTokenExpiresAt, sessionExpiresAt };
  }

  async authenticateSession(
    sessionId: string,
    requiredRoles: string[] = [],
  ): Promise<AuthenticatedUser> {
    const session = this.readSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return this.authenticateAccessToken(session.accessToken, requiredRoles);
  }

  async evaluateAccessTokenPermissions(
    accessToken: string,
    requiredPermissions: string[],
  ): Promise<string[]> {
    const principal = await this.getOrCreatePrincipal(accessToken);
    const permissionRequirements = requiredPermissions.filter((value) =>
      this.isPermissionRequirement(value),
    );
    const missingPermissions = permissionRequirements.filter(
      (permission) => !principal.permissionSet.has(permission),
    );

    if (missingPermissions.length > 0) {
      const grantedPermissions = await this.evaluatePermissions(
        accessToken,
        missingPermissions,
      );

      for (const permission of grantedPermissions) {
        principal.permissionSet.add(permission);
      }
      principal.permissions = [...principal.permissionSet];
    }

    return permissionRequirements.filter((permission) =>
      principal.permissionSet.has(permission),
    );
  }

  async evaluateSessionPermissions(
    sessionId: string,
    requiredPermissions: string[],
  ): Promise<string[]> {
    const session = this.readSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Missing authenticated session.');
    }

    return this.evaluateAccessTokenPermissions(
      session.accessToken,
      requiredPermissions,
    );
  }

  clearSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }

  getSessionLogoutInput(sessionId: string): LogoutDto | null {
    const session = this.readSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      refreshToken: session.refreshToken,
      idTokenHint: session.idTokenHint,
    };
  }

  getPostLoginRedirectUri(): string {
    return this.defaultPostLoginRedirectUri;
  }

  private async getOrCreatePrincipal(
    accessToken: string,
  ): Promise<AuthenticatedUser> {
    const now = Date.now();
    const cachedUser = this.userCache.get(accessToken);
    if (cachedUser && cachedUser.expiresAt > now) {
      return cachedUser.user;
    }

    const keycloakClaims = await this.fetchTokenClaims(accessToken);
    const decodedClaims = this.decodeJwtPayload(accessToken);
    const introspectionJwtClaims = this.decodeJwtPayload(
      this.readStringClaim(keycloakClaims, 'jwt') ?? '',
    );
    const mergedClaims: Record<string, unknown> = {
      ...decodedClaims,
      ...introspectionJwtClaims,
      ...keycloakClaims,
    };

    const roles = this.extractRoles(
      decodedClaims,
      introspectionJwtClaims,
      keycloakClaims,
    );
    const roleSet = new Set(roles);
    const permissions = this.extractPermissions(
      decodedClaims,
      introspectionJwtClaims,
      keycloakClaims,
    );
    const permissionSet = new Set(permissions);
    const oidcScopes = this.extractOidcScopes(
      decodedClaims,
      introspectionJwtClaims,
      keycloakClaims,
    );
    const oidcScopeSet = new Set(oidcScopes);

    const principal: AuthenticatedUser = {
      realm_access: {
        roles: this.extractRealmRoles(
          decodedClaims['realm_access'],
          introspectionJwtClaims['realm_access'],
          keycloakClaims['realm_access'],
        ),
      },
      sub: this.readStringClaim(mergedClaims, 'sub'),
      preferredUsername: this.readStringClaim(
        mergedClaims,
        'preferred_username',
      ),
      email: this.readStringClaim(mergedClaims, 'email'),
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

    const expSeconds = this.readNumberClaim(mergedClaims, 'exp');
    const expBasedCache = expSeconds
      ? expSeconds * 1000
      : now + this.cacheTtlMs;

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

        this.logger.warn(
          'Keycloak token introspection failed; falling back to userinfo endpoint.',
        );
      }
    }

    try {
      const { data } = await axios.get<TokenClaims>(
        `${this.realmUrl}/protocol/openid-connect/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

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

      throw new UnauthorizedException(
        'Unable to validate access token with Keycloak.',
      );
    }
  }

  private extractRoles(...claimsSources: Record<string, unknown>[]): string[] {
    const roles = new Set<string>();
    for (const claims of claimsSources) {
      for (const role of this.extractRealmRoles(claims['realm_access'])) {
        roles.add(role);
      }
      this.extractClientRoles(claims['resource_access'], roles);
    }

    return [...roles];
  }

  private extractClientRoles(
    resourceAccessClaim: unknown,
    roles: Set<string>,
  ): void {
    if (!this.isRecord(resourceAccessClaim)) {
      return;
    }

    for (const clientAccess of Object.values(resourceAccessClaim)) {
      if (!this.isRecord(clientAccess)) {
        continue;
      }

      const clientRoles = clientAccess['roles'];
      if (!Array.isArray(clientRoles)) {
        continue;
      }

      for (const role of clientRoles) {
        if (typeof role !== 'string') {
          continue;
        }

        const normalizedRole = role.trim();
        if (normalizedRole) {
          roles.add(normalizedRole);
        }
      }
    }
  }

  private extractOidcScopes(
    ...claimsSources: Record<string, unknown>[]
  ): string[] {
    const scopes = new Set<string>();
    for (const claims of claimsSources) {
      this.extractOidcScopeClaim(claims['scope'], scopes);
    }

    return [...scopes];
  }

  private extractOidcScopeClaim(
    scopeClaim: unknown,
    scopeSet: Set<string>,
  ): void {
    if (typeof scopeClaim !== 'string') {
      return;
    }

    for (const scope of scopeClaim.split(' ')) {
      const normalizedScope = scope.trim();
      if (normalizedScope) {
        scopeSet.add(normalizedScope);
      }
    }
  }

  private extractPermissions(
    ...claimsSources: Record<string, unknown>[]
  ): string[] {
    const permissions = new Set<string>();
    for (const claims of claimsSources) {
      this.extractPermissionClaims(claims['permissions'], permissions);

      const authorizationClaim = claims['authorization'];
      if (this.isRecord(authorizationClaim)) {
        this.extractPermissionClaims(
          authorizationClaim['permissions'],
          permissions,
        );
      }
    }

    return [...permissions];
  }

  private extractPermissionClaims(
    rawPermissions: unknown,
    permissionSet: Set<string>,
  ): void {
    if (!Array.isArray(rawPermissions)) {
      return;
    }

    for (const permission of rawPermissions) {
      if (typeof permission === 'string') {
        const normalizedPermission = permission.trim();
        if (normalizedPermission) {
          permissionSet.add(normalizedPermission);
        }
        continue;
      }

      if (!this.isRecord(permission)) {
        continue;
      }

      const resourceName =
        this.readStringClaim(permission, 'rsname') ??
        this.readStringClaim(permission, 'resource_name');

      const rawScopes = permission['scopes'];
      if (!Array.isArray(rawScopes)) {
        continue;
      }

      for (const scope of rawScopes) {
        if (typeof scope !== 'string') {
          continue;
        }

        const normalizedScope = scope.trim();
        if (!normalizedScope) {
          continue;
        }

        if (resourceName) {
          permissionSet.add(`${resourceName}#${normalizedScope}`);
        } else {
          permissionSet.add(normalizedScope);
        }
      }
    }
  }

  private async evaluatePermissions(
    accessToken: string,
    requiredPermissions: string[],
  ): Promise<string[]> {
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
      const { data } = await axios.post(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const grantedPermissions = new Set<string>();
      this.extractPermissionClaims(data, grantedPermissions);
      return [...grantedPermissions];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        return [];
      }

      this.logger.warn(
        'Keycloak authorization permission evaluation failed while resolving required permissions.',
      );
      return [];
    }
  }

  private extractRealmRoles(...realmAccessSources: unknown[]): string[] {
    const roles = new Set<string>();
    for (const rawRealmAccess of realmAccessSources) {
      if (!this.isRecord(rawRealmAccess)) {
        continue;
      }

      const rawRoles = rawRealmAccess['roles'];
      if (!Array.isArray(rawRoles)) {
        continue;
      }

      for (const role of rawRoles) {
        if (typeof role !== 'string') {
          continue;
        }

        const normalizedRole = role.trim();
        if (normalizedRole) {
          roles.add(normalizedRole);
        }
      }
    }

    return [...roles];
  }

  private decodeJwtPayload(accessToken: string): Record<string, unknown> {
    const [, payloadSegment] = accessToken.split('.');
    if (!payloadSegment) {
      return {};
    }

    const normalizedPayload = payloadSegment
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddingLength = (4 - (normalizedPayload.length % 4)) % 4;
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + paddingLength,
      '=',
    );

    try {
      const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      return this.isRecord(payload) ? payload : {};
    } catch {
      return {};
    }
  }

  private resolveAccessTokenExpiration(
    accessToken: string,
    expiresInSeconds?: number,
  ): number {
    const now = Date.now();
    if (typeof expiresInSeconds === 'number' && expiresInSeconds > 0) {
      return now + expiresInSeconds * 1000;
    }

    const claims = this.decodeJwtPayload(accessToken);
    const exp = this.readNumberClaim(claims, 'exp');
    if (exp) {
      return exp * 1000;
    }

    return now + 60 * 60 * 1000;
  }

  private resolveRefreshTokenExpiration(
    tokens: TokenResponse,
    fallbackExpiresAt: number,
  ): number {
    const now = Date.now();
    if (
      typeof tokens.refresh_expires_in === 'number' &&
      tokens.refresh_expires_in > 0
    ) {
      return now + tokens.refresh_expires_in * 1000;
    }

    if (typeof tokens.refresh_token === 'string') {
      const claims = this.decodeJwtPayload(tokens.refresh_token);
      const exp = this.readNumberClaim(claims, 'exp');
      if (exp) {
        return exp * 1000;
      }
    }

    return fallbackExpiresAt;
  }

  private readSession(sessionId: string): AuthSession | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.sessionExpiresAt <= Date.now()) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    return session;
  }

  private parseCacheTtlMs(rawTtl?: string): number {
    const parsedTtl = Number.parseInt(rawTtl ?? '10000', 10);
    if (Number.isNaN(parsedTtl) || parsedTtl <= 0) {
      return 10000;
    }

    return parsedTtl;
  }

  private readStringClaim(
    claims: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = claims[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readNumberClaim(
    claims: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = claims[key];
    return typeof value === 'number' ? value : undefined;
  }

  private isPermissionRequirement(value: string): boolean {
    return value.includes('#');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
