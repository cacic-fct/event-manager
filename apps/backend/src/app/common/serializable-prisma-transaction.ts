import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SERIALIZABLE_RETRY_ATTEMPTS = 3;

export async function runSerializablePrismaTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait?: number; timeout?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...options,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === SERIALIZABLE_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      await waitBeforeRetry(attempt);
    }
  }
}

function waitBeforeRetry(attempt: number): Promise<void> {
  const exponentialDelayMs = 10 * 2 ** attempt;
  const jitterMs = Math.floor(Math.random() * 11);
  return new Promise((resolve) => setTimeout(resolve, exponentialDelayMs + jitterMs));
}

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      return true;
    }

    // Some PostgreSQL adapter versions wrap serialization conflicts in P2010.
    if (error.code === 'P2010') {
      const adapterError = error.meta?.['driverAdapterError'];
      const cause = adapterError instanceof Error ? adapterError.cause : undefined;
      return isPostgresSerializationFailure(cause);
    }
  }

  return isDriverAdapterSerializationFailure(error);
}

function isPostgresSerializationFailure(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'originalCode' in cause && cause.originalCode === '40001';
}

function isDriverAdapterSerializationFailure(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('name' in error) ||
    error.name !== 'DriverAdapterError' ||
    !('cause' in error)
  ) {
    return false;
  }

  const cause = error.cause;
  return typeof cause === 'object' && cause !== null && 'kind' in cause && cause.kind === 'TransactionWriteConflict';
}
