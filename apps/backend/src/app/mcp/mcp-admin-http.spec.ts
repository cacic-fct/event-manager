import { type INestApplication, HttpException, RequestMethod, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { of } from 'rxjs';
import cookieParser from 'cookie-parser';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { KeycloakScopeGuard } from '../auth/guards/keycloak-scope.guard';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { EventAudienceInterceptor } from '../audiences/event-audience.interceptor';
import { EventAudienceService } from '../audiences/event-audience.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { SseReplayService } from '../realtime/sse-replay.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminAuthGuard } from './mcp-admin-auth.guard';
import { McpAdminConfig, MCP_ADMIN_METADATA_PATH } from './mcp-admin.config';
import { McpAdminController } from './mcp-admin.controller';
import { mcpAdminHttpMiddleware } from './mcp-admin-http.middleware';
import { McpAdminMaintenanceService } from './mcp-admin-maintenance.service';
import { McpAdminOperationInterceptor } from './mcp-admin-operation.interceptor';
import { McpAdminOperationLogService } from './mcp-admin-operation-log.service';
import { McpAdminProposalsService } from './mcp-admin-proposals.service';
import { McpAdminReadService } from './mcp-admin-read.service';
import { McpAdminSessionGuard } from './mcp-admin-session.guard';
import {
  McpAdminMetadataController,
  McpAdminToolServer,
  McpAdminTransportController,
} from './mcp-admin-transport.controller';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { McpAdminRealtimeController } from './mcp-admin-realtime.controller';

const { jest } = import.meta;
const invalidReviewHeaders: Record<string, string>[] = [
  { Origin: 'https://attacker.example' },
  { 'X-MCP-Review': '0' },
  { Origin: '' },
];

