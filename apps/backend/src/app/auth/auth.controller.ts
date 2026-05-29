import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME, AUTH_STATE_COOKIE_NAME } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { LogoutDto } from './dto/logout.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { KeycloakAuthService } from './keycloak-auth.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

type PermissionEvaluationBody = {
  permissions?: unknown;
};

class LoginUrlResponseDto {
  @ApiProperty({
    description:
      'Keycloak authorization URL generated with the server-side authorization state bound to the auth state cookie.',
    example:
      'https://sso.cacic.dev.br/realms/cacic-sso/protocol/openid-connect/auth?client_id=cacic-event-manager&response_type=code&scope=openid%20profile%20email&state=...',
  })
  authorizationUrl!: string;
}

class RefreshSessionResponseDto {
  @ApiProperty({
    description: 'Access-token expiration timestamp in milliseconds since epoch.',
    example: 1767225599000,
  })
  expiresAt!: number;

  @ApiProperty({
    description: 'Server-side session expiration timestamp in milliseconds since epoch.',
    example: 1767229199000,
  })
  sessionExpiresAt!: number;
}

class PermissionEvaluationRequestDto {
  @ApiProperty({
    description:
      'Permissions to evaluate against the current access token. Empty strings are ignored and duplicate values are removed before evaluation.',
    example: ['events:create', 'events:update', 'major-events:read'],
    type: [String],
  })
  permissions!: string[];
}

class PermissionEvaluationResponseDto {
  @ApiProperty({
    description: 'Permissions granted by Keycloak after evaluating the current access token.',
    example: ['events:create', 'major-events:read'],
    type: [String],
  })
  permissions!: string[];
}

class RealmAccessDto {
  @ApiProperty({
    description: 'Realm roles present in the access token.',
    example: ['offline_access', 'uma_authorization'],
    type: [String],
  })
  roles!: string[];
}

class AuthenticatedUserResponseDto {
  @ApiProperty({
    description: 'Realm-level access information extracted from the token.',
    type: RealmAccessDto,
  })
  realm_access!: RealmAccessDto;

