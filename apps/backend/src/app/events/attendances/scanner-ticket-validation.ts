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
      status: { in: ['ACTIVE', 'CONSUMED'] },
      expiresAt: { gt: attendedAt },
      issuedAt: { lte: attendedAt },
      ticketConfig: { enabled: true },
      event: { deletedAt: null },
    },
    select: {
      holderPersonId: true,
      holder: { select: { userId: true, deletedAt: true, mergedIntoId: true } },
      transfers: {
        where: {
          senderStatus: 'ACCEPTED',
          recipientStatus: 'ACCEPTED',
          acceptedAt: { gt: attendedAt },
        },
        select: { senderPersonId: true, senderUserId: true, acceptedAt: true },
        orderBy: { acceptedAt: 'asc' },
        take: 1,
      },
    },
  });
  const firstFutureTransfer = ticket?.transfers[0];
  const ownedAtAttendance = firstFutureTransfer
    ? firstFutureTransfer.senderPersonId === input.personId && firstFutureTransfer.senderUserId === barcode.holderUserId
    : ticket?.holderPersonId === input.personId &&
      ticket.holder?.userId === barcode.holderUserId &&
      !ticket.holder.deletedAt &&
      !ticket.holder.mergedIntoId;
  if (!ownedAtAttendance) throw new BadRequestException('Este bilhete não é válido para esta presença.');
}
