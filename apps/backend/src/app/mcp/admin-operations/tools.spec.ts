import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AdminMcpGraphqlBridge } from './graphql-bridge';
import type { AdminMcpCommandService } from './command-service';
import { AdminMcpOperationTools } from './tools';
const { jest } = import.meta;

function fixture(allowed = ['event', 'updateEvent']) {
  const user = {
    sub: 'operator',
    oidcScopeSet: new Set(['mcp:admin:read', 'mcp:admin:proposals:create']),
  } as unknown as AuthenticatedUser;
  const catalog = [
    {
      field: 'event',
      tool: 'admin_event',
      label: 'Consultar evento',
      kind: 'query',
      domain: 'events',
      personalData: false,
      description: 'Consulta.',
    },
    {
      field: 'updateEvent',
      tool: 'propose_admin_updateEvent',
      label: 'Editar evento',
      kind: 'mutation',
      domain: 'events',
      personalData: false,
      description: 'Propõe alteração.',
    },
    {
      field: 'deleteEvent',
      tool: 'propose_admin_deleteEvent',
      label: 'Excluir evento',
      kind: 'mutation',
      domain: 'events',
      personalData: false,
      description: 'Propõe exclusão.',
    },
  ];
  const bridge = { catalog: () => catalog, operation: () => ({ schema: z.strictObject({ id: z.string() }) }) };
  const commands = {
    catalog: () => catalog,
    delegations: jest.fn().mockResolvedValue([{ operations: allowed }]),
    read: jest.fn().mockResolvedValue({ id: 'event-a' }),
    propose: jest.fn().mockResolvedValue({ proposalId: 'queued', appliesAutomatically: false }),
    status: jest.fn().mockResolvedValue({ state: 'PENDING' }),
  };
  const tools = new AdminMcpOperationTools(
    bridge as unknown as AdminMcpGraphqlBridge,
    commands as unknown as AdminMcpCommandService,
  );
  const handler = createMcpHandler(async () => {
    const server = new McpServer({ name: 'test', version: '1' });
    await tools.register(server, user, async (action) => {
      const result = await action();
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
      };
    });
    return server;
  });
  async function request(method: string, params: Record<string, unknown> = {}) {
    const response = await handler.fetch(
      new Request('https://events.example/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'MCP-Method': method,
          ...(typeof params['name'] === 'string' ? { 'MCP-Name': params['name'] } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
    );
    return (await response.json()) as {
      result?: {
        tools?: { name: string }[];
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
      };
      error?: unknown;
    };
  }
  return { user, commands, handler, request };
}

describe('named administrative MCP tools through the official SDK', () => {
  it('exposes only active delegated operations plus safe discovery/status tools', async () => {
    const f = fixture();
    try {
      const result = await f.request('tools/list');
      expect(result.result?.tools?.map((item) => item.name)).toEqual([
        'list_admin_delegations',
        'list_admin_operations',
        'get_admin_proposal_status',
        'admin_event',
        'propose_admin_updateEvent',
      ]);
      expect(f.commands.delegations).toHaveBeenCalledWith(f.user, true);
    } finally {
      await f.handler.close();
    }
  });
  it('does not advertise mutation tools without active grants', async () => {
    const f = fixture([]);
    try {
      expect((await f.request('tools/list')).result?.tools).toHaveLength(3);
    } finally {
      await f.handler.close();
    }
  });
  it('routes a typed read to its delegated owning operation', async () => {
    const f = fixture();
    const delegationId = randomUUID();
    try {
      const result = await f.request('tools/call', {
        name: 'admin_event',
        arguments: { delegationId, arguments: { id: 'event-a' } },
      });
      expect(result.result?.structuredContent).toEqual({ id: 'event-a' });
      expect(f.commands.read).toHaveBeenCalledWith(f.user, delegationId, 'event', { id: 'event-a' });
      expect(f.commands.propose).not.toHaveBeenCalled();
    } finally {
      await f.handler.close();
    }
  });
  it('stages a mutation with a fixed operation name, never an executable document', async () => {
    const f = fixture();
    const delegationId = randomUUID();
    const idempotencyKey = randomUUID();
    try {
      const result = await f.request('tools/call', {
        name: 'propose_admin_updateEvent',
        arguments: { delegationId, idempotencyKey, arguments: { id: 'event-a' } },
      });
      expect(result.result?.structuredContent).toMatchObject({ appliesAutomatically: false });
      expect(f.commands.propose).toHaveBeenCalledWith(
        f.user,
        delegationId,
        'updateEvent',
        { id: 'event-a' },
        idempotencyKey,
      );
    } finally {
      await f.handler.close();
    }
  });
  it('rejects extra source/field-selection inputs and undelegated operations', async () => {
    const f = fixture();
    try {
      const result = await f.request('tools/call', {
        name: 'admin_event',
        arguments: { delegationId: randomUUID(), arguments: { id: 'event-a', query: 'mutation { deleteEvent }' } },
      });
      expect(result.error !== undefined || result.result?.isError === true).toBe(true);
      expect(f.commands.read).not.toHaveBeenCalled();
      const undelegated = await f.request('tools/call', { name: 'propose_admin_deleteEvent', arguments: {} });
      expect(undelegated.error !== undefined || undelegated.result?.isError === true).toBe(true);
      expect(f.commands.propose).not.toHaveBeenCalled();
    } finally {
      await f.handler.close();
    }
  });
});
