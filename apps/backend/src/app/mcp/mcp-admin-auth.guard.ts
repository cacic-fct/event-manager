import { MCP_ADMIN_PROPOSAL_TOOLS } from './mcp-admin-tools';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { McpAdminConfig, MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE } from './mcp-admin.config';
import { McpAdminOperationLogService } from './mcp-admin-operation-log.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { authenticateMcpResource, setMcpOAuthChallenge } from './shared/oauth-resource';
import { isRecord } from '../auth/keycloak-claims.utils';

@Injectable()
export class McpAdminAuthGuard implements CanActivate {
  constructor(
    private readonly config: McpAdminConfig,
    private readonly auth: KeycloakAuthService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly log: McpAdminOperationLogService,
    private readonly limits: RateLimitService,
    private readonly access: McpAdminAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (!this.config.enabled) throw new NotFoundException();
    setMcpOAuthChallenge(response, this.config.metadataUrl, MCP_ADMIN_READ_SCOPE);
    try {
      await this.limits.assertAllowed({ policy: RATE_LIMIT_POLICIES.mcpAuthenticate, request, response });
      const user = await authenticateMcpResource(request, this.config, this.auth);
      if (!this.authorization.hasEventManagerAccess(user))
        throw new ForbiddenException('Administrative access required.');
      if (![MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE].some((scope) => user.oidcScopeSet.has(scope))) {
        setMcpOAuthChallenge(response, this.config.metadataUrl, MCP_ADMIN_READ_SCOPE, 'insufficient_scope');
        throw new ForbiddenException('Missing MCP capability scope.');
      }
      const body: unknown = request.body;
      const params =
        isRecord(body) && body['method'] === 'tools/call' && isRecord(body['params']) ? body['params'] : undefined;
      if (params) {
        const requiredScope =
          MCP_ADMIN_PROPOSAL_TOOLS.some((name) => name === params['name']) ||
          (typeof params['name'] === 'string' &&
            (params['name'].startsWith('propose_admin_') || params['name'] === 'get_admin_proposal_status'))
            ? MCP_ADMIN_PROPOSE_SCOPE
            : MCP_ADMIN_READ_SCOPE;
        if (!user.oidcScopeSet.has(requiredScope)) {
          setMcpOAuthChallenge(response, this.config.metadataUrl, requiredScope, 'insufficient_scope');
          throw new ForbiddenException('Escopo OAuth insuficiente para esta ferramenta.');
        }
      }
      await this.access.assertEligible(user);
      await this.limits.assertAllowed({
        policy: RATE_LIMIT_POLICIES.mcpOperations,
        request,
        response,
        authenticatedUser: user,
        resourceParts: [String(user.claims['azp'])],
      });
      request.user = user;
      response.removeHeader('WWW-Authenticate');
      return true;
    } catch (error) {
      // Never attribute unverified claims from a rejected JWT to a real person.
      // The shared limiter accounts for throttled traffic without further DB writes.
      if (!(error instanceof HttpException && error.getStatus() === 429)) {
        await this.log.denied({ tool: 'authenticate' });
      }
      throw error;
    }
  }
}
