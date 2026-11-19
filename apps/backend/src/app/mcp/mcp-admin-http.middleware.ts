import type { NextFunction, Request, Response } from 'express';
import { McpAdminConfig, MCP_ADMIN_METADATA_PATH, MCP_ADMIN_PATH } from './mcp-admin.config';

export function mcpAdminHttpMiddleware(config: McpAdminConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (![MCP_ADMIN_PATH, `${MCP_ADMIN_PATH}/`, MCP_ADMIN_METADATA_PATH].includes(request.path)) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    if (!config.enabled) {
      response.sendStatus(404);
      return;
    }
    const origin = request.headers.origin;
    if (
      request.headers.host !== new URL(config.resourceUrl).host ||
      (origin !== undefined && !config.allowedOrigins.has(origin))
    ) {
      response.sendStatus(403);
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
      response.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version, Retry-After');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader(
        'Access-Control-Allow-Methods',
        request.path === MCP_ADMIN_METADATA_PATH ? 'GET, OPTIONS' : 'POST, OPTIONS',
      );
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
