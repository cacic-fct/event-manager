import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { readAuthCookie } from '../../auth/auth-cookie-utils';
import type { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { assertUserOnboarded } from '../../auth/onboarding';

export async function authenticateMcpReviewSession(
  request: Request,
  webOrigins: ReadonlySet<string>,
  auth: KeycloakAuthService,
) {
  if (request.headers.authorization !== undefined) {
    throw new UnauthorizedException('Esta ação exige uma sessão da aplicação.');
  }
  const sessionId = readAuthCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (!sessionId) throw new UnauthorizedException('Entre na aplicação para continuar.');
  if (request.method !== 'GET') {
    if (
      !request.headers.origin ||
      !webOrigins.has(request.headers.origin) ||
      request.headers['x-mcp-review'] !== '1' ||
      !request.is('application/json')
    ) {
      throw new ForbiddenException('Origem de revisão inválida. Reabra a página da aplicação.');
    }
  }
  const user = await auth.authenticateSession(sessionId);
  assertUserOnboarded(user);
  return user;
}
