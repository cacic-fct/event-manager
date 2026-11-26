import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { McpAdminArtifactTools } from './artifact-tools';
const { jest } = import.meta;

function fixture(scopes: string[], allowed: string[]) {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>();
  const server = {
    registerTool: (...args: unknown[]) => {
      callbacks.set(String(args[0]), args[2] as (args: Record<string, unknown>) => Promise<CallToolResult>);
    },
  };
  const artifacts = { begin: jest.fn(async () => ({ artifactId: 'file' })) };
  const tools = new McpAdminArtifactTools(artifacts as never);
  const user = {
    sub: 'owner',
    claims: { azp: 'client' },
    oidcScopeSet: new Set(scopes),
  } as unknown as AuthenticatedUser;
  tools.register(
    server as unknown as McpServer,
    user,
    async (work) => ({
      content: [],
      structuredContent: (await work()) as Record<string, unknown>,
    }),
    new Set(allowed),
  );
  return { callbacks, artifacts };
}

describe('private file tool admission', () => {
  it('does not advertise file tools for unrelated event grants', () => {
    expect(fixture(['mcp:admin:read'], ['event']).callbacks.size).toBe(0);
  });

  it('allows staging a large read-only transfer preview without mutation authority', async () => {
    const { callbacks, artifacts } = fixture(['mcp:admin:read'], ['previewDataTransfer']);
    const begin = callbacks.get('begin_admin_file');
    expect(begin).toBeDefined();
    await begin?.({ operation: 'previewDataTransfer', delegationId: 'grant', purpose: 'data-transfer-document' });
    expect(artifacts.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        clientId: 'client',
        delegationId: 'grant',
        operation: 'previewDataTransfer',
      }),
    );
    await expect(begin?.({ operation: 'applyDataTransfer', delegationId: 'grant' })).rejects.toThrow('Escopo');
  });

  it('advertises only chunk reads for an export-only read grant', () => {
    for (const operation of ['exportEventFormResultsCsv', 'exportDataTransfer'])
      expect([...fixture(['mcp:admin:read'], [operation]).callbacks.keys()]).toEqual(['read_admin_file_chunk']);
  });
});
