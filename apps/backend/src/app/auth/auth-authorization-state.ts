import { Request, Response } from 'express';
import { AUTH_STATE_COOKIE_NAME } from './auth.constants';
import { isSecureAuthRequest, readAuthCookie } from './auth-cookie-utils';
import { KeycloakAuthService } from './keycloak-auth.service';

export async function consumeAuthorizationState(
  keycloakAuthService: KeycloakAuthService,
  request: Request,
  response: Response,
  state: string | undefined,
): Promise<Awaited<ReturnType<KeycloakAuthService['consumeAuthorizationState']>> | null> {
  const cookieState = readAuthCookie(request, AUTH_STATE_COOKIE_NAME);
  clearAuthorizationStateCookie(response, request);
  if (!state || !cookieState || state !== cookieState) {
    return null;
  }
  return (await keycloakAuthService.consumeAuthorizationState(state)) ?? null;
}

export function setAuthorizationStateCookie(response: Response, request: Request, state: string): void {
  response.cookie(AUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureAuthRequest(request),
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/callback',
  });
}

export function clearAuthorizationStateCookie(response: Response, request: Request): void {
  response.clearCookie(AUTH_STATE_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureAuthRequest(request),
    path: '/api/auth/callback',
  });
}