describe('Admin MCP HTTP and official SDK boundaries', () => {
  const originalEnv = { ...process.env };
  const eventId = randomUUID();
  const delegationId = randomUUID();
  const proposalId = randomUUID();
  const audience = { ...ANONYMOUS_AUDIENCE, userId: 'human', personIds: ['person'], bypass: true };
  let app: INestApplication;
  let origin: string;
  let resource: string;
  const auth = {
    authenticateMcpAccessToken: jest.fn(),
    authenticateSession: jest.fn(),
    authenticateAccessToken: jest.fn(),
    getIssuerUrl: () => 'https://identity.example/realms/cacic',
  };
  const access = { assertEligible: jest.fn(), list: jest.fn(), create: jest.fn(), revoke: jest.fn() };
  const proposals = { propose: jest.fn(), list: jest.fn(), status: jest.fn(), decide: jest.fn() };
  const reads = {
    listDelegations: jest.fn(),
    listEvents: jest.fn(),
    getEvent: jest.fn(),
    attendanceSummary: jest.fn(),
  };
  const log = { start: jest.fn(), finish: jest.fn(), denied: jest.fn() };
  const limits = { assertAllowed: jest.fn() };
  const audiences = { principalForUser: jest.fn(), principalForMcpUser: jest.fn() };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MCP_ADMIN_ENABLED = 'true';
    process.env.MCP_ADMIN_PROPOSALS_ENABLED = 'true';
    process.env.MCP_ADMIN_ALLOWED_CLIENTS = 'approved-ai';
    const module = await Test.createTestingModule({
      controllers: [
        McpAdminTransportController,
        McpAdminMetadataController,
        McpAdminController,
        McpAdminRealtimeController,
      ],
      providers: [
        McpAdminConfig,
        McpAdminToolServer,
        McpAdminAuthGuard,
        McpAdminSessionGuard,
        McpAdminOperationInterceptor,
        { provide: APP_GUARD, useClass: KeycloakScopeGuard },
        { provide: APP_INTERCEPTOR, useClass: EventAudienceInterceptor },
        { provide: KeycloakAuthService, useValue: auth },
        {
          provide: AuthorizationPolicyService,
          useValue: {
            hasEventManagerAccess: () => true,
            assertAudienceForPermissions: jest.fn(),
            buildResourceContext: () => ({}),
          },
        },
        { provide: EventAudienceService, useValue: audiences },
        { provide: McpAdminAccessService, useValue: access },
        { provide: McpAdminProposalsService, useValue: proposals },
        { provide: McpAdminReadService, useValue: reads },
        { provide: McpAdminOperationLogService, useValue: log },
        { provide: RateLimitService, useValue: limits },
        { provide: McpAdminMaintenanceService, useValue: { flush: jest.fn().mockResolvedValue(undefined) } },
        { provide: McpAdminInvalidationService, useValue: { scope: (userId: string) => `own-mcp:${userId}` } },
        {
          provide: RealtimeInvalidationService,
          useValue: { scope: (name: string) => name, watch: () => of({ data: { type: 'MCP_QUEUE_INVALIDATED' } }) },
        },
        {
          provide: SseReplayService,
          useValue: {
            replay: () => of({ id: 'opaque-cursor', data: { proposalId, eventId, description: 'Private text' } }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.use(mcpAdminHttpMiddleware(app.get(McpAdminConfig)));
    app.setGlobalPrefix('api', { exclude: [{ path: MCP_ADMIN_METADATA_PATH, method: RequestMethod.GET }] });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    resource = `${origin}/api/mcp/admin`;
    process.env.MCP_ADMIN_RESOURCE_URL = resource;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MCP_ADMIN_ENABLED = 'true';
    auth.authenticateMcpAccessToken.mockResolvedValue(principal(true));
    auth.authenticateSession.mockResolvedValue(principal(false));
    auth.authenticateAccessToken.mockRejectedValue(new UnauthorizedException());
    limits.assertAllowed.mockResolvedValue(undefined);
    access.assertEligible.mockResolvedValue(undefined);
    log.start.mockResolvedValue(randomUUID());
    log.finish.mockResolvedValue(undefined);
    log.denied.mockResolvedValue(undefined);
    proposals.propose.mockResolvedValue({ proposalId, state: 'PENDING', appliesAutomatically: false });
    proposals.decide.mockResolvedValue(undefined);
    proposals.list.mockResolvedValue({ items: [], hasMore: false });
    reads.getEvent.mockImplementation(async () => ({ id: eventId, contextUserId: audienceContext.getStore()?.userId }));
    audiences.principalForUser.mockResolvedValue(audience);
    audiences.principalForMcpUser.mockResolvedValue(audience);
  });

  afterAll(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it('serves RFC 9728 metadata at the root well-known path, using configured URLs', async () => {
    const response = await fetch(`${origin}${MCP_ADMIN_METADATA_PATH}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource,
      authorization_servers: [auth.getIssuerUrl()],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:admin:read', 'mcp:admin:proposals:create'],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('challenges missing credentials and never substitutes a website session for MCP OAuth', async () => {
    const response = await fetch(resource, {
      method: 'POST',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=website` },
      body: '{}',
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(`${origin}${MCP_ADMIN_METADATA_PATH}`);
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(log.denied).toHaveBeenCalledWith({ tool: 'authenticate' });
  });

  it.each(['2026-07-28', '2025-11-25', '2025-06-18'])(
    'lists only explicit safe tools for protocol %s',
    async (version) => {
      const response = await rpc('tools/list', {}, version);
      const result = await message(response);
      expect(response.status).toBe(200);
      const tools = result.result.tools;
      expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
        'list_delegations',
        'list_events',
        'get_event',
        'get_attendance_summary',
        'propose_event_description_change',
        'get_proposal_status',
      ]);
      expect(tools.find((tool: { name: string }) => tool.name === 'propose_event_description_change')).toMatchObject({
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      });
      expect(auth.authenticateMcpAccessToken).toHaveBeenCalledWith('verified-token', {
        audience: resource,
        allowedClients: ['approved-ai'],
      });
      expect(auth.authenticateAccessToken).not.toHaveBeenCalled();
      expect(auth.authenticateSession).not.toHaveBeenCalled();
    },
  );

  it('negotiates the legacy handshake through the official SDK without allocating HTTP sessions', async () => {
    const response = await rpc(
      'initialize',
      { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      '2025-11-25',
    );
    expect((await message(response)).result.protocolVersion).toBe('2025-11-25');
    expect(response.headers.has('mcp-session-id')).toBe(false);
  });

  it('propagates a verified MCP audience principal into the tool operation without syncing identity', async () => {
    const response = await rpc('tools/call', { name: 'get_event', arguments: { delegationId, eventId } });
    expect((await message(response)).result.structuredContent).toEqual({ id: eventId, contextUserId: 'human' });
    expect(audiences.principalForMcpUser).toHaveBeenCalled();
    expect(reads.getEvent).toHaveBeenCalledWith(expect.objectContaining({ sub: 'human' }), delegationId, eventId);
    expect(log.start).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'tool:get_event',
        delegationId,
        eventId,
        clientId: 'approved-ai',
        userId: 'human',
      }),
    );
    expect(log.finish).toHaveBeenCalledWith(expect.any(String), 'SUCCEEDED');
  });

  it('queues a strict description proposal and reports that no business edit was applied', async () => {
    const input = {
      delegationId,
      eventId,
      description: 'Descrição proposta',
      expectedUpdatedAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    };
    const response = await rpc('tools/call', { name: 'propose_event_description_change', arguments: input });
    expect((await message(response)).result.structuredContent).toMatchObject({
      proposalId,
      state: 'PENDING',
      appliesAutomatically: false,
    });
    expect(proposals.propose).toHaveBeenCalledWith(expect.objectContaining({ sub: 'human' }), input);
    expect(proposals.decide).not.toHaveBeenCalled();
  });

  it.each(['approved', 'publishAfterUpdate', 'eventGroupId'])(
    'rejects unknown proposal argument %s without invoking the domain operation',
    async (extra) => {
      const response = await rpc('tools/call', {
        name: 'propose_event_description_change',
        arguments: {
          delegationId,
          eventId,
          description: 'Texto',
          expectedUpdatedAt: new Date().toISOString(),
          idempotencyKey: randomUUID(),
          [extra]: true,
        },
      });
      const result = await message(response);
      expect(result.result?.isError === true || result.error !== undefined).toBe(true);
      expect(proposals.propose).not.toHaveBeenCalled();
      expect(log.finish).toHaveBeenCalledWith(expect.any(String), 'DENIED');
    },
  );

  it('has no tool capable of approval or generic arbitrary API execution', async () => {
    const response = await rpc('tools/call', { name: 'approve_proposal', arguments: { proposalId } });
    const result = await message(response);
    expect(result.error !== undefined || result.result?.isError === true).toBe(true);
    expect(proposals.decide).not.toHaveBeenCalled();
  });

  it('returns an OAuth scope challenge before dispatching a write with a read-only token', async () => {
    const user = principal(true);
    user.oidcScopeSet = new Set(['mcp:admin:read']);
    auth.authenticateMcpAccessToken.mockResolvedValue(user);
    const response = await rpc('tools/call', { name: 'propose_event_description_change', arguments: {} });
    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
    expect(response.headers.get('www-authenticate')).toContain('mcp:admin:proposals:create');
    expect(proposals.propose).not.toHaveBeenCalled();
  });

  it.each(['https://attacker.example', 'null'])('rejects untrusted Origin %s before dispatch', async (untrusted) => {
    const response = await rpc('tools/list', {}, '2026-07-28', { origin: untrusted });
    expect(response.status).toBe(403);
    expect(reads.listDelegations).not.toHaveBeenCalled();
  });

  it('validates the Host header and supports bounded bearer preflight without credentials', async () => {
    const hostileStatus = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(resource, { method: 'POST', headers: { Host: 'attacker.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end('{}');
    });
    expect(hostileStatus).toBe(403);
    const response = await fetch(resource, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Headers': 'Authorization, MCP-Method, MCP-Name' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('rejects version header/body disagreement through the SDK', async () => {
    const response = await rpc('tools/list', {}, '2026-07-28', { 'MCP-Protocol-Version': '2025-11-25' });
    expect(response.status).toBe(400);
  });

  it.each(['GET', 'DELETE'])('does not allocate standing HTTP streams or sessions for %s', async (method) => {
    const response = await fetch(resource, {
      method,
      headers: { Authorization: 'Bearer verified-token', Accept: 'application/json, text/event-stream' },
    });
    expect(response.status).toBe(405);
  });

  it('rejects MCP bearer approval even when a website cookie accompanies it', async () => {
    const response = await webDecision({ Authorization: 'Bearer verified-token' });
    expect(response.status).toBe(401);
    expect(proposals.decide).not.toHaveBeenCalled();
    expect(auth.authenticateSession).not.toHaveBeenCalled();
  });

  it('does not permit MCP bearer credentials on the application-only live queue stream', async () => {
    const response = await fetch(`${origin}/api/realtime/admin/mcp/events`, {
      headers: { Authorization: 'Bearer verified-token', Cookie: `${AUTH_SESSION_COOKIE_NAME}=website` },
    });
    expect(response.status).toBe(401);
    expect(auth.authenticateSession).not.toHaveBeenCalled();
  });

  it('serves application SSE with the shared cursor and only a content-free invalidation', async () => {
    const response = await fetch(`${origin}/api/realtime/admin/mcp/events`, {
      headers: { Cookie: `${AUTH_SESSION_COOKIE_NAME}=website`, 'Last-Event-ID': 'previous-cursor' },
    });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(stream).toContain('id: opaque-cursor');
    expect(stream).toContain('MCP_QUEUE_INVALIDATED');
    expect(stream).not.toContain(proposalId);
    expect(stream).not.toContain(eventId);
    expect(stream).not.toContain('Private text');
  });

  it.each(invalidReviewHeaders)('requires session-bound CSRF protections for review: %p', async (headers) => {
    const response = await webDecision(headers);
    expect(response.status).toBe(403);
    expect(proposals.decide).not.toHaveBeenCalled();
  });

  it('approves only through the application session and logs the web review attempt', async () => {
    const expectedUpdatedAt = new Date().toISOString();
    const response = await webDecision({}, { decision: 'APPROVE', expectedUpdatedAt });
    expect(response.status).toBe(201);
    expect(proposals.decide).toHaveBeenCalledWith(expect.objectContaining({ sub: 'human' }), proposalId, {
      decision: 'APPROVE',
      expectedUpdatedAt,
    });
    expect(log.start).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'web:decideProposal', proposalId, userId: 'human' }),
    );
  });

  it('does not persist more auth log rows after the shared rate limiter rejects traffic', async () => {
    limits.assertAllowed.mockRejectedValue(new HttpException('Too many requests', 429));
    const response = await rpc('tools/list');
    expect(response.status).toBe(429);
    expect(auth.authenticateMcpAccessToken).not.toHaveBeenCalled();
    expect(log.denied).not.toHaveBeenCalled();
  });

  it('disables the endpoint and metadata independently of existing credentials', async () => {
    process.env.MCP_ADMIN_ENABLED = 'false';
    expect((await rpc('tools/list')).status).toBe(404);
    expect((await fetch(`${origin}${MCP_ADMIN_METADATA_PATH}`)).status).toBe(404);
    expect(auth.authenticateMcpAccessToken).not.toHaveBeenCalled();
  });

  async function rpc(
    method: string,
    params: Record<string, unknown> = {},
    version = '2026-07-28',
    headers: Record<string, string> = {},
  ) {
    const modern = version === '2026-07-28';
    return fetch(resource, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer verified-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': version,
        ...(modern
          ? { 'MCP-Method': method, ...(typeof params['name'] === 'string' ? { 'MCP-Name': params['name'] } : {}) }
          : {}),
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomUUID(),
        method,
        params: modern
          ? {
              ...params,
              _meta: {
                'io.modelcontextprotocol/protocolVersion': version,
                'io.modelcontextprotocol/clientCapabilities': {},
                'io.modelcontextprotocol/clientInfo': { name: 'integration-test', version: '1' },
              },
            }
          : params,
      }),
    });
  }

  async function webDecision(
    headers: Record<string, string> = {},
    body: unknown = { decision: 'APPROVE', expectedUpdatedAt: new Date().toISOString() },
  ) {
    return fetch(`${origin}/api/admin/mcp/proposals/${proposalId}/decision`, {
      method: 'POST',
      headers: {
        Cookie: `${AUTH_SESSION_COOKIE_NAME}=website-session`,
        Origin: origin,
        'X-MCP-Review': '1',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }
});

function principal(mcp: boolean): AuthenticatedUser {
  const scopes = ['mcp:admin:read', 'mcp:admin:proposals:create'];
  return {
    sub: 'human',
    authenticationTransport: mcp ? 'mcp' : undefined,
    realm_access: { roles: [] },
    token: 'verified-token',
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: mcp ? scopes : [],
    oidcScopeSet: new Set(mcp ? scopes : []),
    scopes: [],
    scopeSet: new Set(),
    claims: { azp: mcp ? 'approved-ai' : 'website', is_onboarded: true },
  };
}

async function message(response: Response) {
  const text = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? (text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .at(-1)
        ?.slice(5) ?? '{}')
    : text;
  return JSON.parse(data) as {
    result: {
      tools: { name: string; annotations: Record<string, unknown> }[];
      protocolVersion: string;
      structuredContent: Record<string, unknown>;
      isError?: boolean;
    };
    error?: Record<string, unknown>;
  };
}
