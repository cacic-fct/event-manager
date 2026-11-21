import { MCP_ADMIN_PROPOSAL_TOOLS } from './mcp-admin-tools';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { assertUserOnboarded } from '../auth/onboarding';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { McpAdminConfig, MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE } from './mcp-admin.config';
import { McpAdminOperationLogService } from './mcp-admin-operation-log.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { McpAdminAccessService } from './mcp-admin-access.service';
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
    response.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${this.config.metadataUrl}", scope="${MCP_ADMIN_READ_SCOPE}"`,
    );
    try {
      await this.limits.assertAllowed({ policy: RATE_LIMIT_POLICIES.mcpAuthenticate, request, response });
      if (request.headers.host !== new URL(this.config.resourceUrl).host) {
        throw new ForbiddenException('Invalid MCP host.');
      }
      const origin = request.headers.origin;
      if (origin !== undefined && !this.config.allowedOrigins.has(origin)) {
        throw new ForbiddenException('Invalid MCP origin.');
      }
      const authorization = request.headers.authorization;
      const match = typeof authorization === 'string' ? /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization) : null;
      if (!match || match[1].length > 16384) throw new UnauthorizedException('MCP requires an OAuth bearer token.');
      const user = await this.auth.authenticateMcpAccessToken(match[1], {
        audience: this.config.resourceUrl,
        allowedClients: this.config.allowedClients,
      });
      assertUserOnboarded(user);
      if (!this.authorization.hasEventManagerAccess(user))
        throw new ForbiddenException('Administrative access required.');
      if (![MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE].some((scope) => user.oidcScopeSet.has(scope))) {
        response.setHeader(
          'WWW-Authenticate',
          `Bearer error="insufficient_scope", resource_metadata="${this.config.metadataUrl}", scope="${MCP_ADMIN_READ_SCOPE}"`,
        );
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
          response.setHeader(
            'WWW-Authenticate',
            `Bearer error="insufficient_scope", resource_metadata="${this.config.metadataUrl}", scope="${requiredScope}"`,
          );
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
