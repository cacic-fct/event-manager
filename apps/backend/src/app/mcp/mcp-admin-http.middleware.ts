import { McpAdminConfig, MCP_ADMIN_METADATA_PATH, MCP_ADMIN_PATH } from './mcp-admin.config';
import { mcpResourceHttpMiddleware } from './shared/oauth-resource';

export function mcpAdminHttpMiddleware(config: McpAdminConfig) {
  return mcpResourceHttpMiddleware(config, { resource: MCP_ADMIN_PATH, metadata: MCP_ADMIN_METADATA_PATH });
}
