import { ForbiddenException } from '@nestjs/common';

/** The SQL itself comes from owning server code; tool inputs are bound values. */
function statement(args: unknown): string {
  const first = Array.isArray(args) ? args[0] : args;
  if (Array.isArray(first)) return first.join('?');
  if (first && typeof first === 'object') {
    if ('sql' in first && typeof first.sql === 'string') return first.sql;
    if ('text' in first && typeof first.text === 'string') return first.text;
    if ('strings' in first && Array.isArray(first.strings)) return first.strings.join('?');
  }
  return '';
}
export function assertMcpRawStatement(operation: string, args: unknown, readOnly: boolean): void {
  const sql = statement(args);
  // A read-only transaction can be escaped by ending it. Unsafe entry points,
  // stacked statements and transaction-control commands are never supported.
  // This deliberately rejects semicolons even in literals/comments. PostgreSQL's
  // READ ONLY mode, not the SELECT prefix, rejects writable CTEs and functions.
  if (
    operation.endsWith('Unsafe') ||
    !sql ||
    sql.includes(';') ||
    /^\s*(?:--|\/\*)/.test(sql) ||
    /^\s*(?:BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|SET|RESET|PREPARE|EXECUTE|DEALLOCATE|DO|CALL)\b/i.test(
      sql,
    ) ||
    (readOnly && !/^\s*(?:SELECT|WITH)\b/i.test(sql))
  ) {
    throw new ForbiddenException('A operação SQL não é compatível com a execução MCP protegida.');
  }
}
