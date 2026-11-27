import { Injectable } from '@nestjs/common';

export const MCP_ADMIN_PATH = '/api/mcp/admin';
export const MCP_ADMIN_METADATA_PATH = '/.well-known/oauth-protected-resource/api/mcp/admin';
export const MCP_ADMIN_READ_SCOPE = 'mcp:admin:read';
export const MCP_ADMIN_PROPOSE_SCOPE = 'mcp:admin:proposals:create';

@Injectable()
export class McpAdminConfig {
  get enabled(): boolean {
    return process.env.MCP_ADMIN_ENABLED === 'true';
  }

  get proposalsEnabled(): boolean {
    return this.enabled && process.env.MCP_ADMIN_PROPOSALS_ENABLED === 'true';
  }

  get resourceUrl(): string {
    return process.env.MCP_ADMIN_RESOURCE_URL?.trim() || 'http://localhost:3000/api/mcp/admin';
  }

  get applicationOrigin(): string {
    return process.env.MCP_ADMIN_APP_ORIGIN?.trim() || new URL(this.resourceUrl).origin;
  }

  get allowedClients(): string[] {
    return (process.env.MCP_ADMIN_ALLOWED_CLIENTS ?? '')
      .split(',')
      .map((client) => client.trim())
      .filter(Boolean);
  }

  get allowedOrigins(): Set<string> {
    return new Set([new URL(this.resourceUrl).origin, ...this.readOrigins('MCP_ADMIN_ALLOWED_ORIGINS')]);
  }

  get webOrigins(): Set<string> {
    const local = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:4200', 'http://localhost:4201'];
    return new Set([
      this.applicationOrigin,
      new URL(this.resourceUrl).origin,
      ...local,
      ...this.readOrigins('MCP_ADMIN_WEB_ORIGINS'),
    ]);
  }

  get metadataUrl(): string {
    return new URL(MCP_ADMIN_METADATA_PATH, this.resourceUrl).href;
  }

  private readOrigins(key: string): string[] {
    return (process.env[key] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
}
