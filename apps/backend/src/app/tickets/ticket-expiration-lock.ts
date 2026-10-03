import { Prisma } from '@prisma/client';

export type TicketExpirationRowLockMode = 'SHARE' | 'UPDATE';

/** Serializes expiry readers with event-date and ticket-policy writers. */
export async function lockEventTicketExpiration(
  tx: Prisma.TransactionClient,
  eventId: string,
  mode: TicketExpirationRowLockMode,
): Promise<void> {
  if (mode === 'SHARE') {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR SHARE`);
    return;
  }
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE`);
}