  @ApiPropertyOptional({
    description: 'Subject identifier from the authenticated identity.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  sub?: string;

  @ApiPropertyOptional({
    description: 'Preferred username claim from the identity provider.',
    example: 'joao.silva',
  })
  preferredUsername?: string;

  @ApiPropertyOptional({
    description: 'Email claim when provided by the identity provider.',
    example: 'joao@cacic.dev.br',
  })
  email?: string;

  @ApiProperty({
    description: 'Current access token used by the backend for downstream authorization checks.',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIn0...',
  })
  token!: string;

  @ApiProperty({
    description: 'Normalized role list used by application authorization checks.',
    example: ['admin', 'event-manager'],
    type: [String],
  })
  roles!: string[];

  @ApiProperty({
    description:
      'Set-backed role lookup. If returned over HTTP, ensure it is serialized to an array or omit it from the public response shape.',
    example: ['admin', 'event-manager'],
    type: [String],
  })
  roleSet!: string[];

  @ApiProperty({
    description: 'Normalized permission list resolved for the authenticated user.',
    example: ['events:create', 'events:update', 'major-events:read'],
    type: [String],
  })
  permissions!: string[];

  @ApiProperty({
    description:
      'Set-backed permission lookup. If returned over HTTP, ensure it is serialized to an array or omit it from the public response shape.',
    example: ['events:create', 'events:update', 'major-events:read'],
    type: [String],
  })
  permissionSet!: string[];

  @ApiProperty({
    description: 'OIDC scopes granted to the authenticated session.',
    example: ['openid', 'profile', 'email', 'identity-document'],
    type: [String],
  })
  oidcScopes!: string[];

  @ApiProperty({
    description:
      'Set-backed OIDC scope lookup. If returned over HTTP, ensure it is serialized to an array or omit it from the public response shape.',
    example: ['openid', 'profile', 'email', 'identity-document'],
    type: [String],
  })
  oidcScopeSet!: string[];

  @ApiProperty({
    description: 'Legacy alias for oidcScopes.',
    example: ['openid', 'profile', 'email'],
    type: [String],
  })
  scopes!: string[];

  @ApiProperty({
    description:
      'Legacy alias for oidcScopeSet. If returned over HTTP, ensure it is serialized to an array or omit it from the public response shape.',
    example: ['openid', 'profile', 'email'],
    type: [String],
  })
  scopeSet!: string[];

  @ApiProperty({
    description: 'Original token claims retained for callers that need claims not normalized above.',
    type: 'object',
    additionalProperties: true,
    example: {
      iss: 'https://sso.cacic.dev.br/realms/cacic-sso',
      aud: 'cacic-event-manager',
      typ: 'Bearer',
    },
  })
  claims!: Record<string, unknown>;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly keycloakAuthService: KeycloakAuthService) {}

  @Get('login')
  @Public()
  @ApiOperation({
    summary: 'Create a Keycloak authorization URL',
    description:
      'Builds an authorization URL and stores the generated OIDC state in a short-lived HTTP-only cookie. This variant lets the caller decide how and when to redirect the browser.',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description:
      'Callback URI used later during the code exchange. Defaults to the backend callback URL derived from forwarded headers.',
    example: 'https://eventos.cacic.dev.br/api/auth/callback',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description:
      'Post-login destination stored in the server-side authorization state. Usually a safe same-origin frontend path.',
    example: '/app/events',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'Optional caller-provided state to associate with the generated authorization state.',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    description: 'Additional OIDC scopes to request from Keycloak.',
    example: 'openid profile email identity-document',
  })
  @ApiQuery({
    name: 'prompt',
    required: false,
    description: 'OIDC prompt value forwarded to Keycloak. Use prompt=none for silent SSO checks.',
    example: 'none',
  })
  @ApiOkResponse({
    type: LoginUrlResponseDto,
    description: 'Authorization URL generated and the HTTP-only auth state cookie has been set.',
  })
  async getLoginUrl(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query('redirectUri') redirectUri?: string,
    @Query('returnTo') returnTo?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: string,
    @Query('prompt') prompt?: string,
  ): Promise<{ authorizationUrl: string }> {
    const authorization = await this.keycloakAuthService.buildAuthorizationUrl({
      redirectUri: redirectUri ?? this.getCallbackRedirectUri(request),
      returnTo,
      state,
      scope,
      prompt,
    });
    this.setAuthorizationStateCookie(response, request, authorization.state);

    return {
      authorizationUrl: authorization.authorizationUrl,
    };
  }

  @Get('login/redirect')
  @Public()
  @ApiOperation({
    summary: 'Redirect the browser to Keycloak',
    description:
      'Builds the authorization request, stores the generated state in a short-lived HTTP-only cookie, and redirects directly to Keycloak.',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description:
      'Callback URI used later during the code exchange. Defaults to the backend callback URL derived from forwarded headers.',
    example: 'https://eventos.cacic.dev.br/api/auth/callback',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description:
      'Post-login destination stored in the server-side authorization state. Usually a safe same-origin frontend path.',
    example: '/app',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'Optional caller-provided state to associate with the generated authorization state.',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    description: 'Additional OIDC scopes to request from Keycloak.',
    example: 'openid profile email',
  })
  @ApiQuery({
    name: 'prompt',
    required: false,
    description: 'OIDC prompt value forwarded to Keycloak. For silent SSO checks, use prompt=none.',
    example: 'none',
  })
  @ApiResponse({
    status: 302,
    description: 'Browser redirected to the generated Keycloak authorization URL.',
  })
  async redirectToLogin(
    @Req() request: Request,
    @Res() response: Response,
    @Query('redirectUri') redirectUri?: string,
    @Query('returnTo') returnTo?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: string,
    @Query('prompt') prompt?: string,
  ): Promise<void> {
    const authorization = await this.keycloakAuthService.buildAuthorizationUrl({
      redirectUri: redirectUri ?? this.getCallbackRedirectUri(request),
      returnTo,
      state,
      scope,
      prompt,
    });
    this.setAuthorizationStateCookie(response, request, authorization.state);

    response.redirect(authorization.authorizationUrl);
  }

  @Get('callback')
  @Public()
  @ApiOperation({
    summary: 'Complete the authorization-code callback',
    description:
      'Validates the returned state against the HTTP-only state cookie, exchanges the authorization code for tokens, creates the server-side session, sets the session cookie, and redirects to the stored post-login destination.',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code returned by Keycloak. Required unless Keycloak returned an error.',
  })
  @ApiQuery({
    name: 'error',
    required: false,
    description:
      'OIDC error returned by Keycloak. When present, the request is redirected to the stored post-login destination without creating a session.',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description:
      'Redirect URI used for the token exchange. It must match the URI used to start the authorization request.',
    example: 'https://eventos.cacic.dev.br/api/auth/callback',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'OIDC state returned by Keycloak. Must match the auth state cookie.',
  })
  @ApiResponse({
    status: 302,
    description:
      'Browser redirected to the stored post-login destination. On success, the session cookie has been set first.',
  })
  @ApiBadRequestResponse({
    description:
      'Returned when the authorization code is missing, the state cookie is absent, the state query value is absent, or the state cannot be consumed.',
  })
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('redirectUri') redirectUri?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    const authorizationState = await this.consumeAuthorizationState(request, response, state);
    if (error) {
      response.redirect(this.keycloakAuthService.getPostLoginRedirectUri(authorizationState));
      return;
    }

    if (!code) {
      throw new BadRequestException('Missing authorization code.');
    }

    const tokenResponse = await this.keycloakAuthService.exchangeCodeForTokens(
      code,
      authorizationState,
      redirectUri ?? this.getCallbackRedirectUri(request),
    );
    const session = await this.keycloakAuthService.createSession(tokenResponse);

    response.cookie(AUTH_SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      expires: new Date(session.sessionExpiresAt),
      maxAge: this.resolveCookieMaxAge(session.sessionExpiresAt),
      path: '/',
    });

