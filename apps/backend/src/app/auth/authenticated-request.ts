import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { readAuthCookie } from './auth-cookie-utils';
import type { KeycloakAuthService } from './keycloak-auth.service';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

export async function authenticateHttpRequest(
  request: AuthenticatedRequest,
  keycloakAuthService: Pick<KeycloakAuthService, 'authenticateAccessToken' | 'authenticateSession'>,
): Promise<AuthenticatedUser> {
  const bearerToken = extractBearerToken(request.headers.authorization);
  if (bearerToken) {
    const user = await keycloakAuthService.authenticateAccessToken(bearerToken);
    request.user = user;
    return user;
  }

  const sessionId = readAuthCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (!sessionId) {
    throw new UnauthorizedException('Missing authentication credentials.');
  }

  const user = await keycloakAuthService.authenticateSession(sessionId);
  request.user = user;
  return user;
}

function extractBearerToken(authorizationHeader?: string | string[]): string | null {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
