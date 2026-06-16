import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export type PublicAuthenticatedUser = {
  realm_access: {
    roles: string[];
  };
  sub?: string;
  preferredUsername?: string;
  email?: string;
  roles: string[];
  permissions: string[];
  oidcScopes: string[];
  scopes: string[];
  claims: Record<string, unknown>;
};

const PUBLIC_CLAIM_KEYS = new Set([
  'acr',
  'active',
  'analytics_enabled',
  'aud',
  'auth_time',
  'azp',
  'client_id',
  'diagnostics_enabled',
  'email',
  'email_verified',
  'enrollment_number',
  'exp',
  'family_name',
  'given_name',
  'iat',
  'identity_document',
  'is_foreign',
  'is_onboarded',
  'iss',
  'name',
  'performance_monitoring_enabled',
  'picture',
  'preferred_username',
  'scope',
  'sid',
  'sub',
  'typ',
  'unesp_role',
]);

const PUBLIC_ATTRIBUTE_KEYS = new Set([
  'analytics_enabled',
  'diagnostics_enabled',
  'performance_monitoring_enabled',
]);

export function toPublicAuthenticatedUser(user: AuthenticatedUser): PublicAuthenticatedUser {
  return {
    realm_access: {
      roles: [...user.realm_access.roles],
    },
    sub: user.sub,
    preferredUsername: user.preferredUsername,
    email: user.email,
    roles: [...user.roles],
    permissions: [...user.permissions],
    oidcScopes: [...user.oidcScopes],
    scopes: [...user.scopes],
    claims: sanitizeClaims(user.claims),
  };
}

function sanitizeClaims(claims: Record<string, unknown>): Record<string, unknown> {
  const publicClaims: Record<string, unknown> = {};

  for (const key of PUBLIC_CLAIM_KEYS) {
    const value = claims[key];
    if (value !== undefined) {
      publicClaims[key] = value;
    }
  }

  const attributes = sanitizeAttributes(claims['attributes']);
  if (attributes) {
    publicClaims['attributes'] = attributes;
  }

  return publicClaims;
}

function sanitizeAttributes(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const attributes: Record<string, unknown> = {};
  for (const key of PUBLIC_ATTRIBUTE_KEYS) {
    const attributeValue = value[key];
    if (attributeValue !== undefined) {
      attributes[key] = attributeValue;
    }
  }

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
