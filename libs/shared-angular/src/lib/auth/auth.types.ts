/**
 * Represents an authenticated user derived from a Keycloak/OIDC token.
 */
export type AuthenticatedUser = {
  /**
   * Keycloak user ID (subject claim).
   */
  sub?: string;

  /**
   * Preferred username (typically the same as email).
   */
  preferredUsername?: string;

  /**
   * User email address.
   */
  email?: string;

  /**
   * Keycloak realm or client roles assigned to the user.
   */
  roles?: string[];

  /**
   * OAuth2 scopes granted to the token.
   */
  scopes?: string[];

  /**
   * Application-specific permissions (not from Keycloak claims).
   */
  permissions?: string[];

  /**
   * OIDC scopes associated with the authentication request.
   */
  oidcScopes?: string[];

  /**
   * Public allowlist of decoded token claims returned by the backend.
   */
  claims?: {
    exp?: number;
    iat?: number;
    auth_time?: number;
    iss?: string;
    aud?: string | string[];
    sub?: string;
    typ?: string;
    azp?: string;
    sid?: string;
    acr?: string;
    scope?: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    email?: string;
    client_id?: string;
    active?: boolean;
    identity_document?: string;
    is_onboarded?: boolean | string;
    is_foreign?: boolean;
    unesp_role?: string[];
    enrollment_number?: string;
    analytics_enabled?: boolean | string | string[];
    diagnostics_enabled?: boolean | string | string[];
    performance_monitoring_enabled?: boolean | string | string[];
    attributes?: {
      analytics_enabled?: boolean | string | string[];
      diagnostics_enabled?: boolean | string | string[];
      performance_monitoring_enabled?: boolean | string | string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

/**
 * Result of a token refresh operation.
 */
export type AuthRefreshResult = {
  /**
   * Unix timestamp (in milliseconds) when the access token expires.
   */
  expiresAt: number;

  /**
   * Optional Unix timestamp (in milliseconds) when the session expires.
   */
  sessionExpiresAt?: number;
};

export type PasswordLoginResult = AuthRefreshResult & {
  user: AuthenticatedUser;
};

export type LoginOptions = {
  returnTo?: string;
  prompt?: string;
};
