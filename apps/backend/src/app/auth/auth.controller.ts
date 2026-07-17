import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import { AllowNonOnboarded } from './decorators/allow-non-onboarded.decorator';
import { Public } from './decorators/public.decorator';
import { LogoutDto } from './dto/logout.dto';
import { KeycloakAuthService } from './keycloak-auth.service';
import { PublicAuthenticatedUser, toPublicAuthenticatedUser } from './public-authenticated-user';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { clearCacicTrackingCookies, isSecureAuthRequest, readAuthCookie, resolveCookieMaxAge } from './auth-cookie-utils';
import { getAuthorizationErrorPayload, getAuthorizationErrorRedirectUri } from './auth-error-redirect';
import { isPasswordLoginEnabled } from './auth-password-login';
import { readPermissionList } from './auth-permission-input';
import { createAllowedCallbackRedirectOrigins, createAllowedPostLogoutRedirectOrigins, resolveCallbackRedirectUri, resolvePostLogoutRedirectUri } from './auth-redirect-utils';
import { consumeAuthorizationState, setAuthorizationStateCookie } from './auth-authorization-state';
import { getFailedAuthorizationRedirectUri } from './auth-post-login-redirect';
import {
  AuthenticatedUserResponseDto,
  LoginUrlResponseDto,
  PasswordLoginRequestDto,
  PasswordLoginResponseDto,
  PermissionEvaluationRequestDto,
  PermissionEvaluationResponseDto,
  RefreshSessionResponseDto,
} from './auth.swagger-dtos';
import { AuthenticatedRequest, PermissionEvaluationBody } from './auth-controller.types';

const INVALID_AUTHORIZATION_STATE_MESSAGE = 'Invalid authorization state.';

