import { Prisma } from '@prisma/client';

export async function lockOfflineCommand(tx: Prisma.TransactionClient, clientId: string | undefined): Promise<void> {
  if (!clientId || typeof tx.$executeRaw !== 'function') {
    return;
  }
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${clientId}))`);
}
