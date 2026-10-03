import { ConflictException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventTicketStatus,
  Prisma,
  TicketHistoryOperation,
  TicketPurchaseStatus,
  TicketTransferSenderStatus,
} from '@prisma/client';
import { recordTicketAudit } from './ticket-audit';

const ACTIVE_TICKET_STATUSES = [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED];
const ACTIVE_PURCHASE_STATUSES = [TicketPurchaseStatus.UNDER_REVIEW, TicketPurchaseStatus.APPROVED];
const PERSON_MERGE_DUPLICATE_REASON = 'PERSON_MERGED_DUPLICATE';

export type TicketHolderMergeSnapshot = {
  action: 'MOVED' | 'ARCHIVED';
  id: string;
  eventId: string;
  sourceKey: string | null;
  originalHolderPersonId: string | null;
  holderPersonId: string;
  status: EventTicketStatus;
  revokedAt: string | null;
  revokedReason: string | null;
  expectedHolderPersonId: string;
  expectedStatus: EventTicketStatus;
  expectedRevokedAt: string | null;
  expectedRevokedReason: string | null;
  archiveHistoryId?: string | null;
};

export type TicketTransferPersonMergeSnapshot = {
  id: string;
  senderPersonId: string | null;
  recipientPersonId: string | null;
  expectedSenderPersonId: string | null;
  expectedRecipientPersonId: string | null;
};

export type TicketPurchaseMergeSnapshot = {
  id: string;
  ticketConfigId: string;
  personId: string;
  majorEventSubscriptionId: string | null;
  status: TicketPurchaseStatus;
  expectedPersonId: string;
  expectedMajorEventSubscriptionId: string | null;
  expectedStatus: TicketPurchaseStatus;
};

export type TicketPersonRelationsSnapshot = {
  holderSnapshots: TicketHolderMergeSnapshot[];
  transferSnapshots: TicketTransferPersonMergeSnapshot[];
  purchaseSnapshots: TicketPurchaseMergeSnapshot[];
};

type TicketMergeRow = {
  id: string;
  eventId: string;
  holderPersonId: string;
  originalHolderPersonId: string | null;
  sourceKey: string | null;
  status: EventTicketStatus;
  revokedAt: Date | null;
  revokedReason: string | null;
};

const ticketSelect = {
  id: true,
  eventId: true,
  holderPersonId: true,
  originalHolderPersonId: true,
  sourceKey: true,
  status: true,
  revokedAt: true,
  revokedReason: true,
} satisfies Prisma.EventTicketSelect;

const purchaseSelect = {
  id: true,
  ticketConfigId: true,
  personId: true,
  majorEventSubscriptionId: true,
  status: true,
} satisfies Prisma.TicketPurchaseSelect;

