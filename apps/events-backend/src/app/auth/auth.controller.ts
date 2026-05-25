import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, Res } from '@nestjs/common';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly keycloakAuthService: KeycloakAuthService) {}

  @Get('login')
  @Public()
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
  getMe(@Req() request: RequestWithUser) {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    return request.user;
  }

  @Post('permissions/evaluate')
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
