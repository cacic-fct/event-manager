import { assertMcpRawStatement } from './raw-sql-policy';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { adminMcpExecution } from './execution-context';

const raw = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);
const reads = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
export const adminMcpReadOnlyExtension = Prisma.defineExtension({
  name: 'mcp-administrative-read-only',
  query: {
    async $allOperations({ model, operation, args, query }) {
      const execution = adminMcpExecution.getStore();
      if (
        execution?.phase === 'apply' &&
        execution.beforeTransaction &&
        !execution.inTransaction &&
        !reads.has(operation)
      ) {
        throw new ForbiddenException('A alteração MCP exige a transação e a auditoria do domínio.');
      }
      if (execution?.phase === 'read' && !reads.has(operation) && !(execution.readOnlyDatabase && raw.has(operation))) {
        throw new ForbiddenException('Uma consulta MCP não pode modificar dados.');
      }
      if (execution && raw.has(operation) && !execution.trustedRawRead) {
        assertMcpRawStatement(operation, args, execution.phase === 'read');
      }
      const result = await query(args);
      if (execution?.phase === 'apply' && execution.transactionAudit && !model && !execution.trustedRawRead) {
        // A raw SELECT may call a mutating function or CTE. Only the engine's
        // fixed lock/fingerprint queries are exempt from domain audit proof.
        execution.transactionAudit.businessWrites = true;
      }
      if (execution?.phase === 'apply' && execution.transactionAudit && model && !reads.has(operation)) {
        const changed = Array.isArray(result)
          ? result.length > 0
          : result && typeof result === 'object' && 'count' in result
            ? result.count !== 0
            : true;
        if (changed && model !== 'AuditLogEntry') execution.transactionAudit.businessWrites = true;
      }
      return result;
    },
  },
});
