import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import type { Permission } from '@cacic-fct/shared-permissions';
import type { AuthorizationResourceContext } from '../../authorization/authorization-policy.service';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

export interface AdminMcpExecution {
  request: object;
  user: AuthenticatedUser;
  phase: 'read' | 'apply';
  proposalId?: string;
  delegationId: string;
  clientId: string;
  operation: string;
  approvedByName?: string;
  inTransaction?: boolean;
  trustedRawRead?: boolean;
  readOnlyDatabase?: boolean;
  transactionAudit?: { businessWrites: boolean; recorded: boolean; validatedNoop?: boolean };
  beforeTransaction?: (tx: Prisma.TransactionClient) => Promise<void>;
  reviewMetadata?: Record<string, unknown>;
  assertScope?: (permissions: readonly Permission[], context: AuthorizationResourceContext) => Promise<void>;
}
// Only server code can enter this context. HTTP bodies/headers cannot mint it.
export const adminMcpExecution = new AsyncLocalStorage<AdminMcpExecution>();
export function trustedAdminMcpPrincipal(request: object): AuthenticatedUser | undefined {
  const execution = adminMcpExecution.getStore();
  return execution?.request === request ? execution.user : undefined;
}
