import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_NON_ONBOARDED_KEY, IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from '../auth.constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../keycloak-auth.service';
import { KeycloakScopeGuard } from './keycloak-scope.guard';

type RequestFixture = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  cookies?: Record<string, unknown>;
  user?: AuthenticatedUser;
};

describe('KeycloakScopeGuard onboarding enforcement', () => {
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let keycloakAuthService: {
    authenticateAccessToken: jest.Mock;
    authenticateSession: jest.Mock;
  };
  let guard: KeycloakScopeGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) {
          return false;
        }

        if (key === REQUIRED_ROLES_KEY) {
          return undefined;
        }

        if (key === ALLOW_NON_ONBOARDED_KEY) {
          return false;
        }

        return undefined;
      }),
    };
    keycloakAuthService = {
      authenticateAccessToken: jest.fn(),
      authenticateSession: jest.fn(),
    };
    guard = new KeycloakScopeGuard(
      reflector as unknown as Reflector,
      keycloakAuthService as unknown as KeycloakAuthService,
    );
  });

  it('rejects non-onboarded bearer-token principals before protected handlers run', async () => {
    const request = createRequest({ authorization: 'Bearer access-token' });
    keycloakAuthService.authenticateAccessToken.mockResolvedValue(
      createAuthenticatedUser({
        claims: {
          is_onboarded: false,
        },
      }),
    );

    await expect(guard.canActivate(createHttpContext(request))).rejects.toBeInstanceOf(ForbiddenException);

    expect(keycloakAuthService.authenticateAccessToken).toHaveBeenCalledWith('access-token', []);
  });

  it('rejects non-onboarded session principals before protected handlers run', async () => {
    const request = createRequest({ cookie: 'cacic_eventos_session=session-id' });
    keycloakAuthService.authenticateSession.mockResolvedValue(
      createAuthenticatedUser({
        claims: {
          is_onboarded: 'false',
        },
      }),
    );

    await expect(guard.canActivate(createHttpContext(request))).rejects.toBeInstanceOf(ForbiddenException);

    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('session-id', []);
  });

  it.each([true, 'true'])('allows onboarded protected principals with claim %p', async (isOnboarded) => {
    const request = createRequest({ authorization: 'Bearer access-token' });
    keycloakAuthService.authenticateAccessToken.mockResolvedValue(
      createAuthenticatedUser({
        claims: {
          is_onboarded: isOnboarded,
        },
      }),
    );

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
  });

  it('allows handlers explicitly marked as available before onboarding', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === ALLOW_NON_ONBOARDED_KEY) {
        return true;
      }

      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      return undefined;
    });
    const request = createRequest({ authorization: 'Bearer access-token' });
    keycloakAuthService.authenticateAccessToken.mockResolvedValue(
      createAuthenticatedUser({
        claims: {
          is_onboarded: false,
        },
      }),
    );

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
  });

  it('allows Keycloak service-account principals without onboarding claims', async () => {
    const request = createRequest({ authorization: 'Bearer service-token' });
    keycloakAuthService.authenticateAccessToken.mockResolvedValue(
      createAuthenticatedUser({
        preferredUsername: 'service-account-account-backend',
        claims: {},
      }),
    );

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
  });
});

function createRequest(headers: RequestFixture['headers']): RequestFixture {
  return {
    headers,
  };
}

function createHttpContext(request: RequestFixture): ExecutionContext {
  class TestController {}
  const handler = () => undefined;

  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

function createAuthenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  const { claims, ...rest } = overrides;

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
      ...(claims ?? {}),
    },
    ...rest,
  };
}
