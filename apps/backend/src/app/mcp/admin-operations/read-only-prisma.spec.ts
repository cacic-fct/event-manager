import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { adminMcpExecution } from './execution-context';
import { adminMcpReadOnlyExtension } from './read-only-prisma';
const { jest } = import.meta;

type ExtensionHook = (input: {
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

function hook(): ExtensionHook {
  const extension = adminMcpReadOnlyExtension({
    $extends: (configuration: unknown) => configuration,
  } as never) as unknown as {
    query: { $allOperations: ExtensionHook };
  };
  return extension.query.$allOperations;
}

function run(phase: 'read' | 'apply', callback: () => Promise<unknown>) {
  return adminMcpExecution.run(
    {
      request: {},
      user: {} as AuthenticatedUser,
      phase,
      delegationId: 'delegation',
      clientId: 'client',
      operation: 'event',
    },
    callback,
  );
}

describe('administrative MCP Prisma read-only boundary', () => {
  it.each([
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
    '$executeRaw',
    '$executeRawUnsafe',
    '$queryRaw',
    '$queryRawUnsafe',
  ])('rejects %s before invoking the Prisma engine', async (operation) => {
    const query = jest.fn(async () => 'written');
    const args = { query: 'WITH modified AS (DELETE FROM example RETURNING *) SELECT * FROM modified' };
    await expect(run('read', () => hook()({ operation, args, query }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
  ])('permits %s and preserves the original query arguments', async (operation) => {
    const args = { where: { id: 'event' }, take: 10 };
    const result = [{ id: 'event' }];
    const query = jest.fn(async () => result);
    await expect(run('read', () => hook()({ operation, args, query }))).resolves.toBe(result);
    expect(query).toHaveBeenCalledWith(args);
  });

  it('requires the owning transaction for guarded applies and permits writes only after entry', async () => {
    const query = jest.fn(async () => 'written');
    const beforeTransaction = jest.fn(async () => undefined);
    const execution = {
      request: {},
      user: {} as AuthenticatedUser,
      phase: 'apply' as const,
      clientId: 'client',
      delegationId: 'delegation',
      operation: 'updateEvent',
      beforeTransaction,
    };
    await expect(
      adminMcpExecution.run(execution, () => hook()({ operation: 'update', args: {}, query })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    await expect(
      adminMcpExecution.run({ ...execution, inTransaction: true }, () =>
        hook()({ operation: 'update', args: {}, query }),
      ),
    ).resolves.toBe('written');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains ordinary and approved mutation behavior without leaking across concurrent phases', async () => {
    const query = jest.fn(async () => 'written');
    await expect(hook()({ operation: 'update', args: {}, query })).resolves.toBe('written');
    const results = await Promise.allSettled([
      run('read', async () => {
        await Promise.resolve();
        return hook()({ operation: 'update', args: {}, query });
      }),
      run('apply', async () => {
        await Promise.resolve();
        return hook()({ operation: 'update', args: {}, query });
      }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
