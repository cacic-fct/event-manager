import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RealmEntry = {
  clientId?: string;
  name?: string;
  enabled?: boolean;
  protocol?: string;
  publicClient?: boolean;
  bearerOnly?: boolean;
  standardFlowEnabled?: boolean;
  implicitFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  consentRequired?: boolean;
  fullScopeAllowed?: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  attributes?: Record<string, string>;
  defaultClientScopes?: string[];
  optionalClientScopes?: string[];
  secret?: string;
  protocolMappers?: {
    protocolMapper: string;
    config: Record<string, string>;
  }[];
};

const realm = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../../docker/keycloak/cacic-sso-realm.json'), 'utf8'),
) as {
  clients: RealmEntry[];
  clientScopes: RealmEntry[];
  clientScopeMappings: Record<string, { client: string; roles: string[] }[]>;
};

describe('Keycloak realm introspection audience', () => {
  it.each([
    {
      name: 'cacic-event-manager login',
      audience: 'cacic-event-manager',
      entry: realm.clients.find((client) => client.clientId === 'cacic-event-manager'),
    },
    {
      name: 'cacic-event-manager M2M',
      audience: 'cacic-event-manager',
      entry: realm.clientScopes.find((scope) => scope.name === 'cacic-event-manager-audience'),
    },
    {
      name: 'cacic-account-manager login',
      audience: 'cacic-account-manager',
      entry: realm.clients.find((client) => client.clientId === 'cacic-account-manager'),
    },
    {
      name: 'cacic-account-manager M2M',
      audience: 'cacic-account-manager',
      entry: realm.clientScopes.find((scope) => scope.name === 'cacic-account-manager-audience'),
    },
  ])('includes the receiving backend in tokens from $name', ({ audience, entry }) => {
    expect(entry?.protocolMappers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocolMapper: 'oidc-audience-mapper',
          config: expect.objectContaining({
            'included.client.audience': audience,
            'access.token.claim': 'true',
            'id.token.claim': 'false',
          }),
        }),
      ]),
    );
  });
});

describe('Keycloak admin MCP resource isolation', () => {
  const clientId = 'cacic-event-manager-mcp-dev';
  const resourceUrl = 'http://localhost:3000/api/mcp/admin';
  const mcpScopes = ['mcp:admin:read', 'mcp:admin:proposals:create'];
  const client = realm.clients.find((entry) => entry.clientId === clientId);
  const identity = realm.clientScopes.find((scope) => scope.name === 'mcp-admin-identity');

  it('registers a public consent-based authorization code client with mandatory S256 PKCE', () => {
    expect(client).toEqual(
      expect.objectContaining({
        enabled: true,
        protocol: 'openid-connect',
        publicClient: true,
        bearerOnly: false,
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        consentRequired: true,
        fullScopeAllowed: false,
        attributes: { 'pkce.code.challenge.method': 'S256', 'access.token.lifespan': '300' },
      }),
    );
    expect(client?.secret).toBeUndefined();
  });

  it('allows only the exact local callback and no cross-origin browser access', () => {
    expect(client?.redirectUris).toEqual(['http://127.0.0.1:8765/callback']);
    expect(client?.webOrigins).toEqual([]);
  });

  it('attaches only the minimal identity scope and explicit optional MCP grants', () => {
    expect(client?.defaultClientScopes).toEqual(['mcp-admin-identity']);
    expect(client?.optionalClientScopes).toEqual(mcpScopes);
    expect(client?.protocolMappers ?? []).toEqual([]);
  });

  it.each(mcpScopes)('binds optional scope %s exclusively to the MCP access-token audience', (name) => {
    const scope = realm.clientScopes.find((entry) => entry.name === name);
    expect(scope?.attributes).toEqual(
      expect.objectContaining({
        'include.in.token.scope': 'true',
        'display.on.consent.screen': 'true',
      }),
    );
    expect(scope?.protocolMappers).toEqual([
      expect.objectContaining({
        protocolMapper: 'oidc-audience-mapper',
        config: {
          'included.custom.audience': resourceUrl,
          'access.token.claim': 'true',
          'id.token.claim': 'false',
        },
      }),
    ]);
  });

  it('maps only existing Event Manager access roles despite fullScopeAllowed being disabled', () => {
    const mappings = Object.entries(realm.clientScopeMappings).flatMap(([sourceClient, entries]) =>
      entries.filter((entry) => entry.client === clientId).map((entry) => ({ sourceClient, ...entry })),
    );
    expect(mappings).toEqual([
      { sourceClient: 'cacic-event-manager', client: clientId, roles: ['access', 'super-admin'] },
    ]);
    expect(identity?.protocolMappers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocolMapper: 'oidc-usermodel-client-role-mapper',
          config: expect.objectContaining({
            'usermodel.clientRoleMapping.clientId': 'cacic-event-manager',
            'claim.name': 'resource_access.cacic-event-manager.roles',
            multivalued: 'true',
          }),
        }),
        expect.objectContaining({
          protocolMapper: 'oidc-usermodel-attribute-mapper',
          config: expect.objectContaining({
            'user.attribute': 'isOnboarded',
            'claim.name': 'is_onboarded',
            'jsonType.label': 'String',
          }),
        }),
      ]),
    );
  });

  it('excludes private claims, realm roles, audience resolution and unrelated client audiences', () => {
    const assignedScopes = [...(client?.defaultClientScopes ?? []), ...(client?.optionalClientScopes ?? [])];
    const mappers = realm.clientScopes
      .filter((scope) => assignedScopes.includes(scope.name ?? ''))
      .flatMap((scope) => scope.protocolMappers ?? []);
    expect(mappers).toHaveLength(4);
    expect(identity?.protocolMappers?.map((mapper) => mapper.config['claim.name'])).toEqual([
      'resource_access.cacic-event-manager.roles',
      'is_onboarded',
    ]);
    for (const mapper of mappers) {
      expect(mapper.config['access.token.claim']).toBe('true');
      expect(mapper.config['id.token.claim']).toBe('false');
      expect(mapper.protocolMapper).not.toBe('oidc-audience-resolve-mapper');
      expect(mapper.protocolMapper).not.toBe('oidc-usermodel-realm-role-mapper');
      expect(mapper.config['included.client.audience']).toBeUndefined();
    }
  });
});
