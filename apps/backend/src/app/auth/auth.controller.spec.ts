import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AUTH_SESSION_COOKIE_NAME, AUTH_STATE_COOKIE_NAME } from './auth.constants';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { KeycloakAuthService } from './keycloak-auth.service';

describe('AuthController callback redirect validation', () => {
  const originalEnv = { ...process.env };
  let controller: AuthController;
  let keycloakAuthService: {
    buildAuthorizationUrl: jest.Mock;
    clearSession: jest.Mock;
    consumeAuthorizationState: jest.Mock;
    createSession: jest.Mock;
    exchangeCodeForTokens: jest.Mock;
    getPostLoginRedirectUri: jest.Mock;
    getSessionLogoutInput: jest.Mock;
    logout: jest.Mock;
    refreshSession: jest.Mock;
  };
  const authorizationPolicy = {
    evaluatePermissions: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
    jest.clearAllMocks();
    authorizationPolicy.evaluatePermissions.mockResolvedValue([]);
    process.env.KEYCLOAK_ALLOWED_CALLBACK_REDIRECT_ORIGINS = 'https://events.example.com';
    process.env.KEYCLOAK_ALLOWED_POST_LOGOUT_REDIRECT_ORIGINS = 'https://events.example.com';
    keycloakAuthService = {
      buildAuthorizationUrl: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://sso.example/auth',
        state: 'state-1',
      }),
      clearSession: jest.fn(),
      consumeAuthorizationState: jest.fn().mockResolvedValue({
        redirectUri: 'https://events.example.com/api/auth/callback',
        returnTo: '/admin/',
      }),
      createSession: jest.fn().mockResolvedValue({
        sessionId: 'session-id',
        expiresAt: Date.now() + 300_000,
        sessionExpiresAt: Date.now() + 600_000,
      }),
      exchangeCodeForTokens: jest.fn().mockResolvedValue({
        access_token: 'access-token',
      }),
      getPostLoginRedirectUri: jest.fn().mockReturnValue('/admin/'),
      getSessionLogoutInput: jest.fn(),
      logout: jest.fn().mockResolvedValue({
        logoutUrl: 'https://sso.example/logout',
      }),
      refreshSession: jest.fn().mockResolvedValue({
        expiresAt: Date.now() + 300_000,
        sessionExpiresAt: Date.now() + 600_000,
      }),
    };
    controller = new AuthController(keycloakAuthService as KeycloakAuthService, authorizationPolicy as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('accepts only allowlisted callback redirect origins and paths', async () => {
    const response = responseFixture();

    await expect(
      controller.getLoginUrl(
        requestFixture(),
        response as never,
        'https://events.example.com/api/auth/callback?unexpected=1',
      ),
    ).resolves.toEqual({ authorizationUrl: 'https://sso.example/auth' });

    expect(keycloakAuthService.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://events.example.com/api/auth/callback',
      }),
    );
  });

  it('rejects unallowlisted callback redirect origins', async () => {
    await expect(
      controller.getLoginUrl(requestFixture(), responseFixture() as never, 'https://evil.example/api/auth/callback'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects forwarded-host callback redirects outside the allowlist', async () => {
    await expect(
      controller.getLoginUrl(
        requestFixture({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'evil.example',
        }),
        responseFixture() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores malformed allowlist environment entries', async () => {
    process.env.KEYCLOAK_ALLOWED_CALLBACK_REDIRECT_ORIGINS = 'not a url,https://events.example.com';
    controller = new AuthController(keycloakAuthService as KeycloakAuthService, authorizationPolicy as never);

    await expect(
      controller.getLoginUrl(
        requestFixture(),
        responseFixture() as never,
        'https://events.example.com/api/auth/callback',
      ),
    ).resolves.toEqual({ authorizationUrl: 'https://sso.example/auth' });
  });

  it('sets an HTTP-only authorization state cookie for login redirects', async () => {
    const response = responseFixture();

    await controller.redirectToLogin(
      requestFixture({
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'events.example.com',
      }),
      response as never,
      undefined,
      '/admin/events',
      'caller-state',
      'openid email',
      'login',
    );

    expect(keycloakAuthService.buildAuthorizationUrl).toHaveBeenCalledWith({
      redirectUri: 'https://events.example.com/api/auth/callback',
      returnTo: '/admin/events',
      state: 'caller-state',
      scope: 'openid email',
      prompt: 'login',
    });
    expect(response.cookie).toHaveBeenCalledWith(AUTH_STATE_COOKIE_NAME, 'state-1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/callback',
    });
    expect(response.redirect).toHaveBeenCalledWith('https://sso.example/auth');
  });

  it('requires the callback state to match the HTTP-only state cookie before token exchange', async () => {
    const response = responseFixture();

    await expect(
      controller.callback(
        requestFixture({
          cookie: `${AUTH_STATE_COOKIE_NAME}=state-cookie`,
        }),
        response as never,
        'code-1',
        undefined,
        'https://events.example.com/api/auth/callback',
        'state-query',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(response.clearCookie).toHaveBeenCalledWith(AUTH_STATE_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth/callback',
    });
    expect(keycloakAuthService.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(keycloakAuthService.createSession).not.toHaveBeenCalled();
  });

  it('creates the secure session cookie only after a valid callback state and token exchange', async () => {
    const response = responseFixture();

    await controller.callback(
      requestFixture({
        cookie: `${AUTH_STATE_COOKIE_NAME}=state-1`,
        'x-forwarded-proto': 'https',
      }),
      response as never,
      'code-1',
      undefined,
      'https://events.example.com/api/auth/callback?ignored=1',
      'state-1',
    );

    expect(keycloakAuthService.consumeAuthorizationState).toHaveBeenCalledWith('state-1');
    expect(keycloakAuthService.exchangeCodeForTokens).toHaveBeenCalledWith(
      'code-1',
      {
        redirectUri: 'https://events.example.com/api/auth/callback',
        returnTo: '/admin/',
      },
      'https://events.example.com/api/auth/callback',
    );
    expect(response.cookie).toHaveBeenCalledWith(AUTH_SESSION_COOKIE_NAME, 'session-id', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      expires: new Date(Date.now() + 600_000),
      maxAge: 600_000,
      path: '/',
    });
    expect(response.redirect).toHaveBeenCalledWith('/admin/');
  });

  it('normalizes allowlisted post-logout redirect URIs', async () => {
    await expect(
      controller.logout(
        requestFixture(),
        responseFixture() as never,
        {
          postLogoutRedirectUri: 'https://events.example.com/app?loggedOut=1#token',
        },
      ),
    ).resolves.toEqual({ logoutUrl: 'https://sso.example/logout' });

    expect(keycloakAuthService.logout).toHaveBeenCalledWith(
      expect.objectContaining({
        postLogoutRedirectUri: 'https://events.example.com/app?loggedOut=1',
      }),
    );
  });

  it('rejects unallowlisted post-logout redirect URI origins', async () => {
    await expect(
      controller.logout(
        requestFixture(),
        responseFixture() as never,
        {
          postLogoutRedirectUri: 'https://evil.example/app',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(keycloakAuthService.logout).not.toHaveBeenCalled();
  });

  it('refreshes only when a session cookie is present and preserves secure cookie attributes', async () => {
    const response = responseFixture();

    await expect(
      controller.refresh(
        requestFixture({
          cookie: `${AUTH_SESSION_COOKIE_NAME}=session%20id`,
          'x-forwarded-proto': 'https',
        }),
        response as never,
      ),
    ).resolves.toEqual({
      expiresAt: Date.now() + 300_000,
      sessionExpiresAt: Date.now() + 600_000,
    });

    expect(keycloakAuthService.refreshSession).toHaveBeenCalledWith('session id');
    expect(response.cookie).toHaveBeenCalledWith(AUTH_SESSION_COOKIE_NAME, 'session id', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      expires: new Date(Date.now() + 600_000),
      maxAge: 600_000,
      path: '/',
    });
  });

  it('clears the local session and CACiC tracking cookies during logout', async () => {
    keycloakAuthService.getSessionLogoutInput.mockResolvedValue({
      refreshToken: 'stored-refresh',
      idTokenHint: 'stored-id-token',
    });
    const response = responseFixture();

    await controller.logout(
      requestFixture({
        cookie: `${AUTH_SESSION_COOKIE_NAME}=session-id`,
        'x-forwarded-proto': 'https',
      }),
      response as never,
      {
        postLogoutRedirectUri: 'https://events.example.com/app',
      },
    );

    expect(keycloakAuthService.getSessionLogoutInput).toHaveBeenCalledWith('session-id');
    expect(keycloakAuthService.clearSession).toHaveBeenCalledWith('session-id');
    expect(keycloakAuthService.logout).toHaveBeenCalledWith({
      refreshToken: 'stored-refresh',
      idTokenHint: 'stored-id-token',
      postLogoutRedirectUri: 'https://events.example.com/app',
    });
    expect(response.clearCookie).toHaveBeenCalledWith(AUTH_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
    expect(response.clearCookie).toHaveBeenCalledWith(
      'cacic-analytics-id',
      expect.objectContaining({
        domain: '.cacic.dev.br',
        sameSite: 'lax',
        secure: true,
        path: '/',
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'cacic-analytics-id',
      expect.objectContaining({
        sameSite: 'lax',
        secure: true,
        path: '/',
      }),
    );
  });

  it('returns only granted normalized permissions for the authenticated user', async () => {
    const user = authenticatedUserFixture();
    authorizationPolicy.evaluatePermissions.mockResolvedValue(['event#create']);

    await expect(
      controller.evaluatePermissions(
        {
          user,
        } as never,
        {
          permissions: [' event#create ', '', 'event#create', 'major-event#read'],
        },
      ),
    ).resolves.toEqual({
      permissions: ['event#create'],
    });

    expect(authorizationPolicy.evaluatePermissions).toHaveBeenCalledWith(user, [
      'event#create',
      'major-event#read',
    ]);
  });

  it('rejects malformed permission evaluation payloads before policy evaluation', async () => {
    await expect(
      controller.evaluatePermissions(
        {
          user: authenticatedUserFixture(),
        } as never,
        {
          permissions: ['event#create', 123],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(authorizationPolicy.evaluatePermissions).not.toHaveBeenCalled();
  });
});

function requestFixture(headers: Record<string, string> = {}) {
  return {
    protocol: 'http',
    headers,
    get: (name: string) => (name.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
  } as never;
}

function responseFixture() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
}

function authenticatedUserFixture(): AuthenticatedUser {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'student',
    email: 'student@example.edu',
    token: 'token',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: ['openid'],
    oidcScopeSet: new Set(['openid']),
    scopes: ['openid'],
    scopeSet: new Set(['openid']),
    claims: {
      is_onboarded: true,
    },
  };
}
