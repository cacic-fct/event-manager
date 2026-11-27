import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** Observe successful writes on the actual transaction client, before a possible rollback. */
export function observeTicketDeletions(prisma: PrismaService, deleted: (id: string) => void): PrismaService {
  return new Proxy(prisma, {
    get(target, property) {
      if (property !== '$transaction') return Reflect.get(target, property);
      return <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) =>
        target.$transaction((tx) => {
          const tickets = new Proxy(tx.eventTicket, {
            get(delegate, method) {
              if (method !== 'deleteMany') return Reflect.get(delegate, method);
              return async (args: Prisma.EventTicketDeleteManyArgs) => {
                const result = await delegate.deleteMany(args);
                if (result.count > 0 && typeof args.where?.id === 'string') deleted(args.where.id);
                return result;
              };
            },
          });
          return operation(
            new Proxy(tx, {
              get(client, key) {
                return key === 'eventTicket' ? tickets : Reflect.get(client, key);
              },
            }),
          );
        }, options);
    },
  });
}
