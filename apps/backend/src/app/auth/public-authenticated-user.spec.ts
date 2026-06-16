import { toPublicAuthenticatedUser } from './public-authenticated-user';

describe('toPublicAuthenticatedUser', () => {
  it('returns only the public claim allowlist from auth responses', () => {
    const result = toPublicAuthenticatedUser({
      realm_access: {
        roles: ['user'],
      },
      sub: 'user-1',
      preferredUsername: 'ada',
      email: 'ada@example.com',
      token: 'raw-access-token',
      roles: ['user'],
      roleSet: new Set(['user']),
      permissions: ['event#read'],
      permissionSet: new Set(['event#read']),
      oidcScopes: ['openid'],
      oidcScopeSet: new Set(['openid']),
      scopes: ['openid'],
      scopeSet: new Set(['openid']),
      claims: {
        sub: 'user-1',
        name: 'Ada Lovelace',
        picture: 'https://example.com/avatar.png',
        identity_document: '12345678909',
        enrollment_number: '20260001',
        permissions: ['event#read'],
        authorization: {
          permissions: ['event#write'],
        },
        attributes: {
          analytics_enabled: ['false'],
          internal_note: 'hidden',
        },
        jwt: 'introspection-jwt',
        token: 'claim-token',
        refresh_token: 'refresh-token',
        is_onboarded: true,
        custom_internal_claim: 'hidden',
      },
    });

    expect(result).toEqual({
      realm_access: {
        roles: ['user'],
      },
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
        picture: 'https://example.com/avatar.png',
        identity_document: '12345678909',
        enrollment_number: '20260001',
        is_onboarded: true,
        attributes: {
          analytics_enabled: ['false'],
        },
      },
    });
    expect('token' in result).toBe(false);
    expect('authorization' in result.claims).toBe(false);
    expect('permissions' in result.claims).toBe(false);
    expect('custom_internal_claim' in result.claims).toBe(false);
  });
});
