import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertMcpRawStatement } from './raw-sql-policy';

function tagged(strings: TemplateStringsArray, ...values: unknown[]) {
  return [strings, ...values];
}

describe('administrative MCP raw SQL statement boundary', () => {
  it('accepts recognized single read statements and examines SQL rather than bound values', () => {
    for (const args of [
      tagged`SELECT id FROM events WHERE name = ${"'; COMMIT; UPDATE events"}`,
      [Prisma.sql`SELECT id FROM events WHERE name = ${'value;with;semicolons'}`],
      [{ text: 'SELECT id FROM events WHERE id = $1', values: ['COMMIT;'] }],
      [{ strings: ['WITH rows AS (SELECT 1) SELECT * FROM rows'] }],
    ])
      expect(() => assertMcpRawStatement('$queryRaw', args, true)).not.toThrow();
  });

  it.each(['$queryRawUnsafe', '$executeRawUnsafe'])('always rejects unsafe entrypoint %s', (operation) => {
    expect(() => assertMcpRawStatement(operation, [{ sql: 'SELECT 1' }], true)).toThrow(ForbiddenException);
    expect(() => assertMcpRawStatement(operation, [{ sql: 'SELECT 1' }], false)).toThrow(ForbiddenException);
  });

  it.each([
    'SELECT 1; COMMIT',
    'COMMIT',
    'BEGIN READ WRITE',
    'END',
    'ROLLBACK',
    'ABORT',
    'START TRANSACTION',
    'SAVEPOINT business',
    'RELEASE SAVEPOINT business',
    'SET TRANSACTION READ WRITE',
    'RESET ALL',
    "PREPARE TRANSACTION 'escape'",
    'EXECUTE prepared',
    'DEALLOCATE ALL',
    'DO $$ BEGIN NULL END $$',
    'CALL commit_proc()',
    '/* context */ COMMIT',
    '-- context\nCOMMIT',
    '/* outer /* inner */ comment */ ROLLBACK',
    "SELECT ';'",
    'SELECT 1 /* ; conservative refusal */',
  ])('rejects transaction escape or unsupported statement %s in both phases', (sql) => {
    for (const readOnly of [true, false]) {
      expect(() => assertMcpRawStatement('$queryRaw', [{ sql }], readOnly)).toThrow(ForbiddenException);
    }
  });

  it.each([undefined, [], {}, [{ values: ['SELECT 1'] }], [{ sql: 1 }]].map((args) => ({ args })))(
    'fails closed for unknown SQL representation: %p',
    ({ args }) => {
      expect(() => assertMcpRawStatement('$queryRaw', args, true)).toThrow(ForbiddenException);
    },
  );

  it('defers writable CTE enforcement to the actual database read-only transaction', () => {
    const sql = 'WITH changed AS (UPDATE events SET name = $1 RETURNING id) SELECT * FROM changed';
    expect(() => assertMcpRawStatement('$queryRaw', [{ sql, values: ['changed'] }], true)).not.toThrow();
    expect(() => assertMcpRawStatement('$executeRaw', [{ sql: 'UPDATE events SET name = $1' }], true)).toThrow(
      ForbiddenException,
    );
    expect(() => assertMcpRawStatement('$executeRaw', [{ sql: 'UPDATE events SET name = $1' }], false)).not.toThrow();
  });
});