@ApiTags('Authentication')
@UsePipes(REST_VALIDATION_PIPE)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly allowedCallbackRedirectOrigins = createAllowedCallbackRedirectOrigins(process.env, this.logger);
  private readonly allowedPostLogoutRedirectOrigins = createAllowedPostLogoutRedirectOrigins(process.env, this.logger);

  constructor(
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

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
    example: 'https://eventos.cacic.com.br/api/auth/callback',
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
    const callbackRedirectUri = resolveCallbackRedirectUri(request, redirectUri, this.allowedCallbackRedirectOrigins);
    const authorization = await this.keycloakAuthService.buildAuthorizationUrl({
      redirectUri: callbackRedirectUri,
      returnTo,
      state,
      scope,
      prompt,
    });
    setAuthorizationStateCookie(response, request, authorization.state);

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
    example: 'https://eventos.cacic.com.br/api/auth/callback',
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
    const callbackRedirectUri = resolveCallbackRedirectUri(request, redirectUri, this.allowedCallbackRedirectOrigins);
    const authorization = await this.keycloakAuthService.buildAuthorizationUrl({
      redirectUri: callbackRedirectUri,
      returnTo,
      state,
      scope,
      prompt,
    });
    setAuthorizationStateCookie(response, request, authorization.state);

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
    example: 'https://eventos.cacic.com.br/api/auth/callback',
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
    const authorizationState = await consumeAuthorizationState(this.keycloakAuthService, request, response, state);
    if (!authorizationState) {
      response.redirect(
        getAuthorizationErrorRedirectUri({
          message: INVALID_AUTHORIZATION_STATE_MESSAGE,
          error: 'Bad Request',
          statusCode: 400,
        }),
      );
      return;
    }

    if (error) {
      response.redirect(getFailedAuthorizationRedirectUri(this.keycloakAuthService, authorizationState));
      return;
    }

    if (!code) {
      response.redirect(
        getAuthorizationErrorRedirectUri({
          message: 'Missing authorization code.',
          error: 'Bad Request',
          statusCode: 400,
        }),
      );
      return;
    }

    let session: Awaited<ReturnType<KeycloakAuthService['createSession']>>;
    try {
      const tokenResponse = await this.keycloakAuthService.exchangeCodeForTokens(
        code,
        authorizationState,
        resolveCallbackRedirectUri(request, redirectUri, this.allowedCallbackRedirectOrigins),
      );
      session = await this.keycloakAuthService.createSession(tokenResponse);
    } catch (error: unknown) {
      response.redirect(getAuthorizationErrorRedirectUri(getAuthorizationErrorPayload(error)));
      return;
    }

    response.cookie(AUTH_SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureAuthRequest(request),
      expires: new Date(session.sessionExpiresAt),
      maxAge: resolveCookieMaxAge(session.sessionExpiresAt),
      path: '/',
    });

    response.redirect(this.keycloakAuthService.getPostLoginRedirectUri(authorizationState));
  }

  @Post('password-login')
  @Public()
  @ApiOperation({
    summary: 'Development password login',
    description:
      'Authenticates with email and password through Keycloak direct access grants. Enabled by default outside production and controlled by KEYCLOAK_PASSWORD_LOGIN_ENABLED.',
  })
  @ApiBody({
    type: PasswordLoginRequestDto,
    description: 'Development login credentials.',
  })
  @ApiOkResponse({
    type: PasswordLoginResponseDto,
    description: 'Session created from password credentials.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when password login is disabled.',
  })
  async passwordLogin(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: PasswordLoginRequestDto,
  ): Promise<PasswordLoginResponseDto> {
    if (!isPasswordLoginEnabled()) {
      if (process.env.NODE_ENV === 'production') {
        throw new NotFoundException();
      }

      throw new ForbiddenException('Password login is disabled.');
    }

    const tokenResponse = await this.keycloakAuthService.exchangePasswordForTokens(
      body.email.trim().toLowerCase(),
      body.password,
    );
    const session = await this.keycloakAuthService.createSession(tokenResponse);

    response.cookie(AUTH_SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureAuthRequest(request),
      expires: new Date(session.sessionExpiresAt),
      maxAge: resolveCookieMaxAge(session.sessionExpiresAt),
      path: '/',
    });

    const user = await this.keycloakAuthService.authenticateSession(session.sessionId);

    return {
      expiresAt: session.expiresAt,
      sessionExpiresAt: session.sessionExpiresAt,
      user: toPublicAuthenticatedUser(user),
    };
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
        logoutUrl: 'https://sso.cacic.com.br/realms/cacic-sso/protocol/openid-connect/logout?...',
      },
    },
  })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() body?: LogoutDto) {
    const sessionId = readAuthCookie(request, AUTH_SESSION_COOKIE_NAME);
    const sessionLogoutInput = sessionId ? await this.keycloakAuthService.getSessionLogoutInput(sessionId) : null;

    if (sessionId) {
      await this.keycloakAuthService.clearSession(sessionId);
    }

    response.clearCookie(AUTH_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureAuthRequest(request),
      path: '/',
    });
    clearCacicTrackingCookies(response, request);

    return this.keycloakAuthService.logout({
      refreshToken: body?.refreshToken ?? sessionLogoutInput?.refreshToken,
      idTokenHint: body?.idTokenHint ?? sessionLogoutInput?.idTokenHint,
      postLogoutRedirectUri: resolvePostLogoutRedirectUri(body?.postLogoutRedirectUri, this.allowedPostLogoutRedirectOrigins),
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
    const sessionId = readAuthCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      throw new ForbiddenException('Missing session.');
    }

    const { expiresAt, sessionExpiresAt } = await this.keycloakAuthService.refreshSession(sessionId);

    response.cookie(AUTH_SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureAuthRequest(request),
      expires: new Date(sessionExpiresAt),
      maxAge: resolveCookieMaxAge(sessionExpiresAt),
      path: '/',
    });

    return { expiresAt, sessionExpiresAt };
  }

  @Get('me')
  @AllowNonOnboarded()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Read the authenticated identity',
    description:
      'Returns the identity resolved by the authentication layer for the current request, including normalized roles, permissions, scopes, and public allowlisted claims.',
  })
  @ApiOkResponse({
    type: AuthenticatedUserResponseDto,
    description: 'Authenticated identity resolved for the current request.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when no authenticated identity was attached to the request.',
  })
  getMe(@Req() request: AuthenticatedRequest): PublicAuthenticatedUser {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    return toPublicAuthenticatedUser(request.user);
  }

  @Post('permissions/evaluate')
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Evaluate Event Manager permissions for the current identity',
    description:
      'Normalizes the requested permission list, evaluates it against Event Manager DB-backed grants, and returns only the permissions granted to the current identity.',
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
  async evaluatePermissions(@Req() request: AuthenticatedRequest, @Body() body: PermissionEvaluationBody) {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const permissions = readPermissionList(body?.permissions);
    const grantedPermissions = await this.authorizationPolicy.evaluatePermissions(request.user, permissions);

    return { permissions: grantedPermissions };
  }

}
