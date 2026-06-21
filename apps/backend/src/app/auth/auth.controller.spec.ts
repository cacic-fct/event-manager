import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { KeycloakAuthService } from './keycloak-auth.service';

describe('AuthController callback redirect validation', () => {
  const originalEnv = { ...process.env };
  let controller: AuthController;
  let keycloakAuthService: Pick<KeycloakAuthService, 'buildAuthorizationUrl' | 'clearSession' | 'getSessionLogoutInput' | 'logout'>;
  const authorizationPolicy = {
    evaluatePermissions: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    process.env.KEYCLOAK_ALLOWED_CALLBACK_REDIRECT_ORIGINS = 'https://events.example.com';
    process.env.KEYCLOAK_ALLOWED_POST_LOGOUT_REDIRECT_ORIGINS = 'https://events.example.com';
    keycloakAuthService = {
      buildAuthorizationUrl: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://sso.example/auth',
        state: 'state-1',
      }),
      clearSession: jest.fn(),
      getSessionLogoutInput: jest.fn(),
      logout: jest.fn().mockResolvedValue({
        logoutUrl: 'https://sso.example/logout',
      }),
    };
    controller = new AuthController(keycloakAuthService as KeycloakAuthService, authorizationPolicy as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts only allowlisted callback redirect origins and paths', async () => {
    const response = {
      cookie: jest.fn(),
    };

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
      controller.getLoginUrl(requestFixture(), { cookie: jest.fn() } as never, 'https://evil.example/api/auth/callback'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects forwarded-host callback redirects outside the allowlist', async () => {
    await expect(
      controller.getLoginUrl(
        requestFixture({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'evil.example',
        }),
        { cookie: jest.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores malformed allowlist environment entries', async () => {
    process.env.KEYCLOAK_ALLOWED_CALLBACK_REDIRECT_ORIGINS = 'not a url,https://events.example.com';
    controller = new AuthController(keycloakAuthService as KeycloakAuthService, authorizationPolicy as never);

    await expect(
      controller.getLoginUrl(
        requestFixture(),
        { cookie: jest.fn() } as never,
        'https://events.example.com/api/auth/callback',
      ),
    ).resolves.toEqual({ authorizationUrl: 'https://sso.example/auth' });
  });

  it('normalizes allowlisted post-logout redirect URIs', async () => {
    await expect(
      controller.logout(
        requestFixture(),
        { clearCookie: jest.fn() } as never,
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
        { clearCookie: jest.fn() } as never,
        {
          postLogoutRedirectUri: 'https://evil.example/app',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(keycloakAuthService.logout).not.toHaveBeenCalled();
  });
});

function requestFixture(headers: Record<string, string> = {}) {
  return {
    protocol: 'http',
    headers,
    get: (name: string) => (name.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
  } as never;
}
