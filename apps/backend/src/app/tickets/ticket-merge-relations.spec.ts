import { ConflictException } from '@nestjs/common';
import { EventTicketStatus, TicketPurchaseStatus } from '@prisma/client';
import {
  moveTicketPersonRelations,
  reassignTicketUserRelations,
  restoreTicketPersonRelations,
} from './ticket-merge-relations';

describe('ticket relations during People merges', () => {
  it('moves a non-colliding holder while retaining ticket identity and provenance', async () => {
    const tx = createTransaction();
    const ticket = ticketRow({
      id: 'ticket-source',
      holderPersonId: 'source-person',
      originalHolderPersonId: 'source-person',
      sourceKey: 'event-subscription:event-1:source-person',
    });
    tx.eventTicket.findMany.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([]);

    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person', 'actor-1');

    expect(snapshot.holderSnapshots).toEqual([
      expect.objectContaining({
        action: 'MOVED',
        id: 'ticket-source',
        holderPersonId: 'source-person',
        expectedHolderPersonId: 'target-person',
        sourceKey: 'event-subscription:event-1:source-person',
        originalHolderPersonId: 'source-person',
      }),
    ]);
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ticket-source',
          sourceKey: 'event-subscription:event-1:source-person',
          originalHolderPersonId: 'source-person',
        }),
        data: { holderPersonId: 'target-person' },
      }),
    );
    expect(tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityId: 'ticket-source', eventId: 'event-1' }),
      }),
    );
  });

  it('keeps under-review purchases on the survivor with its subscription', async () => {
    const tx = createTransaction();
    const purchase = {
      id: 'purchase-1',
      ticketConfigId: 'ticket-config-1',
      personId: 'source-person',
      majorEventSubscriptionId: 'source-subscription',
      status: TicketPurchaseStatus.UNDER_REVIEW,
    };
    tx.ticketPurchase.findMany.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]);
    tx.majorEventSubscription.findMany
      .mockResolvedValueOnce([{ id: 'source-subscription', majorEventId: 'major-1' }])
      .mockResolvedValueOnce([{ id: 'target-subscription', majorEventId: 'major-1' }]);

    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person');

    expect(tx.ticketPurchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'purchase-1',
        ticketConfigId: 'ticket-config-1',
        personId: 'source-person',
        majorEventSubscriptionId: 'source-subscription',
        status: TicketPurchaseStatus.UNDER_REVIEW,
      },
      data: { personId: 'target-person', majorEventSubscriptionId: 'target-subscription' },
    });
    expect(snapshot.purchaseSnapshots).toEqual([
      {
        id: 'purchase-1',
        ticketConfigId: 'ticket-config-1',
        personId: 'source-person',
        majorEventSubscriptionId: 'source-subscription',
        status: TicketPurchaseStatus.UNDER_REVIEW,
        expectedPersonId: 'target-person',
        expectedMajorEventSubscriptionId: 'target-subscription',
        expectedStatus: TicketPurchaseStatus.UNDER_REVIEW,
      },
    ]);
  });

  it('restores an unchanged purchase person and subscription reference on merge undo', async () => {
    const tx = createTransaction();
    const purchase = {
      id: 'purchase-1',
      ticketConfigId: 'ticket-config-1',
      personId: 'source-person',
      majorEventSubscriptionId: 'source-subscription',
      status: TicketPurchaseStatus.UNDER_REVIEW,
    };
    tx.ticketPurchase.findMany.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]);
    tx.majorEventSubscription.findMany
      .mockResolvedValueOnce([{ id: 'source-subscription', majorEventId: 'major-1' }])
      .mockResolvedValueOnce([{ id: 'target-subscription', majorEventId: 'major-1' }]);
    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person');
    tx.ticketPurchase.updateMany.mockClear();

    await restoreTicketPersonRelations(tx as never, snapshot);

    expect(tx.ticketPurchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'purchase-1',
        ticketConfigId: 'ticket-config-1',
        personId: 'target-person',
        majorEventSubscriptionId: 'target-subscription',
        status: TicketPurchaseStatus.UNDER_REVIEW,
      },
      data: { personId: 'source-person', majorEventSubscriptionId: 'source-subscription' },
    });

    tx.ticketPurchase.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(restoreTicketPersonRelations(tx as never, snapshot)).rejects.toThrow(
      'foi alterada após a unificação',
    );
  });

  it('rejects active purchase collisions before changing any ticket relations', async () => {
    const tx = createTransaction();
    tx.ticketPurchase.findMany
      .mockResolvedValueOnce([
        {
          id: 'source-purchase',
          ticketConfigId: 'ticket-config-1',
          personId: 'source-person',
          majorEventSubscriptionId: null,
          status: TicketPurchaseStatus.UNDER_REVIEW,
        },
      ])
      .mockResolvedValueOnce([{ ticketConfigId: 'ticket-config-1' }]);

    await expect(moveTicketPersonRelations(tx as never, 'target-person', 'source-person')).rejects.toThrow(
      'ambas têm compras de bilhete ativas',
    );
    expect(tx.ticketPurchase.updateMany).not.toHaveBeenCalled();
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.ticketTransfer.updateMany).not.toHaveBeenCalled();
  });

  it('keeps consumed tickets over active duplicates and preserves history', async () => {
    const tx = createTransaction();
    const consumedSource = ticketRow({
      id: 'ticket-consumed',
      holderPersonId: 'source-person',
      originalHolderPersonId: 'source-person',
      sourceKey: 'event-subscription:event-1:source-person',
      status: EventTicketStatus.CONSUMED,
    });
    const activeTarget = ticketRow({
      id: 'ticket-active',
      holderPersonId: 'target-person',
      originalHolderPersonId: 'target-person',
      sourceKey: 'major-event-subscription:event-1:target-person',
    });
    tx.eventTicket.findMany.mockResolvedValueOnce([consumedSource]).mockResolvedValueOnce([activeTarget]);

    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person');

    expect(snapshot.holderSnapshots.map(({ action, id }) => ({ action, id }))).toEqual([
      { action: 'ARCHIVED', id: 'ticket-active' },
      { action: 'MOVED', id: 'ticket-consumed' },
    ]);
    expect(tx.eventTicket.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'ticket-active', holderPersonId: 'target-person' }),
        data: expect.objectContaining({ status: EventTicketStatus.REVOKED, revokedReason: 'PERSON_MERGED_DUPLICATE' }),
      }),
    );
    expect(tx.eventTicket.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ticket-consumed',
          status: EventTicketStatus.CONSUMED,
          sourceKey: 'event-subscription:event-1:source-person',
        }),
        data: { holderPersonId: 'target-person' },
      }),
    );
    expect(tx.eventTicketHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: 'ticket-active',
          operation: 'REVOKED',
          reason: 'Bilhete duplicado arquivado durante a unificação de pessoas.',
        }),
      }),
    );
  });

  it('restores moved holders and archived duplicates only while their merge state is unchanged', async () => {
    const tx = createTransaction();
    const activeTarget = ticketRow({
      id: 'ticket-active',
      holderPersonId: 'target-person',
      originalHolderPersonId: 'target-person',
      sourceKey: 'event-subscription:event-1:target-person',
    });
    const consumedSource = ticketRow({
      id: 'ticket-consumed',
      holderPersonId: 'source-person',
      originalHolderPersonId: 'source-person',
      sourceKey: 'major-event-subscription:event-1:source-person',
      status: EventTicketStatus.CONSUMED,
    });
    tx.eventTicket.findMany.mockResolvedValueOnce([consumedSource]).mockResolvedValueOnce([activeTarget]);
    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person');
    tx.eventTicket.updateMany.mockClear();

    await restoreTicketPersonRelations(tx as never, snapshot);
    expect(tx.eventTicketHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: 'archive-history', ticketId: 'ticket-active', operation: 'REVOKED' },
    });


    expect(tx.eventTicket.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'ticket-consumed', holderPersonId: 'target-person' }),
        data: { holderPersonId: 'source-person' },
      }),
    );
    expect(tx.eventTicket.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ticket-active',
          status: EventTicketStatus.REVOKED,
          sourceKey: 'event-subscription:event-1:target-person',
        }),
        data: expect.objectContaining({ status: EventTicketStatus.ACTIVE, revokedAt: null, revokedReason: null }),
      }),
    );

    tx.eventTicket.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(restoreTicketPersonRelations(tx as never, snapshot)).rejects.toThrow(
      'foi alterado após a unificação',
    );
  });

  it('rejects merges that would turn pending transfers into self-transfers', async () => {
    const tx = createTransaction();
    tx.ticketTransfer.findMany.mockResolvedValueOnce([
      { id: 'transfer-1', senderPersonId: 'source-person', recipientPersonId: 'other-person' },
      { id: 'transfer-2', senderPersonId: 'other-person', recipientPersonId: 'source-person' },
    ]);

    const snapshot = await moveTicketPersonRelations(tx as never, 'target-person', 'source-person');

    expect(tx.ticketTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'transfer-1',
        senderStatus: 'PENDING',
        senderPersonId: 'source-person',
        recipientPersonId: 'other-person',
      },
      data: { senderPersonId: 'target-person' },
    });
    expect(tx.ticketTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'transfer-2',
        senderStatus: 'PENDING',
        senderPersonId: 'other-person',
        recipientPersonId: 'source-person',
      },
      data: { recipientPersonId: 'target-person' },
    });
    await restoreTicketPersonRelations(tx as never, snapshot);
    expect(tx.ticketTransfer.updateMany).toHaveBeenNthCalledWith(3, {
      where: {
        id: 'transfer-1',
        senderStatus: 'PENDING',
        senderPersonId: 'target-person',
        recipientPersonId: 'other-person',
      },
      data: { senderPersonId: 'source-person', recipientPersonId: 'other-person' },
    });
    expect(tx.ticketTransfer.updateMany).toHaveBeenNthCalledWith(4, {
      where: {
        id: 'transfer-2',
        senderStatus: 'PENDING',
        senderPersonId: 'other-person',
        recipientPersonId: 'target-person',
      },
      data: { senderPersonId: 'other-person', recipientPersonId: 'source-person' },
    });

    tx.ticketTransfer.findMany.mockResolvedValueOnce([
      { id: 'transfer-self', senderPersonId: 'target-person', recipientPersonId: 'source-person' },
    ]);
    await expect(moveTicketPersonRelations(tx as never, 'target-person', 'source-person')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('combines account cooldown counters and redirects pending user references and outboxes', async () => {
    const tx = createTransaction();
    tx.user.findUnique.mockResolvedValue({ id: 'new-user' });
    const newLastSubmittedAt = new Date();
    const oldLastSubmittedAt = new Date(newLastSubmittedAt.getTime() - 60_000);
    tx.ticketTransferAuthorCooldown.findUnique
      .mockResolvedValueOnce({ userId: 'old-user', submissionCount: 4, lastSubmittedAt: oldLastSubmittedAt })
      .mockResolvedValueOnce({ userId: 'new-user', submissionCount: 7, lastSubmittedAt: newLastSubmittedAt });

    await reassignTicketUserRelations(tx as never, 'old-user', 'new-user');

    expect(tx.ticketTransferAuthorCooldown.update).toHaveBeenCalledWith({
      where: { userId: 'new-user' },
      data: { submissionCount: { increment: 4 }, lastSubmittedAt: newLastSubmittedAt },
    });
    expect(tx.ticketTransferAuthorCooldown.delete).toHaveBeenCalledWith({ where: { userId: 'old-user' } });
    expect(tx.ticketTransfer.updateMany).toHaveBeenCalledTimes(3);
    expect(tx.ticketNotificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'old-user', sentAt: null },
      data: { recipientUserId: 'new-user' },
    });
    expect(tx.ticketRealtimeOutbox.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'old-user', publishedAt: null },
      data: { recipientUserId: 'new-user' },
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('moves an existing cooldown intact when the surviving user has no counter row yet', async () => {
    const tx = createTransaction();
    tx.user.findUnique.mockResolvedValue({ id: 'new-user' });
    tx.ticketTransferAuthorCooldown.findUnique
      .mockResolvedValueOnce({ userId: 'old-user', submissionCount: 6, lastSubmittedAt: new Date() })
      .mockResolvedValueOnce(null);

    await reassignTicketUserRelations(tx as never, 'old-user', 'new-user');

    expect(tx.ticketTransferAuthorCooldown.update).toHaveBeenCalledWith({
      where: { userId: 'old-user' },
      data: { userId: 'new-user' },
    });
    expect(tx.ticketTransferAuthorCooldown.delete).not.toHaveBeenCalled();
  });
});

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    eventId: 'event-1',
    holderPersonId: 'source-person',
    originalHolderPersonId: 'source-person',
    sourceKey: 'event-subscription:event-1:source-person',
    status: EventTicketStatus.ACTIVE,
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

function createTransaction() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    eventTicket: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventTicketHistory: { create: jest.fn().mockResolvedValue({ id: 'archive-history' }), deleteMany: jest.fn() },
    ticketTransfer: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ticketPurchase: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    ticketNotificationOutbox: { updateMany: jest.fn() },
    ticketRealtimeOutbox: { updateMany: jest.fn() },
    ticketTransferAuthorCooldown: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLogEntry: { create: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}