export async function moveTicketPersonRelations(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
  actorUserId: string | null = null,
): Promise<TicketPersonRelationsSnapshot> {
  const purchaseSnapshots = await moveTicketPurchaseRelations(tx, targetPersonId, sourcePersonId);
  const sourceTickets = (await tx.eventTicket.findMany({
    where: { holderPersonId: sourcePersonId, status: { in: ACTIVE_TICKET_STATUSES } },
    select: ticketSelect,
  })) as TicketMergeRow[];
  const eventIds = [...new Set(sourceTickets.map((ticket) => ticket.eventId))];
  const targetTickets = eventIds.length
    ? ((await tx.eventTicket.findMany({
        where: {
          eventId: { in: eventIds },
          holderPersonId: targetPersonId,
          status: { in: ACTIVE_TICKET_STATUSES },
        },
        select: ticketSelect,
      })) as TicketMergeRow[])
    : [];

  groupTicketsByEvent(sourceTickets, sourcePersonId);
  const targetByEvent = groupTicketsByEvent(targetTickets, targetPersonId);
  const holderSnapshots: TicketHolderMergeSnapshot[] = [];

  for (const sourceTicket of sourceTickets) {
    const chosenTargetTicket = targetByEvent.get(sourceTicket.eventId);

    if (!chosenTargetTicket) {
      holderSnapshots.push(await moveTicketHolder(tx, sourceTicket, targetPersonId, actorUserId));
      continue;
    }

    // The surviving person's consumed ticket is canonical. Otherwise a consumed
    // source ticket wins; when both have the same status, keep the survivor's row.
    const sourceWins =
      sourceTicket.status === EventTicketStatus.CONSUMED &&
      chosenTargetTicket.status !== EventTicketStatus.CONSUMED;
    const canonicalTicket = sourceWins ? sourceTicket : chosenTargetTicket;
    const duplicateTicket = sourceWins ? chosenTargetTicket : sourceTicket;

    holderSnapshots.push(await archiveDuplicateTicket(tx, duplicateTicket, sourcePersonId, targetPersonId, actorUserId));
    if (sourceWins) {
      holderSnapshots.push(await moveTicketHolder(tx, canonicalTicket, targetPersonId, actorUserId));
    }
  }

  const transferRows = await tx.ticketTransfer.findMany({
    where: {
      senderStatus: TicketTransferSenderStatus.PENDING,
      OR: [{ senderPersonId: sourcePersonId }, { recipientPersonId: sourcePersonId }],
    },
    select: { id: true, senderPersonId: true, recipientPersonId: true },
  });

  for (const transfer of transferRows) {
    const senderAfter = transfer.senderPersonId === sourcePersonId ? targetPersonId : transfer.senderPersonId;
    const recipientAfter = transfer.recipientPersonId === sourcePersonId ? targetPersonId : transfer.recipientPersonId;
    if (senderAfter === targetPersonId && recipientAfter === targetPersonId) {
      throw new ConflictException(
        'Não é possível unificar estas pessoas enquanto houver uma transferência de bilhete pendente entre elas. Resolva ou cancele a solicitação e tente novamente.',
      );
    }

    const changed = await tx.ticketTransfer.updateMany({
      where: {
        id: transfer.id,
        senderStatus: TicketTransferSenderStatus.PENDING,
        senderPersonId: transfer.senderPersonId,
        recipientPersonId: transfer.recipientPersonId,
      },
      data: {
        ...(transfer.senderPersonId === sourcePersonId ? { senderPersonId: targetPersonId } : {}),
        ...(transfer.recipientPersonId === sourcePersonId ? { recipientPersonId: targetPersonId } : {}),
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException(
        `A transferência de bilhete ${transfer.id} foi alterada durante a unificação. Revise a solicitação e tente novamente.`,
      );
    }
  }

  const transferSnapshots: TicketTransferPersonMergeSnapshot[] = transferRows.map((transfer) => ({
    id: transfer.id,
    senderPersonId: transfer.senderPersonId,
    recipientPersonId: transfer.recipientPersonId,
    expectedSenderPersonId: transfer.senderPersonId === sourcePersonId ? targetPersonId : transfer.senderPersonId,
    expectedRecipientPersonId:
      transfer.recipientPersonId === sourcePersonId ? targetPersonId : transfer.recipientPersonId,
  }));

  return { holderSnapshots, transferSnapshots, purchaseSnapshots };
}

export async function restoreTicketPersonRelations(
  tx: Prisma.TransactionClient,
  snapshot: TicketPersonRelationsSnapshot,
): Promise<void> {
  for (const ticket of snapshot.holderSnapshots.filter((entry) => entry.action === 'MOVED')) {
    const restored = await tx.eventTicket.updateMany({
      where: currentTicketWhere(ticket),
      data: { holderPersonId: ticket.holderPersonId },
    });
    if (restored.count !== 1) {
      throw new ConflictException(
        `O bilhete ${ticket.id} foi alterado após a unificação e não pode ser restaurado com segurança.`,
      );
    }
  }

  for (const ticket of snapshot.holderSnapshots.filter((entry) => entry.action === 'ARCHIVED')) {
    const restored = await tx.eventTicket.updateMany({
      where: currentTicketWhere(ticket),
      data: {
        status: ticket.status,
        revokedAt: ticket.revokedAt ? new Date(ticket.revokedAt) : null,
        revokedReason: ticket.revokedReason,
      },
    });
    if (restored.count !== 1) {
      throw new ConflictException(
        `O bilhete duplicado ${ticket.id} foi alterado após a unificação e não pode ser restaurado com segurança.`,
      );
    }
  }

  for (const ticket of snapshot.holderSnapshots.filter((entry) => entry.action === 'ARCHIVED')) {
    if (!ticket.archiveHistoryId) continue;
    await tx.eventTicketHistory.deleteMany({
      where: { id: ticket.archiveHistoryId, ticketId: ticket.id, operation: TicketHistoryOperation.REVOKED },
    });
  }

  for (const transfer of snapshot.transferSnapshots) {
    const restored = await tx.ticketTransfer.updateMany({
      where: {
        id: transfer.id,
        senderStatus: TicketTransferSenderStatus.PENDING,
        senderPersonId: transfer.expectedSenderPersonId,
        recipientPersonId: transfer.expectedRecipientPersonId,
      },
      data: {
        senderPersonId: transfer.senderPersonId,
        recipientPersonId: transfer.recipientPersonId,
      },
    });
    if (restored.count !== 1) {
      throw new ConflictException(
        `A transferência de bilhete ${transfer.id} foi alterada após a unificação e não pode ser restaurada com segurança.`,
      );
    }
  }

  for (const purchase of snapshot.purchaseSnapshots) {
    const restored = await tx.ticketPurchase.updateMany({
      where: {
        id: purchase.id,
        ticketConfigId: purchase.ticketConfigId,
        personId: purchase.expectedPersonId,
        majorEventSubscriptionId: purchase.expectedMajorEventSubscriptionId,
        status: purchase.expectedStatus,
      },
      data: {
        personId: purchase.personId,
        majorEventSubscriptionId: purchase.majorEventSubscriptionId,
      },
    });
    if (restored.count !== 1) {
      throw new ConflictException(
        `A compra de bilhete ${purchase.id} foi alterada após a unificação e não pode ser restaurada com segurança.`,
      );
    }
  }
}

export async function reassignTicketUserRelations(
  tx: Prisma.TransactionClient,
  oldUserId: string,
  newUserId: string,
): Promise<void> {
  if (oldUserId === newUserId) return;
  const survivingUser = await tx.user.findUnique({ where: { id: newUserId }, select: { id: true } });
  if (!survivingUser) return;

  await tx.ticketTransfer.updateMany({
    where: { senderStatus: TicketTransferSenderStatus.PENDING, authorUserId: oldUserId },
    data: { authorUserId: newUserId },
  });
  await tx.ticketTransfer.updateMany({
    where: { senderStatus: TicketTransferSenderStatus.PENDING, senderUserId: oldUserId },
    data: { senderUserId: newUserId },
  });
  await tx.ticketTransfer.updateMany({
    where: { senderStatus: TicketTransferSenderStatus.PENDING, recipientUserId: oldUserId },
    data: { recipientUserId: newUserId },
  });

  await tx.ticketNotificationOutbox.updateMany({
    where: { recipientUserId: oldUserId, sentAt: null },
    data: { recipientUserId: newUserId },
  });
  await tx.ticketRealtimeOutbox.updateMany({
    where: { recipientUserId: oldUserId, publishedAt: null },
    data: { recipientUserId: newUserId },
  });

  await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId"
    FROM "ticket_transfer_author_cooldowns"
    WHERE "userId" IN (${oldUserId}, ${newUserId})
    ORDER BY "userId"
    FOR UPDATE
  `;
  const [sourceCooldown, targetCooldown] = await Promise.all([
    tx.ticketTransferAuthorCooldown.findUnique({ where: { userId: oldUserId } }),
    tx.ticketTransferAuthorCooldown.findUnique({ where: { userId: newUserId } }),
  ]);
  if (!sourceCooldown) return;

  if (targetCooldown) {
    await tx.ticketTransferAuthorCooldown.update({
      where: { userId: newUserId },
      data: {
        submissionCount: { increment: sourceCooldown.submissionCount },
        lastSubmittedAt: latestDate(sourceCooldown.lastSubmittedAt, targetCooldown.lastSubmittedAt),
      },
    });
    await tx.ticketTransferAuthorCooldown.delete({ where: { userId: oldUserId } });
    return;
  }

  await tx.ticketTransferAuthorCooldown.update({
    where: { userId: oldUserId },
    data: { userId: newUserId },
  });
}

function groupTicketsByEvent(tickets: TicketMergeRow[], personId: string) {
  const grouped = new Map<string, TicketMergeRow>();
  for (const ticket of tickets) {
    if (grouped.has(ticket.eventId)) {
      throw new ConflictException(
        `A pessoa ${personId} possui mais de um bilhete ativo ou consumido para o mesmo evento. Revise os bilhetes antes da unificação.`,
      );
    }
    grouped.set(ticket.eventId, ticket);
  }
  return grouped;
}

async function moveTicketPurchaseRelations(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
): Promise<TicketPurchaseMergeSnapshot[]> {
  const sourcePurchases = await tx.ticketPurchase.findMany({
    where: { personId: sourcePersonId },
    select: purchaseSelect,
  });
  if (sourcePurchases.length === 0) return [];

  const activeSourceConfigIdsSeen = new Set<string>();
  for (const purchase of sourcePurchases) {
    if (!isActivePurchaseStatus(purchase.status)) continue;
    if (activeSourceConfigIdsSeen.has(purchase.ticketConfigId)) {
      throw new ConflictException(
        'Não é possível unificar as pessoas: há mais de uma compra de bilhete ativa para a mesma modalidade. Revise as compras antes da unificação.',
      );
    }
    activeSourceConfigIdsSeen.add(purchase.ticketConfigId);
  }

  const activeSourceConfigIds = [...new Set(
    sourcePurchases
      .filter((purchase) => isActivePurchaseStatus(purchase.status))
      .map((purchase) => purchase.ticketConfigId),
  )];
  const targetPurchases = activeSourceConfigIds.length > 0
    ? await tx.ticketPurchase.findMany({
        where: {
          personId: targetPersonId,
          ticketConfigId: { in: activeSourceConfigIds },
          status: { in: ACTIVE_PURCHASE_STATUSES },
        },
        select: { ticketConfigId: true },
      })
    : [];
  if (targetPurchases.length > 0) {
    throw new ConflictException(
      'Não é possível unificar as pessoas: ambas têm compras de bilhete ativas para a mesma modalidade. Revise ou conclua as compras antes da unificação.',
    );
  }

  const sourceSubscriptionIds = [...new Set(
    sourcePurchases
      .map((purchase) => purchase.majorEventSubscriptionId)
      .filter((subscriptionId): subscriptionId is string => subscriptionId !== null),
  )];
  const subscriptionIdRemap = new Map<string, string>();
  if (sourceSubscriptionIds.length > 0) {
    const sourceSubscriptions = await tx.majorEventSubscription.findMany({
      where: { id: { in: sourceSubscriptionIds }, personId: sourcePersonId },
      select: { id: true, majorEventId: true },
    });
    const majorEventIds = [...new Set(sourceSubscriptions.map((subscription) => subscription.majorEventId))];
    const targetSubscriptions = majorEventIds.length > 0
      ? await tx.majorEventSubscription.findMany({
          where: { personId: targetPersonId, majorEventId: { in: majorEventIds }, deletedAt: null },
          select: { id: true, majorEventId: true },
        })
      : [];
    const targetSubscriptionByMajorEvent = new Map<string, string>();
    for (const subscription of targetSubscriptions) {
      if (targetSubscriptionByMajorEvent.has(subscription.majorEventId)) {
        throw new ConflictException(
          'Não é possível unificar as pessoas: há mais de uma inscrição ativa para o mesmo grande evento. Revise as inscrições antes da unificação.',
        );
      }
      targetSubscriptionByMajorEvent.set(subscription.majorEventId, subscription.id);
    }
    for (const subscription of sourceSubscriptions) {
      const targetSubscriptionId = targetSubscriptionByMajorEvent.get(subscription.majorEventId);
      if (targetSubscriptionId) subscriptionIdRemap.set(subscription.id, targetSubscriptionId);
    }
  }

  const snapshots: TicketPurchaseMergeSnapshot[] = [];
  for (const purchase of sourcePurchases) {
    if (!purchase.personId) {
      throw new ConflictException(`A compra de bilhete ${purchase.id} não possui pessoa vinculada e não pode ser movida.`);
    }
    const expectedMajorEventSubscriptionId = purchase.majorEventSubscriptionId
      ? subscriptionIdRemap.get(purchase.majorEventSubscriptionId) ?? purchase.majorEventSubscriptionId
      : null;
    const moved = await tx.ticketPurchase.updateMany({
      where: {
        id: purchase.id,
        ticketConfigId: purchase.ticketConfigId,
        personId: sourcePersonId,
        majorEventSubscriptionId: purchase.majorEventSubscriptionId,
        status: purchase.status,
      },
      data: {
        personId: targetPersonId,
        ...(expectedMajorEventSubscriptionId !== purchase.majorEventSubscriptionId
          ? { majorEventSubscriptionId: expectedMajorEventSubscriptionId }
          : {}),
      },
    });
    if (moved.count !== 1) {
      throw new ConflictException(
        `A compra de bilhete ${purchase.id} foi alterada durante a unificação. Revise a compra e tente novamente.`,
      );
    }
    snapshots.push({
      id: purchase.id,
      ticketConfigId: purchase.ticketConfigId,
      personId: purchase.personId,
      majorEventSubscriptionId: purchase.majorEventSubscriptionId,
      status: purchase.status,
      expectedPersonId: targetPersonId,
      expectedMajorEventSubscriptionId,
      expectedStatus: purchase.status,
    });
  }
  return snapshots;
}

async function moveTicketHolder(
  tx: Prisma.TransactionClient,
  ticket: TicketMergeRow,
  targetPersonId: string,
  actorUserId: string | null,
): Promise<TicketHolderMergeSnapshot> {
  const expectedRevokedAt = ticket.revokedAt?.toISOString() ?? null;
  const snapshot: TicketHolderMergeSnapshot = {
    action: 'MOVED',
    ...ticketSnapshotFields(ticket),
    expectedHolderPersonId: targetPersonId,
    expectedStatus: ticket.status,
    expectedRevokedAt,
    expectedRevokedReason: ticket.revokedReason,
  };
  const changed = await tx.eventTicket.updateMany({
    where: {
      id: ticket.id,
      holderPersonId: ticket.holderPersonId,
      status: ticket.status,
      revokedAt: ticket.revokedAt,
      revokedReason: ticket.revokedReason,
      sourceKey: ticket.sourceKey,
      originalHolderPersonId: ticket.originalHolderPersonId,
    },
    data: { holderPersonId: targetPersonId },
  });
  if (changed.count !== 1) {
    throw new ConflictException(
      `O bilhete ${ticket.id} foi alterado durante a unificação. Revise o bilhete e tente novamente.`,
    );
  }
  await recordTicketAudit(tx, {
    entityType: AuditLogEntityType.TICKET,
    entityId: ticket.id,
    entityLabel: `Bilhete ${ticket.id}`,
    operation: AuditLogOperation.UPDATE,
    summary: 'Titular do bilhete atualizado durante a unificação de pessoas.',
    actorUserId,
    actorName: actorUserId ? undefined : 'Unificação de pessoas',
    eventId: ticket.eventId,
    before: { holderPersonId: ticket.holderPersonId, sourceKey: ticket.sourceKey },
    after: { holderPersonId: targetPersonId, sourceKey: ticket.sourceKey },
    metadata: { reason: 'PERSON_MERGED', originalHolderPersonId: ticket.originalHolderPersonId },
  });
  return snapshot;
}

async function archiveDuplicateTicket(
  tx: Prisma.TransactionClient,
  ticket: TicketMergeRow,
  sourcePersonId: string,
  targetPersonId: string,
  actorUserId: string | null,
): Promise<TicketHolderMergeSnapshot> {
  const pendingTransfer = await tx.ticketTransfer.findFirst({
    where: { ticketId: ticket.id, senderStatus: TicketTransferSenderStatus.PENDING },
    select: { id: true },
  });
  if (pendingTransfer) {
    throw new ConflictException(
      `O bilhete duplicado ${ticket.id} possui uma transferência pendente (${pendingTransfer.id}). Resolva ou cancele a solicitação antes da unificação.`,
    );
  }

  const archivedAt = new Date();
  const snapshot: TicketHolderMergeSnapshot = {
    action: 'ARCHIVED',
    ...ticketSnapshotFields(ticket),
    expectedHolderPersonId: ticket.holderPersonId,
    expectedStatus: EventTicketStatus.REVOKED,
    expectedRevokedAt: archivedAt.toISOString(),
    expectedRevokedReason: PERSON_MERGE_DUPLICATE_REASON,
  };
  const changed = await tx.eventTicket.updateMany({
    where: {
      id: ticket.id,
      holderPersonId: ticket.holderPersonId,
      status: ticket.status,
      revokedAt: ticket.revokedAt,
      revokedReason: ticket.revokedReason,
      sourceKey: ticket.sourceKey,
      originalHolderPersonId: ticket.originalHolderPersonId,
    },
    data: {
      status: EventTicketStatus.REVOKED,
      revokedAt: archivedAt,
      revokedReason: PERSON_MERGE_DUPLICATE_REASON,
    },
  });
  if (changed.count !== 1) {
    throw new ConflictException(
      `O bilhete duplicado ${ticket.id} foi alterado durante a unificação. Revise os bilhetes e tente novamente.`,
    );
  }

  const archiveHistory = await tx.eventTicketHistory.create({
    data: {
      ticketId: ticket.id,
      operation: TicketHistoryOperation.REVOKED,
      previousHolderPersonId: ticket.holderPersonId,
      actorUserId,
      actorName: actorUserId ? undefined : 'Unificação de pessoas',
      reason: 'Bilhete duplicado arquivado durante a unificação de pessoas.',
    },
  });
  snapshot.archiveHistoryId = archiveHistory.id;
  await recordTicketAudit(tx, {
    entityType: AuditLogEntityType.TICKET,
    entityId: ticket.id,
    entityLabel: `Bilhete ${ticket.id}`,
    operation: AuditLogOperation.UPDATE,
    summary: 'Bilhete duplicado arquivado durante a unificação de pessoas.',
    actorUserId,
    actorName: actorUserId ? undefined : 'Unificação de pessoas',
    eventId: ticket.eventId,
    before: {
      holderPersonId: ticket.holderPersonId,
      status: ticket.status,
      sourceKey: ticket.sourceKey,
      originalHolderPersonId: ticket.originalHolderPersonId,
    },
    after: {
      holderPersonId: ticket.holderPersonId,
      status: EventTicketStatus.REVOKED,
      revokedReason: PERSON_MERGE_DUPLICATE_REASON,
      sourceKey: ticket.sourceKey,
      originalHolderPersonId: ticket.originalHolderPersonId,
    },
    metadata: { reason: 'PERSON_MERGED_DUPLICATE', sourcePersonId, targetPersonId },
  });
  return snapshot;
}

function currentTicketWhere(ticket: TicketHolderMergeSnapshot) {
  return {
    id: ticket.id,
    holderPersonId: ticket.expectedHolderPersonId,
    status: ticket.expectedStatus,
    revokedAt: ticket.expectedRevokedAt ? new Date(ticket.expectedRevokedAt) : null,
    revokedReason: ticket.expectedRevokedReason,
    sourceKey: ticket.sourceKey,
    originalHolderPersonId: ticket.originalHolderPersonId,
  };
}

function ticketSnapshotFields(ticket: TicketMergeRow) {
  return {
    id: ticket.id,
    eventId: ticket.eventId,
    sourceKey: ticket.sourceKey,
    originalHolderPersonId: ticket.originalHolderPersonId,
    holderPersonId: ticket.holderPersonId,
    status: ticket.status,
    revokedAt: ticket.revokedAt?.toISOString() ?? null,
    revokedReason: ticket.revokedReason,
  };
}

function latestDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function isActivePurchaseStatus(status: TicketPurchaseStatus): boolean {
  return status === TicketPurchaseStatus.UNDER_REVIEW || status === TicketPurchaseStatus.APPROVED;
}
