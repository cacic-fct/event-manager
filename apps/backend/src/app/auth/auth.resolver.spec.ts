import { AuthResolver } from './auth.resolver';

describe('AuthResolver', () => {
  const resolver = new AuthResolver();

  it('returns null when neither GraphQL request context contains a principal', () => {
    expect(resolver.me({})).toBeNull();
  });

  it.each(['req', 'request'] as const)(
    'projects the authenticated user from context.%s without token material',
    (key) => {
      const user = {
        sub: 'user-1',
        email: 'ada@example.com',
        realm_access: { roles: ['access'] },
        token: 'secret',
        roles: ['access'],
        roleSet: new Set(['access']),
        permissions: ['event#read'],
        permissionSet: new Set(['event#read']),
        oidcScopes: ['openid'],
        oidcScopeSet: new Set(['openid']),
        scopes: ['openid'],
        scopeSet: new Set(['openid']),
        claims: { sub: 'user-1', name: 'Ada', internal_note: 'hidden' },
      };

      const result = resolver.me({ [key]: { user } } as never);

      expect(result).toEqual(expect.objectContaining({ sub: 'user-1', email: 'ada@example.com' }));
      expect(result).not.toHaveProperty('token');
      expect(result?.claims).not.toHaveProperty('internal_note');
    },
  );
});
