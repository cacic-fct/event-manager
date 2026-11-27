import type { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { adminMcpExecution } from '../mcp/admin-operations/execution-context';

// Attribution alone carries no execution identity, permission or delegation capability.
export const mcpJobAttribution = new AsyncLocalStorage<Record<string, string>>();
const fields = [
  'proposalId',
  'delegationId',
  'clientId',
  'operation',
  'proposedById',
  'approvedById',
  'approvedByName',
] as const;

export function readMcpAttribution(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Reflect.get(value, 'source') !== 'mcp') return undefined;
  const result: Record<string, string> = { source: 'mcp' };
  for (const field of fields) {
    const item: unknown = Reflect.get(value, field);
    if (typeof item === 'string') result[field] = item;
  }
  return result['proposalId'] ? result : undefined;
}

export function currentMcpAttribution(): Record<string, string> | undefined {
  const context = adminMcpExecution.getStore();
  if (context?.phase !== 'apply' || !context.proposalId) return undefined;
  return readMcpAttribution({
    source: 'mcp',
    proposalId: context.proposalId,
    delegationId: context.delegationId,
    clientId: context.clientId,
    operation: context.operation,
    proposedById: context.user.sub,
    approvedById: context.user.sub,
    approvedByName: context.approvedByName,
  });
}

// Privacy cleanup takes the exclusive form before selecting audit entries.
export async function lockMcpJobAttribution(tx: Prisma.TransactionClient, cleanup = false): Promise<void> {
  if (cleanup) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mcp-job-attribution-privacy'))`;
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext('mcp-job-attribution-privacy'))`;
}
