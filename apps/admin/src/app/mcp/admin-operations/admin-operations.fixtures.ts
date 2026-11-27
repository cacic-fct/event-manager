import type { AdminMcpCommand, AdminMcpOperationInfo, McpAdminSettings } from '@cacic-fct/event-manager-mcp-contracts';

export const operationSettings: McpAdminSettings = {
  enabled: true,
  proposalsEnabled: true,
  resourceUrl: '/api/mcp/admin',
  clients: [{ id: 'demo-client', name: 'Assistente de demonstração' }],
};
export const sportsOperation: AdminMcpOperationInfo = {
  field: 'updateSportsMatch',
  tool: 'admin_update_sports_match',
  kind: 'mutation',
  domain: 'Esportes',
  label: 'Atualizar partida esportiva',
  description: 'Atualiza os dados de uma partida.',
  personalData: false,
  inputSchema: {
    type: 'object',
    required: ['matchId'],
    properties: {
      matchId: { type: 'string', title: 'Partida' },
      score: { type: 'number', title: 'Pontuação' },
      notes: { type: 'string', title: 'Observações' },
    },
  },
};
export function sportsCommand(): AdminMcpCommand {
  const now = Date.now();
  return {
    targets: [{ kind: 'SportsTeam', id: 'equipe-demo', label: 'Equipe Azul (demonstração)' }],
    id: 'demo-command',
    delegationId: 'demo-access',
    operation: sportsOperation.field,
    operationLabel: sportsOperation.label,
    domain: sportsOperation.domain,
    clientId: 'demo-client',
    state: 'PENDING',
    arguments: { matchId: 'partida-demo', score: 2, notes: 'Resultado de demonstração' },
    inputSchema: sportsOperation.inputSchema,
    effects: 'Atualiza a partida. Confira o resultado antes de executar.',
    fingerprint: 'demo-fingerprint',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
    decidedAt: null,
    approvedByName: null,
    canApprove: true,
    unavailableReason: null,
  };
}
