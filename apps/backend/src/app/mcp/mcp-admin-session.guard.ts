import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { readAuthCookie } from '../auth/auth-cookie-utils';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { assertUserOnboarded } from '../auth/onboarding';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { McpAdminConfig } from './mcp-admin.config';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';

@Injectable()
export class McpAdminSessionGuard implements CanActivate {
  constructor(
    private readonly config: McpAdminConfig,
    private readonly auth: KeycloakAuthService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly access: McpAdminAccessService,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    if (request.headers.authorization !== undefined) {
      throw new UnauthorizedException('Esta ação exige uma sessão da aplicação.');
    }
    const sessionId = readAuthCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) throw new UnauthorizedException('Entre na aplicação para continuar.');
    if (request.method !== 'GET') {
      if (
        !request.headers.origin ||
        !this.config.webOrigins.has(request.headers.origin) ||
        request.headers['x-mcp-review'] !== '1' ||
        !request.is('application/json')
      ) {
        throw new ForbiddenException('Origem de revisão inválida. Reabra a página da aplicação.');
      }
    }
    const user = await this.auth.authenticateSession(sessionId);
    assertUserOnboarded(user);
    if (!this.authorization.hasEventManagerAccess(user))
      throw new ForbiddenException('Acesso administrativo necessário.');
    await this.access.assertEligible(user);
    await this.limits.assertAllowed({ policy: RATE_LIMIT_POLICIES.mcpOperations, request, authenticatedUser: user });
    request.user = user;
    return true;
  }
}
