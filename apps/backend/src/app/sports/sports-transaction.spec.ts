import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { runSerializableSportsTransaction } from './sports-transaction';

function retryableError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

describe('runSerializableSportsTransaction', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the sports export as a compatibility alias for the shared helper', () => {
    expect(runSerializableSportsTransaction).toBe(runSerializablePrismaTransaction);
  });

  it('runs the callback in a serializable transaction and returns its value', async () => {
    const tx = { marker: true };
    const callback = jest.fn().mockResolvedValue('saved');
    const prisma = {
      $transaction: jest.fn((operation: (client: unknown) => Promise<string>) => operation(tx)),
    } as unknown as PrismaService;

    await expect(runSerializableSportsTransaction(prisma, callback)).resolves.toBe('saved');
    expect(callback).toHaveBeenCalledWith(tx);
    expect(prisma.$transaction).toHaveBeenCalledWith(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('retries serialization conflicts and eventually succeeds', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const prisma = {
      $transaction: jest.fn().mockRejectedValueOnce(retryableError()).mockResolvedValueOnce('saved'),
    } as unknown as PrismaService;

    const result = runSerializableSportsTransaction(prisma, jest.fn());
    await jest.advanceTimersByTimeAsync(10);

    await expect(result).resolves.toBe('saved');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after three serialization conflicts', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const error = retryableError();
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(error),
    } as unknown as PrismaService;

    const result = runSerializableSportsTransaction(prisma, jest.fn());
    const expectation = expect(result).rejects.toBe(error);
    await jest.advanceTimersByTimeAsync(30);

    await expectation;
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated failures', async () => {
    const error = new Error('database unavailable');
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(error),
    } as unknown as PrismaService;

    await expect(runSerializableSportsTransaction(prisma, jest.fn())).rejects.toBe(error);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
