import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { runSerializablePrismaTransaction } from './serializable-prisma-transaction';

describe('runSerializablePrismaTransaction', () => {
  it('retries PostgreSQL driver-adapter serialization conflicts', async () => {
    const conflict = Object.assign(new Error('TransactionWriteConflict'), {
      name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict' },
    });
    const transaction = jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce('committed');
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(runSerializablePrismaTransaction(prisma, async () => 'committed')).resolves.toBe('committed');

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('does not retry other PostgreSQL driver-adapter errors', async () => {
    const failure = Object.assign(new Error('UniqueConstraintViolation'), {
      name: 'DriverAdapterError',
      cause: { kind: 'UniqueConstraintViolation' },
    });
    const transaction = jest.fn().mockRejectedValue(failure);
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(runSerializablePrismaTransaction(prisma, async () => 'committed')).rejects.toBe(failure);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
