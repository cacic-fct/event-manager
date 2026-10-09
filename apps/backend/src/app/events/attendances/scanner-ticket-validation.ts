import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockEventTicketExpiration } from '../../tickets/ticket-expiration-lock';
import { parseTicketBarcode } from '@cacic-fct/shared-ticketing';

/** Validate ticket credentials inside the attendance transaction before any writes. */
export async function assertScannerTicket(
  tx: Prisma.TransactionClient,
  input: { scannerCode?: string | null; eventId: string; personId: string; attendedAt?: Date },
): Promise<void> {
  const code = input.scannerCode?.trim();
  if (!code?.startsWith('ticket:')) return;
  const barcode = parseTicketBarcode(code);
  if (!barcode) throw new BadRequestException('Código de bilhete incompatível.');

  const processedAt = new Date();
  const attendedAt = input.attendedAt && input.attendedAt < processedAt ? input.attendedAt : processedAt;
  await lockEventTicketExpiration(tx, input.eventId, 'SHARE');
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "event_tickets" WHERE "id" = ${barcode.ticketId} FOR UPDATE`);
  const ticket = await tx.eventTicket.findFirst({
    where: {
      id: barcode.ticketId,
      eventId: input.eventId,
      holderPersonId: input.personId,
      holder: { userId: barcode.holderUserId, deletedAt: null, mergedIntoId: null },
      status: { in: ['ACTIVE', 'CONSUMED'] },
      expiresAt: { gt: attendedAt },
      issuedAt: { lte: attendedAt },
      transfers: { none: { senderStatus: 'ACCEPTED', recipientStatus: 'ACCEPTED', acceptedAt: { gt: attendedAt } } },
      ticketConfig: { enabled: true },
      event: { deletedAt: null },
    },
    select: { id: true },
  });
  if (!ticket) throw new BadRequestException('Este bilhete não é válido para esta presença.');
}
