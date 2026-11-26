import { currentMcpAttribution, mcpJobAttribution, readMcpAttribution } from './mcp-job-attribution';
import {
  adminMcpExecution,
  trustedAdminMcpPrincipal,
  type AdminMcpExecution,
} from '../mcp/admin-operations/execution-context';

describe('MCP job attribution', () => {
  it('copies attribution only, never authentication or review payloads', () => {
    expect(readMcpAttribution({ source: 'manual', proposalId: 'p' })).toBeUndefined();
    expect(readMcpAttribution({ source: 'mcp', proposalId: 'p', token: 'secret', arguments: {} })).toEqual({
      source: 'mcp',
      proposalId: 'p',
    });
    expect(currentMcpAttribution()).toBeUndefined();
  });

  it('does not authorize worker requests', () => {
    mcpJobAttribution.run({ source: 'mcp', proposalId: 'p' }, () => {
      expect(trustedAdminMcpPrincipal({})).toBeUndefined();
      expect(adminMcpExecution.getStore()).toBeUndefined();
    });
  });

  it('captures the approved operation without persisting its execution capability', () => {
    const execution = {
      phase: 'apply',
      proposalId: 'p',
      delegationId: 'd',
      clientId: 'c',
      operation: 'notifyEventParticipants',
      user: { sub: 'admin', token: 'secret' },
      request: {},
      approvedByName: 'Admin',
    } as unknown as AdminMcpExecution;
    adminMcpExecution.run(execution, () => {
      expect(currentMcpAttribution()).toEqual({
        source: 'mcp',
        proposalId: 'p',
        delegationId: 'd',
        clientId: 'c',
        operation: 'notifyEventParticipants',
        proposedById: 'admin',
        approvedById: 'admin',
        approvedByName: 'Admin',
      });
    });
  });
});
