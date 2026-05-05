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
   * Raw access token (JWT).
   */
  token?: string;

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
   * Full set of decoded token claims.
   */
  claims?: {
    exp?: number;
    iat?: number;
    auth_time?: number;
    jti?: string;
    iss?: string;
    aud?: string | string[];
    sub?: string;
    typ?: string;
    azp?: string;
    sid?: string;
    acr?: string;
    'allowed-origins'?: string[];
    realm_access?: {
      roles: string[];
    };
    resource_access?: Record<
      string,
      {
        roles: string[];
      }
    >;
    scope?: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    email?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    active?: boolean;
    identity_document?: string;
    is_foreign?: boolean;
    unesp_role?: string[];
    enrollment_number?: string;
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
