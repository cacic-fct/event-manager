import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SERIALIZABLE_RETRY_ATTEMPTS = 3;

export async function runSerializablePrismaTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
