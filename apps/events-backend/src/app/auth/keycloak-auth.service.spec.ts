import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthorizationStateService } from './authorization-state.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakAuthService', () => {
  const originalEnv = { ...process.env };
  let sessions: ReturnType<typeof createSessionStoreMock>;
  let authorizationState: Pick<
    jest.Mocked<AuthorizationStateService>,
    'build' | 'getAuthorizationRedirectUri' | 'getPostLoginRedirectUri'
  >;
  let service: KeycloakAuthService;
  let userClaimSync: Pick<jest.Mocked<AuthenticatedUserSyncService>, 'syncLoginClaims'>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    jest.clearAllMocks();
    process.env.KEYCLOAK_REALM_URL = 'https://keycloak.example/realms/cacic/';
    process.env.KEYCLOAK_CLIENT_ID = 'event-manager';
    process.env.KEYCLOAK_CLIENT_SECRET = 'secret';
    process.env.KEYCLOAK_REDIRECT_URI = 'https://app.example/api/auth/callback';
    process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI = 'https://app.example/logout';
    process.env.KEYCLOAK_INTROSPECTION_CACHE_TTL_MS = '5000';
    sessions = createSessionStoreMock();
    authorizationState = {
      build: jest.fn().mockReturnValue('encoded-state'),
      getAuthorizationRedirectUri: jest.fn().mockReturnValue(undefined),
      getPostLoginRedirectUri: jest.fn().mockReturnValue('/after-login'),
    };
    mockedAxios.isAxiosError.mockReturnValue(false);
    userClaimSync = {
      syncLoginClaims: jest.fn().mockResolvedValue(undefined),
    };
    service = new KeycloakAuthService(
      sessions as unknown as AuthSessionStoreService,
      authorizationState as unknown as AuthorizationStateService,
      userClaimSync as unknown as AuthenticatedUserSyncService,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('builds authorization URLs with normalized realm URL and state metadata', () => {
    const url = new URL(
      service.buildAuthorizationUrl({
        redirectUri: 'https://app.example/custom-callback',
        returnTo: '/dashboard',
        state: 'caller-state',
        prompt: 'login',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://keycloak.example/realms/cacic/protocol/openid-connect/auth');
    expect(url.searchParams.get('client_id')).toBe('event-manager');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/custom-callback');
    expect(url.searchParams.get('state')).toBe('encoded-state');
    expect(url.searchParams.get('prompt')).toBe('login');
    expect(authorizationState.build).toHaveBeenCalledWith({
      redirectUri: 'https://app.example/custom-callback',
      returnTo: '/dashboard',
      state: 'caller-state',
    });
  });

  it('exchanges, refreshes, and revokes tokens through Keycloak form endpoints', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'access-token' } })
      .mockResolvedValueOnce({ data: { access_token: 'refreshed-token' } })
      .mockResolvedValueOnce({ data: {} });
    authorizationState.getAuthorizationRedirectUri.mockReturnValue('https://app.example/state-callback');

    await expect(service.exchangeCodeForTokens('code-1', 'state-1')).resolves.toEqual({
      access_token: 'access-token',
    });
    await expect(service.refreshAccessToken('refresh-token')).resolves.toEqual({
      access_token: 'refreshed-token',
    });
    await expect(
      service.logout({
        refreshToken: 'refresh-token',
        idTokenHint: 'id-token',
      }),
    ).resolves.toEqual({
      refreshTokenRevoked: true,
      logoutUrl:
        'https://keycloak.example/realms/cacic/protocol/openid-connect/logout?client_id=event-manager&id_token_hint=id-token&post_logout_redirect_uri=https%3A%2F%2Fapp.example%2Flogout',
    });

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'https://keycloak.example/realms/cacic/protocol/openid-connect/token',
      expect.stringContaining('grant_type=authorization_code'),
      expect.any(Object),
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      'https://keycloak.example/realms/cacic/protocol/openid-connect/revoke',
      expect.stringContaining('token_type_hint=refresh_token'),
      expect.any(Object),
    );
  });

  it('wraps token exchange and refresh failures as unauthorized responses', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } });
    await expect(service.exchangeCodeForTokens('bad-code')).rejects.toBeInstanceOf(UnauthorizedException);

    mockedAxios.post.mockRejectedValueOnce(new Error('refresh failed'));
    await expect(service.refreshAccessToken('bad-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates, updates, refreshes, clears, and reads logout data for sessions', async () => {
    const accessToken = jwt({ exp: 1_800_000_000, sub: 'user-1', unesp_role: ['aluno-graduacao'] });
    const refreshToken = jwt({ exp: 1_900_000_000 });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        active: true,
      },
    });

    const created = await service.createSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: 'id-token',
      expires_in: 120,
      refresh_expires_in: 300,
    });

    expect(created.expiresAt).toBe(Date.now() + 120_000);
    expect(created.sessionExpiresAt).toBe(Date.now() + 300_000);
    expect(sessions.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        accessToken,
        refreshToken,
        idTokenHint: 'id-token',
      }),
    );
    expect(userClaimSync.syncLoginClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        token: accessToken,
      }),
    );

    const sessionId = sessions.set.mock.calls[0][0] as string;
    sessions.get.mockResolvedValue({
      accessToken,
      refreshToken,
      idTokenHint: 'id-token',
      accessTokenExpiresAt: Date.now() - 1,
      sessionExpiresAt: Date.now() + 300_000,
    });
    await expect(
      service.updateSession(sessionId, {
        access_token: jwt({ exp: 1_800_000_100 }),
      }),
    ).resolves.toEqual({
      expiresAt: 1_800_000_100_000,
      sessionExpiresAt: Date.now() + 300_000,
    });

    sessions.get.mockReset();
    sessions.get
      .mockResolvedValueOnce({
        accessToken,
        refreshToken,
        idTokenHint: 'id-token',
        accessTokenExpiresAt: Date.now() - 1,
        sessionExpiresAt: Date.now() + 300_000,
      })
      .mockResolvedValueOnce({
        accessToken,
        refreshToken,
        idTokenHint: 'id-token',
        accessTokenExpiresAt: Date.now() - 1,
        sessionExpiresAt: Date.now() + 300_000,
      })
      .mockResolvedValueOnce({
        accessToken: jwt({ exp: 1_800_000_200 }),
        refreshToken,
        idTokenHint: 'id-token',
        accessTokenExpiresAt: 1_800_000_200_000,
        sessionExpiresAt: Date.now() + 300_000,
      });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: jwt({ exp: 1_800_000_200 }),
        refresh_token: refreshToken,
      },
    });
    await expect(service.refreshSession(sessionId)).resolves.toEqual({
      expiresAt: 1_800_000_200_000,
      sessionExpiresAt: Date.now() + 300_000,
    });

    sessions.get.mockResolvedValue({
      refreshToken,
      idTokenHint: 'id-token',
    });
    await expect(service.getSessionLogoutInput(sessionId)).resolves.toEqual({
      refreshToken,
      idTokenHint: 'id-token',
    });
    await service.clearSession(sessionId);
    expect(sessions.delete).toHaveBeenCalledWith(sessionId);
  });

  it('authenticates tokens, caches principals, and evaluates missing permissions', async () => {
    const accessToken = jwt({
      sub: 'user-1',
      preferred_username: 'ada',
      email: 'ada@example.com',
      exp: 1_800_000_000,
      scope: 'openid email',
      realm_access: {
        roles: ['admin'],
      },
      authorization: {
        permissions: [{ rsname: 'event', scopes: ['read'] }],
      },
    });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        active: true,
        permissions: [{ rsname: 'event', scopes: ['edit'] }],
      },
    });
    mockedAxios.get.mockResolvedValue({
      data: {
        sub: 'user-1',
        preferred_username: 'ada',
      },
    });
    mockedAxios.post.mockResolvedValueOnce({
      data: [{ rsname: 'certificate', scopes: ['edit'] }],
    });

    const principal = await service.authenticateAccessToken(accessToken, ['admin', 'event#read']);
    expect(principal.sub).toBe('user-1');
    expect(principal.roleSet.has('admin')).toBe(true);
    expect(principal.permissionSet.has('event#read')).toBe(true);

    await expect(service.evaluateAccessTokenPermissions(accessToken, ['certificate#edit'])).resolves.toEqual([
      'certificate#edit',
    ]);
    await service.authenticateAccessToken(accessToken, ['certificate#edit']);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive tokens and forbidden role or permission requirements', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { active: false } });
    await expect(service.authenticateAccessToken(jwt({ sub: 'inactive-user' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    mockedAxios.post.mockResolvedValueOnce({ data: { active: true } }).mockResolvedValueOnce({ data: [] });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        sub: 'user-1',
        realm_access: {
          roles: ['user'],
        },
      },
    });

    await expect(service.authenticateAccessToken(jwt({ sub: 'user-1' }), ['admin', 'event#edit'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('authenticates sessions and retries with a refreshed token after unauthorized token validation', async () => {
    const expiredAccessToken = jwt({ sub: 'user-1', exp: 1 });
    const freshAccessToken = jwt({
      sub: 'user-1',
      exp: 1_800_000_000,
      realm_access: { roles: ['admin'] },
    });
    sessions.get
      .mockResolvedValueOnce({
        accessToken: expiredAccessToken,
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        sessionExpiresAt: Date.now() + 300_000,
      })
      .mockResolvedValueOnce({
        accessToken: expiredAccessToken,
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        sessionExpiresAt: Date.now() + 300_000,
      })
      .mockResolvedValueOnce({
        accessToken: freshAccessToken,
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: 1_800_000_000_000,
        sessionExpiresAt: Date.now() + 300_000,
      });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { active: false } })
      .mockResolvedValueOnce({
        data: {
          access_token: freshAccessToken,
          refresh_token: 'refresh-token',
        },
      })
      .mockResolvedValueOnce({ data: { active: true } });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        sub: 'user-1',
        realm_access: { roles: ['admin'] },
      },
    });

    await expect(service.authenticateSession('session-1', ['admin'])).resolves.toEqual(
      expect.objectContaining({
        sub: 'user-1',
      }),
    );
  });

  it('asserts machine-to-machine service-account requirements', () => {
    process.env.KEYCLOAK_M2M_AUDIENCE = 'event-manager';
    process.env.KEYCLOAK_M2M_ALLOWED_CLIENTS = 'worker-client';

    const principal = principalFixture({
      preferredUsername: 'service-account-worker-client',
      roles: ['sync'],
      claims: {
        aud: ['event-manager'],
        azp: 'worker-client',
      },
    });

    expect(service.assertMachineToMachinePrincipal(principal, { requiredRoles: ['sync'] })).toBe(principal);
    expect(() => service.assertMachineToMachinePrincipal(undefined)).toThrow(UnauthorizedException);
    expect(() =>
      service.assertMachineToMachinePrincipal(
        principalFixture({
          preferredUsername: 'regular-user',
          claims: {},
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertMachineToMachinePrincipal(
        principalFixture({
          preferredUsername: 'service-account-other',
          claims: { aud: 'other-audience', azp: 'worker-client' },
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertMachineToMachinePrincipal(
        principalFixture({
          preferredUsername: 'service-account-other',
          claims: { aud: ['event-manager'], azp: 'unknown-client' },
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => service.assertMachineToMachinePrincipal(principal, { requiredRoles: ['missing'] })).toThrow(
      ForbiddenException,
    );
  });

  it('delegates post-login redirect lookup to the authorization state service', () => {
    expect(service.getPostLoginRedirectUri('state-1')).toBe('/after-login');
    expect(authorizationState.getPostLoginRedirectUri).toHaveBeenCalledWith('state-1');
  });
});

function createSessionStoreMock() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    acquireRefreshLock: jest.fn().mockResolvedValue(true),
    waitForRefreshLockRelease: jest.fn().mockResolvedValue(undefined),
    releaseRefreshLock: jest.fn().mockResolvedValue(undefined),
  };
}

function jwt(payload: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function principalFixture(overrides: Record<string, unknown> = {}) {
  const roles = (overrides['roles'] as string[] | undefined) ?? [];
  const permissions = (overrides['permissions'] as string[] | undefined) ?? [];

  return {
    realm_access: { roles },
    sub: 'service-account',
    preferredUsername: 'service-account-worker-client',
    email: undefined,
    token: 'token',
    roles,
    roleSet: new Set(roles),
    permissions,
    permissionSet: new Set(permissions),
    oidcScopes: [],
    oidcScopeSet: new Set<string>(),
    scopes: [],
    scopeSet: new Set<string>(),
    claims: {},
    ...overrides,
  };
}
