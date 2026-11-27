import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { adminMcpExecution, trustedAdminMcpPrincipal, type AdminMcpExecution } from './execution-context';

function execution(request: object, sub = 'operator'): AdminMcpExecution {
  return {
    request,
    user: { sub } as AuthenticatedUser,
    phase: 'read',
    delegationId: 'delegation-' + sub,
    clientId: 'client-' + sub,
    operation: 'event',
  };
}

describe('administrative MCP request identity capability', () => {
  it('does not trust a user, transport marker, header or serialized capability', () => {
    const request = {
      user: { sub: 'forged', authenticationTransport: 'mcp' },
      headers: { 'x-mcp-internal': 'true', 'x-mcp-client-id': 'forged' },
      body: { phase: 'apply', user: { sub: 'forged' }, clientId: 'forged' },
    };
    expect(trustedAdminMcpPrincipal(request)).toBeUndefined();
    expect(adminMcpExecution.getStore()).toBeUndefined();
  });

  it('requires the exact server-created request identity inside the active context', async () => {
    const request = { headers: {} };
    const context = execution(request);
    await adminMcpExecution.run(context, async () => {
      await Promise.resolve();
      expect(trustedAdminMcpPrincipal(request)).toBe(context.user);
      expect(trustedAdminMcpPrincipal({ ...request })).toBeUndefined();
      expect(trustedAdminMcpPrincipal({})).toBeUndefined();
    });
    expect(trustedAdminMcpPrincipal(request)).toBeUndefined();
    expect(adminMcpExecution.getStore()).toBeUndefined();
  });

  it('isolates concurrent clients across awaits and restores the parent after nesting', async () => {
    const requests = [{}, {}];
    const contexts = requests.map((request, index) => execution(request, 'operator-' + index));
    await Promise.all(
      contexts.map((context, index) =>
        adminMcpExecution.run(context, async () => {
          await Promise.resolve();
          expect(trustedAdminMcpPrincipal(requests[index])).toBe(context.user);
          expect(trustedAdminMcpPrincipal(requests[1 - index])).toBeUndefined();
          await adminMcpExecution.run(execution({}, 'nested'), async () => {
            await Promise.resolve();
            expect(trustedAdminMcpPrincipal(requests[index])).toBeUndefined();
          });
          expect(adminMcpExecution.getStore()).toBe(context);
        }),
      ),
    );
    expect(adminMcpExecution.getStore()).toBeUndefined();
  });

  it('cleans up after a rejected operation', async () => {
    const request = {};
    await expect(
      adminMcpExecution.run(execution(request), async () => {
        await Promise.resolve();
        throw new Error('domain failure');
      }),
    ).rejects.toThrow('domain failure');
    expect(trustedAdminMcpPrincipal(request)).toBeUndefined();
  });
});