    response.redirect(this.keycloakAuthService.getPostLoginRedirectUri(authorizationState));
  }

  @Post('logout')
  @Public()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Clear the local session and prepare Keycloak logout',
    description:
      'Removes the local session when present, clears the session cookie, and builds the Keycloak logout response using explicit body tokens or the tokens stored for the current session.',
  })
  @ApiBody({
    type: LogoutDto,
    required: false,
    description:
      'Optional logout hints. When omitted, the controller attempts to use tokens associated with the current session cookie.',
  })
  @ApiOkResponse({
    description: 'Local session cleared and Keycloak logout payload generated by the auth service.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        logoutUrl: 'https://sso.cacic.dev.br/realms/cacic-sso/protocol/openid-connect/logout?...',
      },
    },
  })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() body?: LogoutDto) {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    const sessionLogoutInput = sessionId ? await this.keycloakAuthService.getSessionLogoutInput(sessionId) : null;

    if (sessionId) {
      await this.keycloakAuthService.clearSession(sessionId);
    }

    response.clearCookie(AUTH_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      path: '/',
    });

    return this.keycloakAuthService.logout({
      refreshToken: body?.refreshToken ?? sessionLogoutInput?.refreshToken,
      idTokenHint: body?.idTokenHint ?? sessionLogoutInput?.idTokenHint,
      postLogoutRedirectUri: body?.postLogoutRedirectUri,
    });
  }

  @Post('refresh')
  @Public()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Refresh the session tokens',
    description:
      'Uses the current session cookie to refresh the stored tokens and extends the session cookie to the updated server-side session expiration.',
  })
  @ApiOkResponse({
    type: RefreshSessionResponseDto,
    description: 'Session refreshed and the session cookie expiration updated.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when the session cookie is missing.',
  })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      throw new ForbiddenException('Missing session.');
    }

    const { expiresAt, sessionExpiresAt } = await this.keycloakAuthService.refreshSession(sessionId);

    response.cookie(AUTH_SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      expires: new Date(sessionExpiresAt),
      maxAge: this.resolveCookieMaxAge(sessionExpiresAt),
      path: '/',
    });

    return { expiresAt, sessionExpiresAt };
  }

  @Get('me')
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Read the authenticated identity',
    description:
      'Returns the identity resolved by the authentication layer for the current request, including normalized roles, permissions, scopes, and original claims.',
  })
  @ApiOkResponse({
    type: AuthenticatedUserResponseDto,
    description: 'Authenticated identity resolved for the current request.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when no authenticated identity was attached to the request.',
  })
  getMe(@Req() request: RequestWithUser) {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    return request.user;
  }

  @Post('permissions/evaluate')
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Evaluate permissions for the current access token',
    description:
      'Normalizes the requested permission list, evaluates it against the current access token through Keycloak, and returns only the permissions granted by the authorization server.',
  })
  @ApiBody({
    type: PermissionEvaluationRequestDto,
    description:
      'Permission identifiers to check. Values are trimmed; empty values are ignored; duplicates are removed.',
  })
  @ApiOkResponse({
    type: PermissionEvaluationResponseDto,
    description: 'Permission identifiers granted for the current access token.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when permissions is not an array or contains non-string values.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when no authenticated identity was attached to the request.',
  })
  async evaluatePermissions(@Req() request: RequestWithUser, @Body() body: PermissionEvaluationBody) {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const permissions = this.readPermissionList(body?.permissions);
    const accessToken = request.user.token;
    const grantedPermissions = await this.keycloakAuthService.evaluateAccessTokenPermissions(accessToken, permissions);

    return { permissions: grantedPermissions };
  }

  private readCookie(request: Request, name: string): string | null {
    const parsedCookie = (request as RequestWithCookies).cookies?.[name];
    if (typeof parsedCookie === 'string') {
      return parsedCookie;
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [cookieName, ...rest] = cookie.trim().split('=');
      if (cookieName !== name || rest.length === 0) {
        continue;
      }

      return decodeURIComponent(rest.join('='));
    }

    return null;
  }

  private resolveCookieMaxAge(expiresAt: number): number {
    return Math.max(expiresAt - Date.now(), 0);
  }

  private async consumeAuthorizationState(
    request: Request,
    response: Response,
    state?: string,
  ): Promise<Awaited<ReturnType<KeycloakAuthService['consumeAuthorizationState']>>> {
    const cookieState = this.readCookie(request, AUTH_STATE_COOKIE_NAME);
    this.clearAuthorizationStateCookie(response, request);

    if (!state || !cookieState || state !== cookieState) {
      throw new BadRequestException('Invalid authorization state.');
    }

    const authorizationState = await this.keycloakAuthService.consumeAuthorizationState(state);
    if (!authorizationState) {
      throw new BadRequestException('Invalid authorization state.');
    }

    return authorizationState;
  }

  private setAuthorizationStateCookie(response: Response, request: Request, state: string): void {
    response.cookie(AUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/callback',
    });
  }

  private clearAuthorizationStateCookie(response: Response, request: Request): void {
    response.clearCookie(AUTH_STATE_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      path: '/api/auth/callback',
    });
  }

  private getCallbackRedirectUri(request: Request): string {
    const protocol = this.readForwardedHeader(request, 'x-forwarded-proto')?.split(',')[0]?.trim();
    const host = this.readForwardedHeader(request, 'x-forwarded-host')?.split(',')[0]?.trim();

    const origin = `${protocol || request.protocol}://${host || request.get('host')}`;
    return new URL('/api/auth/callback', origin).toString();
  }

  private readForwardedHeader(request: Request, headerName: string): string | undefined {
    const value = request.headers[headerName];
    return Array.isArray(value) ? value[0] : value;
  }

  private readPermissionList(rawPermissions: unknown): string[] {
    if (!Array.isArray(rawPermissions)) {
      throw new BadRequestException('permissions must be an array.');
    }

    const permissions = new Set<string>();
    for (const permission of rawPermissions) {
      if (typeof permission !== 'string') {
        throw new BadRequestException('permissions must contain only strings.');
      }

      const normalizedPermission = permission.trim();
      if (normalizedPermission) {
        permissions.add(normalizedPermission);
      }
    }

    return [...permissions];
  }

  private isSecureRequest(request: Request): boolean {
    if (request.secure) {
      return true;
    }

    const forwardedProto = request.headers['x-forwarded-proto'];
    if (Array.isArray(forwardedProto)) {
      return forwardedProto[0] === 'https';
    }

    return forwardedProto === 'https';
  }
}
