import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { LogoutDto } from './dto/logout.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { KeycloakAuthService } from './keycloak-auth.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

type PermissionEvaluationBody = {
  permissions?: unknown;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly keycloakAuthService: KeycloakAuthService) {}

  @Get('login')
  @Public()
  getLoginUrl(
    @Query('redirectUri') redirectUri?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: string,
    @Query('prompt') prompt?: string,
  ) {
    return {
      authorizationUrl: this.keycloakAuthService.buildAuthorizationUrl({
        redirectUri,
        state,
        scope,
        prompt,
      }),
    };
  }

  @Get('login/redirect')
  @Public()
  redirectToLogin(
    @Res() response: Response,
    @Query('redirectUri') redirectUri?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: string,
    @Query('prompt') prompt?: string,
  ): void {
    const authorizationUrl = this.keycloakAuthService.buildAuthorizationUrl({
      redirectUri,
      state,
      scope,
      prompt,
    });

    response.redirect(authorizationUrl);
  }

  @Get('callback')
  @Public()
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('redirectUri') redirectUri?: string,
  ): Promise<void> {
    if (error) {
      response.redirect(this.keycloakAuthService.getPostLoginRedirectUri());
      return;
    }

    if (!code) {
      throw new BadRequestException('Missing authorization code.');
    }

    const tokenResponse = await this.keycloakAuthService.exchangeCodeForTokens(
      code,
      redirectUri,
    );
    const session = this.keycloakAuthService.createSession(tokenResponse);

    response.cookie(AUTH_SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      expires: new Date(session.sessionExpiresAt),
      path: '/',
    });

    response.redirect(this.keycloakAuthService.getPostLoginRedirectUri());
  }

  @Post('logout')
  @Public()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body?: LogoutDto,
  ) {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    const sessionLogoutInput = sessionId
      ? this.keycloakAuthService.getSessionLogoutInput(sessionId)
      : null;

    if (sessionId) {
      this.keycloakAuthService.clearSession(sessionId);
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
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      throw new ForbiddenException('Missing session.');
    }

    const sessionLogoutInput =
      this.keycloakAuthService.getSessionLogoutInput(sessionId);
    if (!sessionLogoutInput?.refreshToken) {
      throw new ForbiddenException('Missing refresh token in session.');
    }

    const tokenResponse = await this.keycloakAuthService.refreshAccessToken(
      sessionLogoutInput.refreshToken,
    );
    const { expiresAt, sessionExpiresAt } =
      this.keycloakAuthService.updateSession(sessionId, tokenResponse);

    response.cookie(AUTH_SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(request),
      expires: new Date(sessionExpiresAt),
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
  async evaluatePermissions(
    @Req() request: RequestWithUser,
    @Body() body: PermissionEvaluationBody,
  ) {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const permissions = this.readPermissionList(body?.permissions);
    const accessToken = request.user.token;
    const grantedPermissions =
      await this.keycloakAuthService.evaluateAccessTokenPermissions(
        accessToken,
        permissions,
      );

    return { permissions: grantedPermissions };
  }

  private readCookie(request: Request, name: string): string | null {
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
