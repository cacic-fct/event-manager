import { validateBackendEnvironment } from '../config/environment.validation';

describe('MCP environment fail-closed configuration', () => {
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused.test/db',
    MCP_ADMIN_ENABLED: 'true',
    MCP_ADMIN_RESOURCE_URL: 'http://localhost:3000/api/mcp/admin',
    MCP_ADMIN_ALLOWED_CLIENTS: 'approved-ai',
  };

  it('accepts explicitly configured local development and leaves MCP disabled by default', () => {
    expect(validateBackendEnvironment(base)).toBe(base);
    expect(() => validateBackendEnvironment({ NODE_ENV: 'test', DATABASE_URL: base.DATABASE_URL })).not.toThrow();
  });

  it.each([
    '',
    'http://public.example/api/mcp/admin',
    'https://events.example/api/mcp/me',
    'https://events.example/api/mcp/admin?callback=evil',
    'https://user:password@events.example/api/mcp/admin',
    'https://events.example/api/mcp/admin/',
  ])('rejects a noncanonical resource %s', (resource) => {
    expect(() => validateBackendEnvironment({ ...base, MCP_ADMIN_RESOURCE_URL: resource })).toThrow(
      'MCP_ADMIN_RESOURCE_URL',
    );
  });

  it.each(['', 'cacic-event-manager', 'cacic-event-manager-m2m', '*', 'client with spaces'])(
    'requires dedicated manually registered clients: %s',
    (client) => {
      expect(() => validateBackendEnvironment({ ...base, MCP_ADMIN_ALLOWED_CLIENTS: client })).toThrow(
        'MCP_ADMIN_ALLOWED_CLIENTS',
      );
    },
  );

  it.each(['https://*.example', 'https://app.example/path', 'https://app.example/', 'http://app.example', 'null'])(
    'rejects non-exact trusted origins: %s',
    (origin) => {
      expect(() => validateBackendEnvironment({ ...base, MCP_ADMIN_ALLOWED_ORIGINS: origin })).toThrow(
        'MCP_ADMIN_ALLOWED_ORIGINS',
      );
    },
  );

  it('accepts explicit trusted origins and rejects mistyped kill switches', () => {
    expect(() =>
      validateBackendEnvironment({
        ...base,
        MCP_ADMIN_ALLOWED_ORIGINS: 'https://approved.example,http://127.0.0.1:8765',
      }),
    ).not.toThrow();
    expect(() => validateBackendEnvironment({ ...base, MCP_ADMIN_PROPOSALS_ENABLED: 'yes' })).toThrow(
      'MCP_ADMIN_PROPOSALS_ENABLED',
    );
  });
});
