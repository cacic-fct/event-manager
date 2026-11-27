import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { McpAdminConfig } from './mcp-admin.config';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { authenticateMcpReviewSession } from './shared/review-session';

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
    const user = await authenticateMcpReviewSession(request, this.config.webOrigins, this.auth);
    if (!this.authorization.hasEventManagerAccess(user))
      throw new ForbiddenException('Acesso administrativo necessário.');
    await this.access.assertEligible(user);
    await this.limits.assertAllowed({ policy: RATE_LIMIT_POLICIES.mcpOperations, request, authenticatedUser: user });
    request.user = user;
    return true;
  }
}
