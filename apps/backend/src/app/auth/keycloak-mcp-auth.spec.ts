import { jest as jestEsm } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, type KeyObject, sign as signToken } from 'node:crypto';
import { authenticateMcpResource } from '../mcp/shared/oauth-resource';
import type { AuthenticatedUserSyncService } from './authenticated-user-sync.service';
import type { KeycloakAuthService } from './keycloak-auth.service';

const { jest } = import.meta;

jestEsm.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: jest.fn(),
  },
}));

const axios = (await import('axios')).default;
const { KeycloakAuthService: KeycloakAuthServiceClass } = await import('./keycloak-auth.service');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const TEST_ISSUER = 'https://keycloak.example/realms/cacic';
const TEST_KEY_ID = 'test-mcp-key';
const RESOURCE = 'https://events.example/api/mcp/admin';
const CLIENT_ID = 'registered-mcp-client';
const WEB_CLIENT_ID = 'event-manager';
const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const untrustedSigningKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...signingKeys.publicKey.export({ format: 'jwk' }),
  kid: TEST_KEY_ID,
  alg: 'RS256',
  use: 'sig',
};
const admission = { audience: RESOURCE, allowedClients: [CLIENT_ID] };

describe('KeycloakAuthService MCP authentication', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let service: KeycloakAuthService;
  let userClaimSync: Pick<jest.Mocked<AuthenticatedUserSyncService>, 'syncLoginClaims'>;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.KEYCLOAK_REALM_URL = `${TEST_ISSUER}/`;
    process.env.KEYCLOAK_CLIENT_ID = WEB_CLIENT_ID;
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    delete process.env.KEYCLOAK_ALLOWED_ACCESS_TOKEN_CLIENTS;
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ data: { active: true } });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn().mockResolvedValue({ keys: [publicJwk] }),
    } as unknown as Response);
    global.fetch = fetchMock;
    userClaimSync = { syncLoginClaims: jest.fn().mockResolvedValue(undefined) };
    service = new KeycloakAuthServiceClass(
      {} as ConstructorParameters<typeof KeycloakAuthServiceClass>[0],
      {} as ConstructorParameters<typeof KeycloakAuthServiceClass>[1],
      userClaimSync as unknown as AuthenticatedUserSyncService,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('creates a human principal from a signed resource token without introspection or user synchronization', async () => {
    const token = jwt({
      resource_access: {
        [WEB_CLIENT_ID]: { roles: ['access', 'super-admin'] },
        'unrelated-client': { roles: ['unrelated-role'] },
      },
      scope: 'mcp:admin:read mcp:admin:proposals:create',
      is_onboarded: 'true',
    });

    const principal = await service.authenticateMcpAccessToken(token, admission);

    expect(principal.sub).toBe('human-user');
    expect(principal.token).toBe(token);
    expect(principal.roles).toEqual(['access', 'super-admin']);
    expect(principal.roleSet).toEqual(new Set(['access', 'super-admin']));
    expect(principal.oidcScopes).toEqual(['mcp:admin:read', 'mcp:admin:proposals:create']);
    expect(principal.oidcScopeSet).toEqual(new Set(['mcp:admin:read', 'mcp:admin:proposals:create']));
    expect(principal.permissions).toEqual([]);
    expect(principal.permissionSet.size).toBe(0);
    expect(principal.claims['is_onboarded']).toBe('true');
    expect(fetchMock).toHaveBeenCalledWith(`${TEST_ISSUER}/protocol/openid-connect/certs`, expect.any(Object));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
  });

  it('isolates tokens by OAuth resource when the same client is allowed on both', async () => {
    const userResource = 'https://events.example/api/mcp/user';
    const config = {
      enabled: true,
      resourceUrl: userResource,
      allowedOrigins: new Set(['https://events.example']),
      allowedClients: [CLIENT_ID],
    };
    const authenticate = (token: string) =>
      authenticateMcpResource(
        { headers: { host: 'events.example', authorization: `Bearer ${token}` } },
        config,
        service,
      );

    await expect(authenticate(jwt({ is_onboarded: true }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authenticate(jwt({ aud: userResource, scope: 'mcp:user:read', is_onboarded: true })),
    ).resolves.toMatchObject({ sub: 'human-user', authenticationTransport: 'mcp' });
    expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong audience', { aud: `${RESOURCE}/other` }],
    ['missing audience', { aud: undefined }],
    ['web audience', { aud: WEB_CLIENT_ID }],
    ['unapproved client', { azp: 'unregistered-mcp-client' }],
    ['missing client', { azp: undefined }],
    ['wrong issuer', { iss: 'https://untrusted.example/realms/cacic' }],
    ['expired token', { exp: () => Math.floor(Date.now() / 1000) - 1 }],
    ['missing human session', { sid: undefined }],
    ['missing subject', { sub: undefined }],
    ['ID token', { typ: 'ID' }],
    ['missing token type', { typ: undefined }],
    ['excessive lifetime', { exp: () => Math.floor(Date.now() / 1000) + 301 }],
    ['missing issuance time', { iat: undefined }],
    ['missing expiration time', { exp: undefined }],
  ])('rejects %s without introspection or identity synchronization', async (_name, overrides) => {
    const claims = Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, typeof value === 'function' ? value() : value]),
    );

    await expect(service.authenticateMcpAccessToken(jwt(claims), admission)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
  });

  it('rejects a token signed by an untrusted RSA key', async () => {
    const token = jwt({}, untrustedSigningKeys.privateKey);

    await expect(service.authenticateMcpAccessToken(token, admission)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
  });

  it('rejects a service account even if it has an allowed client, MCP audience and session claim', async () => {
    const token = jwt({ preferred_username: `service-account-${CLIENT_ID}`, sub: 'service-account-id' });

    await expect(service.authenticateMcpAccessToken(token, admission)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
  });

  it.each(['mcp:admin:read', 'mcp:admin:proposals:create'])(
    'rejects MCP scope %s through ordinary web authentication even for an allowed web token',
    async (scope) => {
      const token = jwt({ aud: WEB_CLIENT_ID, azp: WEB_CLIENT_ID, scope });

      await expect(service.authenticateAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userClaimSync.syncLoginClaims).not.toHaveBeenCalled();
    },
  );
});

function jwt(overrides: Record<string, unknown>, privateKey: KeyObject = signingKeys.privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: TEST_KEY_ID };
  const payload = {
    iss: TEST_ISSUER,
    aud: RESOURCE,
    azp: CLIENT_ID,
    typ: 'Bearer',
    sub: 'human-user',
    sid: 'human-session',
    iat: now,
    exp: now + 300,
    scope: 'mcp:admin:read',
    ...overrides,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signToken('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}
