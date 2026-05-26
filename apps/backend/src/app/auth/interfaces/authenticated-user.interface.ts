export interface AuthenticatedUser {
  realm_access: {
    roles: string[];
  };
  sub?: string;
  preferredUsername?: string;
  email?: string;
  token: string;
  roles: string[];
  roleSet: Set<string>;
  permissions: string[];
  permissionSet: Set<string>;
  oidcScopes: string[];
  oidcScopeSet: Set<string>;
  // Legacy aliases kept for backward compatibility.
  scopes: string[];
  scopeSet: Set<string>;
  claims: Record<string, unknown>;
}
