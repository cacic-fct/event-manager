import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ALLOW_NON_ONBOARDED_KEY } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

describe('AuthController getMe boundary', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController({} as never, {} as never);
  });

  it('declares an authenticated, non-onboarded identity route', () => {
    const handler = AuthController.prototype.getMe;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, handler)).toBe(true);
  });

  it('returns only the public identity projection and strips internal token and private claims', () => {
    const user = authenticatedUser({
      claims: {
        sub: 'user-1',
        name: 'Ada Lovelace',
        is_onboarded: false,
        attributes: {
          analytics_enabled: true,
          diagnostics_enabled: false,
          private_account_flag: true,
        },
        private_account_flag: true,
      },
    });

    expect(controller.getMe({ user } as never)).toEqual({
      realm_access: { roles: ['realm-user'] },
      sub: 'user-1',
      preferredUsername: 'ada',
      email: 'ada@example.com',
      roles: ['user'],
      permissions: ['event#read'],
      oidcScopes: ['openid'],
      scopes: ['openid'],
      claims: {
        sub: 'user-1',
        name: 'Ada Lovelace',
        is_onboarded: false,
        attributes: {
          analytics_enabled: true,
          diagnostics_enabled: false,
        },
      },
    });
  });

  it('rejects a request without an authenticated identity before projecting anything', () => {
    expect(() => controller.getMe({} as never)).toThrow(new ForbiddenException('User is not authenticated.'));
  });
});

function authenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    realm_access: { roles: ['realm-user'] },
    sub: 'user-1',
    preferredUsername: 'ada',
    email: 'ada@example.com',
    token: 'must-not-leak',
    roles: ['user'],
    roleSet: new Set(['user']),
    permissions: ['event#read'],
    permissionSet: new Set(['event#read']),
    oidcScopes: ['openid'],
    oidcScopeSet: new Set(['openid']),
    scopes: ['openid'],
    scopeSet: new Set(['openid']),
    claims: {},
    ...overrides,
  };
}
