import { Prisma } from '@prisma/client';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';

export { runSerializablePrismaTransaction as runSerializableSportsTransaction };

/** Bind existing sports domain writers to a caller-owned transaction. */
export function sportsPrismaForTransaction(tx: Prisma.TransactionClient): PrismaService {
  return new Proxy(tx as unknown as PrismaService, {
    get(target, property) {
      if (property === '$transaction') {
        return <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => operation(tx);
      }
      return Reflect.get(target, property, target);
    },
  });
}
