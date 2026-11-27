import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { assertUserOnboarded } from '../../auth/onboarding';

interface McpResourceConfig {
  enabled: boolean;
  resourceUrl: string;
  allowedOrigins: ReadonlySet<string>;
}

function mcpRequestOriginError(request: Pick<Request, 'headers'>, config: McpResourceConfig): string | undefined {
  if (request.headers.host !== new URL(config.resourceUrl).host) return 'Invalid MCP host.';
  const origin = request.headers.origin;
  if (origin !== undefined && !config.allowedOrigins.has(origin)) return 'Invalid MCP origin.';
  return undefined;
}

export function setMcpOAuthChallenge(
  response: Response,
  metadataUrl: string,
  scope: string,
  error?: 'insufficient_scope',
): void {
  response.setHeader(
    'WWW-Authenticate',
    `Bearer ${error ? `error="${error}", ` : ''}resource_metadata="${metadataUrl}", scope="${scope}"`,
  );
}

export async function authenticateMcpResource(
  request: Pick<Request, 'headers'>,
  config: McpResourceConfig & { allowedClients: readonly string[] },
  auth: KeycloakAuthService,
) {
  const originError = mcpRequestOriginError(request, config);
  if (originError) throw new ForbiddenException(originError);
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' ? /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization) : null;
  if (!match || match[1].length > 16384) throw new UnauthorizedException('MCP requires an OAuth bearer token.');
  const user = await auth.authenticateMcpAccessToken(match[1], {
    audience: config.resourceUrl,
    allowedClients: config.allowedClients,
  });
  assertUserOnboarded(user);
  return user;
}

export function mcpProtectedResourceMetadata(
  response: Response,
  config: Pick<McpResourceConfig, 'enabled' | 'resourceUrl'>,
  auth: KeycloakAuthService,
  scopes: readonly string[],
  name: string,
) {
  if (!config.enabled) throw new NotFoundException();
  response.setHeader('Cache-Control', 'no-store');
  return {
    resource: config.resourceUrl,
    authorization_servers: [auth.getIssuerUrl()],
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
    resource_name: name,
  };
}

export function mcpResourceHttpMiddleware(config: McpResourceConfig, paths: { resource: string; metadata: string }) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const path = request.path.toLowerCase().replace(/\/$/, '');
    if (![paths.resource, paths.metadata].includes(path)) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    if (!config.enabled) {
      response.sendStatus(404);
      return;
    }
    const origin = request.headers.origin;
    if (mcpRequestOriginError(request, config)) {
      response.sendStatus(403);
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
      response.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version, Retry-After');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', path === paths.metadata ? 'GET, OPTIONS' : 'POST, OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name',
      );
      response.sendStatus(204);
      return;
    }
    next();
  };
}
