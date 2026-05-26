import {
  decodeJwtPayload,
  extractOidcScopes,
  extractPermissions,
  extractRoles,
  readNumberClaim,
  readStringClaim,
} from './keycloak-claims.utils';

describe('keycloak claims utils', () => {
  it('decodes base64url JWT payloads', () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        preferred_username: 'ada',
        exp: 1780000000,
      }),
      'utf8',
    ).toString('base64url');

    expect(decodeJwtPayload(`header.${payload}.signature`)).toEqual({
      sub: 'user-1',
      preferred_username: 'ada',
      exp: 1780000000,
    });
  });

  it('returns an empty object for malformed JWT payloads', () => {
    expect(decodeJwtPayload('not-a-jwt')).toEqual({});
  });

  it('extracts unique normalized realm and client roles from multiple claim sources', () => {
    expect(
      extractRoles(
        {
          realm_access: {
            roles: [' admin ', '', 'participant', 123],
          },
          resource_access: {
            adminClient: {
              roles: ['editor', 'admin'],
            },
            ignoredClient: {
              roles: [null, ''],
            },
          },
        },
        {
          realm_access: {
            roles: ['participant', 'reviewer'],
          },
        },
      ),
    ).toEqual(['admin', 'participant', 'editor', 'reviewer']);
  });

  it('extracts unique normalized oidc scopes from space-separated scope claims', () => {
    expect(extractOidcScopes({ scope: 'openid profile email' }, { scope: ' email offline_access ' })).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access',
    ]);
  });

  it('extracts string and resource-scoped permissions', () => {
    expect(
      extractPermissions(
        {
          permissions: [' events:read ', '', 42],
          authorization: {
            permissions: [
              {
                rsname: 'events',
                scopes: ['write', ' read ', ''],
              },
              {
                resource_name: 'people',
                scopes: ['merge'],
              },
              {
                scopes: ['global-operation'],
              },
            ],
          },
        },
        {
          permissions: ['events:read', 'certificates:issue'],
        },
      ),
    ).toEqual([
      'events:read',
      'events#write',
      'events#read',
      'people#merge',
      'global-operation',
      'certificates:issue',
    ]);
  });

  it('reads typed primitive claims only when the value matches the requested type', () => {
    const claims = {
      name: 'Ada',
      age: 37,
      numericString: '37',
    };

    expect(readStringClaim(claims, 'name')).toBe('Ada');
    expect(readStringClaim(claims, 'age')).toBeUndefined();
    expect(readNumberClaim(claims, 'age')).toBe(37);
    expect(readNumberClaim(claims, 'numericString')).toBeUndefined();
  });
});
