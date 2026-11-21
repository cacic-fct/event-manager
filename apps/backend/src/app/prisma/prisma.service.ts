import { adminMcpExecution } from '../mcp/admin-operations/execution-context';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { adminMcpReadOnlyExtension } from '../mcp/admin-operations/read-only-prisma';
import { type INestApplication, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { audiencePrismaExtension } from '../audiences/audience-prisma.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      // Recycle busy pool connections so their PostgreSQL backends release retained heap memory.
      maxLifetimeSeconds: 300,
    });

    super({ adapter });

    const scoped = this.$extends(audiencePrismaExtension).$extends(adminMcpReadOnlyExtension);
    return new Proxy(this, {
      get(target, property, receiver) {
        const execution = adminMcpExecution.getStore();
        if (
          execution?.phase === 'read' &&
          (property === '$transaction' ||
            ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].includes(String(property)))
        ) {
          type ReadRun = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) => Promise<T>;
          const run = scoped.$transaction.bind(scoped) as unknown as ReadRun;
          const readOnly = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) =>
            run(
              (tx) =>
                adminMcpExecution.run(
                  { ...execution, inTransaction: true, readOnlyDatabase: true, trustedRawRead: true },
                  async () => {
                    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                    // Establish the transaction snapshot before any domain SQL; its
                    // read/write mode cannot then be upgraded by a later statement.
                    await tx.$queryRaw`SELECT 1`;
                    return adminMcpExecution.run(
                      { ...execution, inTransaction: true, readOnlyDatabase: true, trustedRawRead: false },
                      async () => await work(tx),
                    );
                  },
                ),
              options,
            );
          if (property === '$transaction')
            return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) => {
              if (typeof work !== 'function')
                throw new BadRequestException('A consulta MCP exige uma transação somente leitura.');
              return readOnly(work, options);
            };
          return (...args: unknown[]) =>
            readOnly((tx) => {
              const method = Reflect.get(tx, property) as (...values: unknown[]) => Promise<unknown>;
              return method.apply(tx, args);
            });
        }
        if (property === '$transaction' && execution?.phase === 'apply' && execution.beforeTransaction) {
          type Run = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) => Promise<T>;
          const run = scoped.$transaction.bind(scoped) as unknown as Run;
          return <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: object): Promise<T> => {
            if (typeof operation !== 'function')
              throw new BadRequestException('Esta operação exige uma transação de domínio revisável.');
            return run((tx) => {
              const transactionAudit = { businessWrites: false, recorded: false };
              return adminMcpExecution.run({ ...execution, inTransaction: true, transactionAudit }, async () => {
                await adminMcpExecution.run(
                  { ...execution, inTransaction: true, transactionAudit, trustedRawRead: true },
                  () => execution.beforeTransaction?.(tx),
                );
                const result = await operation(tx);
                if (transactionAudit.businessWrites && !transactionAudit.recorded) {
                  throw new BadRequestException('A alteração não possui auditoria transacional verificável.');
                }
                return result;
              });
            }, options);
          };
        }

        if (Object.prototype.hasOwnProperty.call(PrismaService.prototype, property) && property !== 'constructor') {
          return Reflect.get(target, property, receiver);
        }
        return Reflect.get(scoped, property);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.once('beforeExit', async () => {
      await app.close();
    });
  }
}
