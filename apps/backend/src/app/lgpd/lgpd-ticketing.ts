import { Prisma } from '@prisma/client';
import { recordTicketAudit } from '../tickets/ticket-audit';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';

export function collectTicketingData(tx: Prisma.TransactionClient, personIds: string[], userIds: string[]) {
  return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () => collectTicketingDataInScope(tx, personIds, userIds));
}

export function anonymizeTicketingData(tx: Prisma.TransactionClient, personIds: string[], userIds: string[]): Promise<void> {
  return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () => anonymizeTicketingDataInScope(tx, personIds, userIds));
}

async function collectTicketingDataInScope(tx: Prisma.TransactionClient, personIds: string[], userIds: string[]) {
  const [tickets, transfers, purchases] = await Promise.all([
    tx.eventTicket.findMany({
      where: { OR: [{ holderPersonId: { in: personIds } }, { originalHolderPersonId: { in: personIds } }] },
      select: { id: true, eventId: true, source: true, status: true, issuedAt: true, expiresAt: true, consumedAt: true, revokedAt: true },
    }),
    tx.ticketTransfer.findMany({
      where: { OR: [{ authorUserId: { in: userIds } }, { senderPersonId: { in: personIds } }, { recipientPersonId: { in: personIds } }] },
      // Export only sender-safe status; omit recipient identity, ignored state, and reason.
      select: { id: true, ticketId: true, eventId: true, senderStatus: true, createdAt: true, acceptedAt: true, canceledAt: true },
    }),
    tx.ticketPurchase.findMany({
      where: { personId: { in: personIds } },
      select: { id: true, eventId: true, majorEventId: true, ticketName: true, amountCents: true, priceTierName: true, status: true, rejectionReason: true, receiptUploadedAt: true, createdAt: true, updatedAt: true },
    }),
  ]);
  return { tickets, transfers, purchases };
}

async function anonymizeTicketingDataInScope(tx: Prisma.TransactionClient, personIds: string[], userIds: string[]): Promise<void> {
  const subjectTransfers = { OR: [
    { authorUserId: { in: userIds } }, { senderPersonId: { in: personIds } }, { recipientPersonId: { in: personIds } },
  ] } satisfies Prisma.TicketTransferWhereInput;
  const transfers = await tx.ticketTransfer.findMany({ where: subjectTransfers, select: { id: true } });
  const transferIds = transfers.map((transfer) => transfer.id);
  await tx.ticketNotificationOutbox.deleteMany({ where: { OR: [
    { recipientUserId: { in: userIds } }, { transferId: { in: transferIds } },
  ] } });
  await tx.ticketRealtimeOutbox.deleteMany({ where: { OR: [
    { recipientUserId: { in: userIds } }, { transferId: { in: transferIds } },
  ] } });
  await tx.ticketTransfer.updateMany({
    where: subjectTransfers, data: { submittedDestinationIdentityDocumentEncrypted: null },
  });
  await tx.ticketTransfer.updateMany({
    where: { senderStatus: 'PENDING', OR: [{ authorUserId: { in: userIds } }, { senderPersonId: { in: personIds } }] },
    data: { senderStatus: 'EXPIRED' },
  });
  const held = await tx.eventTicket.findMany({
    where: { holderPersonId: { in: personIds }, status: 'ACTIVE' }, select: { id: true, eventId: true },
  });
  for (const ticket of held) {
    await tx.eventTicket.update({ where: { id: ticket.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'ACCOUNT_DELETED' } });
    await recordTicketAudit(tx, {
      entityType: 'TICKET', entityId: ticket.id, entityLabel: 'Bilhete', operation: 'UPDATE',
      summary: 'Bilhete revogado após exclusão da conta.', eventId: ticket.eventId,
      after: { status: 'REVOKED', reason: 'ACCOUNT_DELETED' },
    });
  }
  await tx.eventTicket.updateMany({
    where: { originalHolderPersonId: { in: personIds } }, data: { sourceKey: null },
  });
  await tx.eventTicket.updateMany({ where: { consumedByPersonId: { in: personIds } }, data: { consumedByPersonId: null } });
  await tx.eventTicketHistory.updateMany({
    where: { actorUserId: { in: userIds } }, data: { actorUserId: null, actorName: 'Pessoa removida' },
  });
  await tx.ticketPurchase.deleteMany({ where: { personId: { in: personIds } } });
  await tx.ticketPurchase.updateMany({ where: { reviewedById: { in: userIds } }, data: { reviewedById: null, reviewedByName: null } });
  // Nullable foreign keys remove identity links when the existing erasure
  // transaction deletes People/User; passes held by other people remain intact.
}
