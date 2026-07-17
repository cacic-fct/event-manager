import { KeycloakAuthService } from './keycloak-auth.service';
import { withQueryParam } from './auth-redirect-utils';

export function getFailedAuthorizationRedirectUri(
  keycloakAuthService: KeycloakAuthService,
  authorizationState: Awaited<ReturnType<KeycloakAuthService['consumeAuthorizationState']>>,
): string {
  const redirectUri = keycloakAuthService.getPostLoginRedirectUri(authorizationState);
  return authorizationState?.prompt === 'none' ? withQueryParam(redirectUri, 'sso', 'none') : redirectUri;
}
