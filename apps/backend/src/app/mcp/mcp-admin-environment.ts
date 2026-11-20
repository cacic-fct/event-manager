export function validateMcpAdminEnvironment(config: Record<string, unknown>, errors: string[]): void {
  for (const key of ['MCP_ADMIN_ENABLED', 'MCP_ADMIN_PROPOSALS_ENABLED']) {
    if (config[key] !== undefined && !['true', 'false'].includes(String(config[key])))
      errors.push(`${key} must be true or false.`);
  }
  if (config['MCP_ADMIN_ENABLED'] !== 'true') return;
  const resource = String(config['MCP_ADMIN_RESOURCE_URL'] ?? '').trim();
  try {
    const url = new URL(resource);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.pathname !== '/api/mcp/admin' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.hostname.includes('*') ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && config['NODE_ENV'] !== 'production'))
    ) {
      throw new Error();
    }
  } catch {
    errors.push(
      'MCP_ADMIN_RESOURCE_URL must be the exact HTTPS /api/mcp/admin URL (HTTP loopback is allowed only outside production).',
    );
  }
  const clients = String(config['MCP_ADMIN_ALLOWED_CLIENTS'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const reserved = new Set([
    'cacic-event-manager',
    'cacic-event-manager-m2m',
    String(config['KEYCLOAK_CLIENT_ID'] ?? ''),
    String(config['KEYCLOAK_M2M_CLIENT_ID'] ?? ''),
  ]);
  if (
    clients.length === 0 ||
    clients.length > 20 ||
    clients.some((client) => reserved.has(client) || !/^[a-zA-Z0-9._:-]{1,200}$/.test(client))
  ) {
    errors.push('MCP_ADMIN_ALLOWED_CLIENTS must list 1 to 20 dedicated, manually registered OAuth client IDs.');
  }
  for (const key of ['MCP_ADMIN_ALLOWED_ORIGINS', 'MCP_ADMIN_WEB_ORIGINS', 'MCP_ADMIN_APP_ORIGIN']) {
    const origins = key === 'MCP_ADMIN_APP_ORIGIN' ? [String(config[key] ?? '')] : String(config[key] ?? '').split(',');
    for (const value of origins.map((value) => value.trim()).filter(Boolean)) {
      try {
        const url = new URL(value);
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (
          value !== url.origin ||
          url.hostname.includes('*') ||
          (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && config['NODE_ENV'] !== 'production'))
        )
          throw new Error();
      } catch {
        errors.push(
          `${key} must contain exact trusted HTTPS origins, without wildcards or paths (HTTP loopback only outside production).`,
        );
      }
    }
  }
  if (config['NODE_ENV'] === 'production' && !String(config['KEYCLOAK_REALM_URL'] ?? '').startsWith('https://')) {
    errors.push('MCP requires an HTTPS Keycloak issuer in production.');
  }
}
