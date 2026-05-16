export function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const [, payloadSegment] = accessToken.split('.');
  if (!payloadSegment) {
    return {};
  }

  const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalizedPayload.length % 4)) % 4;
  const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + paddingLength, '=');

  try {
    const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
}

export function extractRoles(...claimsSources: Record<string, unknown>[]): string[] {
  const roles = new Set<string>();
  for (const claims of claimsSources) {
    for (const role of extractRealmRoles(claims['realm_access'])) {
      roles.add(role);
    }
    extractClientRoles(claims['resource_access'], roles);
  }

  return [...roles];
}

export function extractClientRoles(resourceAccessClaim: unknown, roles: Set<string>): void {
  if (!isRecord(resourceAccessClaim)) {
    return;
  }

  for (const clientAccess of Object.values(resourceAccessClaim)) {
    if (!isRecord(clientAccess)) {
      continue;
    }

    const clientRoles = clientAccess['roles'];
    if (!Array.isArray(clientRoles)) {
      continue;
    }

    for (const role of clientRoles) {
      if (typeof role !== 'string') {
        continue;
      }

      const normalizedRole = role.trim();
      if (normalizedRole) {
        roles.add(normalizedRole);
      }
    }
  }
}

export function extractOidcScopes(...claimsSources: Record<string, unknown>[]): string[] {
  const scopes = new Set<string>();
  for (const claims of claimsSources) {
    extractOidcScopeClaim(claims['scope'], scopes);
  }

  return [...scopes];
}

export function extractOidcScopeClaim(scopeClaim: unknown, scopeSet: Set<string>): void {
  if (typeof scopeClaim !== 'string') {
    return;
  }

  for (const scope of scopeClaim.split(' ')) {
    const normalizedScope = scope.trim();
    if (normalizedScope) {
      scopeSet.add(normalizedScope);
    }
  }
}

export function extractPermissions(...claimsSources: Record<string, unknown>[]): string[] {
  const permissions = new Set<string>();
  for (const claims of claimsSources) {
    extractPermissionClaims(claims['permissions'], permissions);

    const authorizationClaim = claims['authorization'];
    if (isRecord(authorizationClaim)) {
      extractPermissionClaims(authorizationClaim['permissions'], permissions);
    }
  }

  return [...permissions];
}

export function extractPermissionClaims(rawPermissions: unknown, permissionSet: Set<string>): void {
  if (!Array.isArray(rawPermissions)) {
    return;
  }

  for (const permission of rawPermissions) {
    if (typeof permission === 'string') {
      const normalizedPermission = permission.trim();
      if (normalizedPermission) {
        permissionSet.add(normalizedPermission);
      }
      continue;
    }

    if (!isRecord(permission)) {
      continue;
    }

    const resourceName = readStringClaim(permission, 'rsname') ?? readStringClaim(permission, 'resource_name');

    const rawScopes = permission['scopes'];
    if (!Array.isArray(rawScopes)) {
      continue;
    }

    for (const scope of rawScopes) {
      if (typeof scope !== 'string') {
        continue;
      }

      const normalizedScope = scope.trim();
      if (!normalizedScope) {
        continue;
      }

      if (resourceName) {
        permissionSet.add(`${resourceName}#${normalizedScope}`);
      } else {
        permissionSet.add(normalizedScope);
      }
    }
  }
}

export function extractRealmRoles(...realmAccessSources: unknown[]): string[] {
  const roles = new Set<string>();
  for (const rawRealmAccess of realmAccessSources) {
    if (!isRecord(rawRealmAccess)) {
      continue;
    }

    const rawRoles = rawRealmAccess['roles'];
    if (!Array.isArray(rawRoles)) {
      continue;
    }

    for (const role of rawRoles) {
      if (typeof role !== 'string') {
        continue;
      }

      const normalizedRole = role.trim();
      if (normalizedRole) {
        roles.add(normalizedRole);
      }
    }
  }

  return [...roles];
}

export function readStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === 'string' ? value : undefined;
}

export function readNumberClaim(claims: Record<string, unknown>, key: string): number | undefined {
  const value = claims[key];
  return typeof value === 'number' ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
