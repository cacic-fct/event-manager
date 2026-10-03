import { EventTicketIssueSource, EventTicketStatus } from '@prisma/client';
import { TicketIssuanceService } from './ticket-issuance.service';

function setup() {
  const now = new Date();
  const event = {
    id: 'event', name: 'Kit', startDate: now, endDate: new Date(now.getTime() + 86_400_000), deletedAt: null,
    majorEventId: 'major', eventGroup: null, majorEvent: { isPaymentRequired: false },
    ticketConfig: {
      id: 'config', enabled: true, displayName: null, issueOnEventSubscription: false,
      issueOnMajorEventSubscription: true, includedPriceTierIds: [] as string[], expirationMode: 'EVENT_END', customExpiresAt: null,
      createdAt: new Date(now.getTime() - 60_000), updatedAt: new Date(now.getTime() - 60_000),
    },
  };
  const existing = {
    id: 'ticket',
    eventId: 'event',
    holderPersonId: 'person',
    originalHolderPersonId: 'person',
    status: 'ACTIVE',
    source: 'MAJOR_EVENT_SUBSCRIPTION',
    sourceKey: 'major-event-subscription:event:person',
    issuedAt: new Date(now.getTime() - 86_400_000),
    expiresAt: event.endDate,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    event: { findUnique: jest.fn().mockResolvedValue(event) },
    people: { findFirst: jest.fn().mockResolvedValue({ id: 'person', userId: 'user' }), findUnique: jest.fn().mockResolvedValue({ userId: 'user' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Coletor', email: null }) },
    eventSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    majorEventSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    eventTicket: {
      findUnique: jest.fn().mockResolvedValue(existing), findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ticketTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    eventTicketHistory: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    auditLogEntry: { create: jest.fn() },
    priceTier: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const realtime = { enqueueForUsers: jest.fn() };
  const service = new TicketIssuanceService({} as never, realtime as never);
  return { service, tx, realtime, event, existing };
}

describe('ticket issuance and redemption safety', () => {
  it('skips expired automatic issuance while explicit issuance still rejects expiry', async () => {
    const { service, tx, event } = setup();
    event.endDate = new Date(Date.now() - 1_000);
    tx.majorEventSubscription.findFirst.mockResolvedValue({ id: 'subscription' } as never);
    tx.eventTicket.findUnique.mockResolvedValue(null as never);

    await expect(service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person')).resolves.toBeUndefined();
    expect(tx.eventTicket.create).not.toHaveBeenCalled();
    await expect(service.issueForPerson(tx as never, 'event', 'person', EventTicketIssueSource.ADMIN)).rejects.toThrow('O prazo deste bilhete já terminou.');
  });

  it.each(['cancellation', 'tier downgrade'])('revokes merged automatic provenance after %s', async (change) => {
    const { service, tx, event, existing } = setup();
    tx.$queryRaw.mockResolvedValue([{ id: 'merged-person' }] as never);
    tx.eventTicket.findUnique.mockResolvedValue(null as never);
    tx.eventTicket.findFirst.mockResolvedValue({ ...existing, originalHolderPersonId: 'merged-person', sourceKey: 'major-event-subscription:event:merged-person' });
    if (change === 'tier downgrade') {
      event.ticketConfig.includedPriceTierIds = ['allowed-tier'];
      tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: 'Bronze' } as never);
    }

    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');

    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ originalHolderPersonId: { in: ['person', 'merged-person'] }, holderPersonId: 'person', source: 'MAJOR_EVENT_SUBSCRIPTION' }),
    }));
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }));
  });

  it('revokes a surviving ticket whose source key points to an archived duplicate', async () => {
    const { service, tx, existing } = setup();
    tx.eventTicket.findUnique.mockResolvedValue({ ...existing, status: 'REVOKED' });
    tx.eventTicket.findFirst.mockResolvedValue({ ...existing, id: 'merged-ticket', originalHolderPersonId: 'merged-person' });
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'merged-ticket' }) }));
  });

  it('preserves transferred rights when cancellation resolves merged provenance', async () => {
    const { service, tx, existing } = setup();
    tx.eventTicket.findUnique.mockResolvedValue(null as never);
    tx.eventTicket.findFirst.mockResolvedValue({ ...existing, originalHolderPersonId: 'merged-person' });
    tx.eventTicketHistory.findFirst.mockResolvedValue({ id: 'transfer' } as never);
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('locks the event expiry row before reading the expiry used by a new ticket', async () => {
    const { service, tx, existing, event } = setup();
    tx.eventTicket.findUnique.mockResolvedValue(null as never);
    tx.eventTicket.create.mockResolvedValue(existing);

    await service.issueForPerson(tx as never, 'event', 'person', EventTicketIssueSource.ADMIN);

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.$executeRaw.mock.invocationCallOrder[0]);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.event.findUnique.mock.invocationCallOrder[0]);
    expect(tx.eventTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ issuedAt: expect.any(Date), expiresAt: event.endDate }),
    }));
  });

  it('revokes unused included tickets on cancellation even when event-level issuance is disabled', async () => {
    const { service, tx, realtime } = setup();
    tx.ticketTransfer.findMany.mockResolvedValue([
      { authorUserId: 'author', senderUserId: 'holder', recipientUserId: 'recipient' },
    ] as never);
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }));
    expect(tx.auditLogEntry.create).toHaveBeenCalled();
    expect(realtime.enqueueForUsers).toHaveBeenCalledWith(tx, ['author', 'holder', 'recipient'], {
      type: 'TRANSFERS_CHANGED',
      eventId: 'event',
      ticketId: 'ticket',
    });
  });

  it('invalidates transfer requests when a subscription no longer meets the included tier', async () => {
    const { service, tx, event, realtime } = setup();
    event.ticketConfig.includedPriceTierIds = ['allowed-tier'];
    tx.majorEventSubscription.findFirst.mockResolvedValue({
      paymentTier: 'Bronze',
      receiptValidatedAt: new Date(),
      majorEvent: { isPaymentRequired: true },
    } as never);
    tx.priceTier.findMany.mockResolvedValue([{ id: 'other-tier', name: 'Bronze' }] as never);
    tx.ticketTransfer.findMany.mockResolvedValue([
      { authorUserId: 'author', senderUserId: 'holder', recipientUserId: 'recipient' },
    ] as never);

    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');

    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'ticket', holderPersonId: 'person', status: 'ACTIVE' }),
      data: expect.objectContaining({ status: 'REVOKED' }),
    }));
    expect(realtime.enqueueForUsers).toHaveBeenCalledWith(tx, ['author', 'holder', 'recipient'], {
      type: 'TRANSFERS_CHANGED',
      eventId: 'event',
      ticketId: 'ticket',
    });
  });

  it('skips transfer notifications when automatic revocation loses the race', async () => {
    const { service, tx, realtime } = setup();
    tx.eventTicket.updateMany.mockResolvedValue({ count: 0 });

    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');

    expect(tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(tx.ticketTransfer.findMany).not.toHaveBeenCalled();
    expect(realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it('preserves transferred tickets after cancellation, even if returned to the original holder', async () => {
    const { service, tx } = setup();
    tx.eventTicketHistory.findFirst.mockResolvedValue({ id: 'transfer-history' } as never);
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('does not revoke an already consumed pass when the subscription is canceled', async () => {
    const { service, tx, existing } = setup();
    tx.eventTicket.findUnique.mockResolvedValue({ ...existing, status: 'CONSUMED' });
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('reactivates the same ticket with current expiry after eligible resubscription', async () => {
    const { service, tx, existing, event } = setup();
    const oldExpiresAt = new Date(Date.now() - 86_400_000);
    const revokedTicket = {
      ...existing,
      status: 'REVOKED',
      expiresAt: oldExpiresAt,
      revokedAt: oldExpiresAt,
      revokedReason: 'SUBSCRIPTION_NO_LONGER_ELIGIBLE',
    };
    tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: null, receiptValidatedAt: null, majorEvent: { isPaymentRequired: false } } as never);
    tx.eventTicket.findUnique.mockResolvedValue(revokedTicket as never);

    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');

    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: existing.id,
        eventId: 'event',
        holderPersonId: 'person',
        status: 'REVOKED',
        expiresAt: oldExpiresAt,
      }),
      data: expect.objectContaining({ status: 'ACTIVE', expiresAt: event.endDate, issuedAt: expect.any(Date) }),
    }));
    const reactivation = tx.eventTicket.updateMany.mock.calls[0]?.[0];
    expect(reactivation?.data.issuedAt.getTime()).toBeGreaterThan(existing.issuedAt.getTime());
    expect(tx.eventTicketHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ticketId: existing.id, operation: 'ISSUED' }),
    }));
    expect(tx.auditLogEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityId: existing.id,
        before: expect.objectContaining({ issuedAt: existing.issuedAt.toISOString(), expiresAt: oldExpiresAt.toISOString() }),
        after: expect.objectContaining({ issuedAt: reactivation?.data.issuedAt.toISOString(), expiresAt: event.endDate.toISOString() }),
      }),
    }));
  });

  it('materializes waived-tier tickets at scan time without receipt validation', async () => {
    const { service, tx, event, existing } = setup();
    const attendedAt = new Date();
    const sourceCreatedAt = new Date(attendedAt.getTime() - 60_000);
    event.majorEvent = { isPaymentRequired: true };
    event.ticketConfig.createdAt = sourceCreatedAt;
    event.ticketConfig.updatedAt = sourceCreatedAt;
    tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: 'Isento', receiptValidatedAt: null } as never);
    tx.eventTicket.findUnique.mockResolvedValue(null as never);
    tx.eventTicket.create.mockResolvedValue({ ...existing, issuedAt: attendedAt } as never);

    await service.syncForAttendance(tx as never, 'event', 'person', attendedAt);

    expect(tx.eventTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: EventTicketIssueSource.MAJOR_EVENT_SUBSCRIPTION,
        sourceKey: 'major-event-subscription:event:person',
        issuedAt: attendedAt,
      }),
    }));
    expect(tx.majorEventSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        subscriptionStatus: 'CONFIRMED',
        createdAt: { lte: attendedAt },
        updatedAt: { lte: attendedAt },
      }),
    }));
    const subscriptionQuery = tx.majorEventSubscription.findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(subscriptionQuery.where).not.toHaveProperty('receiptValidatedAt');
  });

  it.each([
    { label: 'admin-revoked', status: 'REVOKED', revokedReason: 'ADMIN_REQUESTED', transferred: false },
    { label: 'consumed', status: 'CONSUMED', revokedReason: null, transferred: false },
    { label: 'transferred', status: 'REVOKED', revokedReason: 'SUBSCRIPTION_NO_LONGER_ELIGIBLE', transferred: true },
  ])('does not reactivate a $label ticket', async ({ status, revokedReason, transferred }) => {
    const { service, tx, existing } = setup();
    tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: null, receiptValidatedAt: null, majorEvent: { isPaymentRequired: false } } as never);
    tx.eventTicket.findUnique.mockResolvedValue({
      ...existing,
      status,
      revokedReason,
      expiresAt: new Date(Date.now() - 86_400_000),
    } as never);
    if (transferred) tx.eventTicketHistory.findFirst.mockResolvedValue({ id: 'transfer-history' } as never);

    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');

    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.eventTicketHistory.create).not.toHaveBeenCalled();
  });

  it('does not remint transferred rights when another subscription qualifies', async () => {
    const { service, tx, existing, event } = setup();
    event.ticketConfig.issueOnEventSubscription = true;
    const transferred = { ...existing, holderPersonId: 'colleague', source: 'EVENT_SUBSCRIPTION', sourceKey: 'event-subscription:event:person' };
    tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: null, receiptValidatedAt: new Date(), majorEvent: { isPaymentRequired: false } } as never);
    tx.eventTicket.findUnique.mockImplementation(async (input) => input.where.sourceKey === transferred.sourceKey ? transferred : null);
    tx.eventTicket.findFirst.mockImplementation(async (input) => input.where.originalHolderPersonId?.in?.includes('person') ? transferred : null);
    tx.eventTicket.findMany.mockImplementation(async (input) => input.where.originalHolderPersonId?.in?.includes('person') ? [transferred] : []);
    tx.eventTicketHistory.findFirst.mockResolvedValue({ id: 'transfer-history' } as never);
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.create).not.toHaveBeenCalled();
  });

  it('does not remint rights transferred by a person later merged into the account', async () => {
    const { service, tx, existing } = setup();
    tx.$queryRaw.mockResolvedValue([{ id: 'person' }, { id: 'old-person' }] as never);
    tx.majorEventSubscription.findFirst.mockResolvedValue({ paymentTier: null, receiptValidatedAt: null, majorEvent: { isPaymentRequired: false } } as never);
    tx.eventTicket.findUnique.mockResolvedValue(null as never);
    tx.eventTicket.findFirst.mockImplementation(async (input) =>
      input.where.originalHolderPersonId?.in?.includes('old-person') && input.where.history
        ? { ...existing, originalHolderPersonId: 'old-person', holderPersonId: 'colleague' }
        : null,
    );
    await service.syncForPerson(tx as never, 'event', 'person', 'MAJOR_EVENT_SUBSCRIPTION', 'major-event-subscription:event:person');
    expect(tx.eventTicket.create).not.toHaveBeenCalled();
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('only consumes a ticket if the holder and unconsumed state still match at the atomic update', async () => {
    const { service, tx, realtime, existing } = setup();
    tx.eventTicket.findFirst.mockResolvedValue({ ...existing, holder: { userId: 'user' }, event: { name: 'Kit', majorEventId: 'major', eventGroup: null, ticketConfig: null } } as never);
    tx.eventTicket.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consumeForAttendance(tx as never, 'event', 'person')).resolves.toBe(false);
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ holderPersonId: 'person', eventId: 'event', status: 'ACTIVE', expiresAt: { gt: expect.any(Date) } }) }));
    expect(tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(realtime.enqueueForUsers).not.toHaveBeenCalled();
    expect(tx.ticketTransfer.findMany).not.toHaveBeenCalled();
  });

  it('uses the persisted attendance time for a delayed upload when the ticket was valid then', async () => {
    const { service, tx, realtime } = setup();
    const processedAt = new Date();
    const attendedAt = new Date(processedAt.getTime() - 2 * 60 * 60 * 1_000);
    const issuedAt = new Date(attendedAt.getTime() - 60 * 60 * 1_000);
    const expiresAt = new Date(attendedAt.getTime() + 30 * 60 * 1_000);
    tx.eventTicket.findFirst.mockResolvedValue({
      id: 'ticket',
      eventId: 'event',
      holderPersonId: 'person',
      issuedAt,
      expiresAt,
      status: 'ACTIVE',
      event: { name: 'Kit', majorEventId: 'major', eventGroup: null, ticketConfig: null },
      holder: { userId: 'user' },
    } as never);
    tx.eventTicket.updateMany.mockResolvedValue({ count: 1 });
    tx.ticketTransfer.findMany.mockResolvedValue([
      { authorUserId: 'author', senderUserId: 'holder', recipientUserId: 'recipient' },
    ] as never);

    await expect(service.consumeForAttendance(tx as never, 'event', 'person', { attendedAt })).resolves.toBe(true);

    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        holderPersonId: 'person',
        issuedAt: { lte: attendedAt },
        expiresAt: { gt: attendedAt },
      }),
    }));
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        holderPersonId: 'person',
        status: EventTicketStatus.ACTIVE,
        issuedAt: { lte: attendedAt },
        expiresAt: { gt: attendedAt },
      }),
      data: expect.objectContaining({ consumedAt: attendedAt, consumedByPersonId: 'person' }),
    }));
    expect(tx.auditLogEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        after: expect.objectContaining({ consumedAt: attendedAt.toISOString() }),
        metadata: expect.objectContaining({
          attendedAt: attendedAt.toISOString(),
          processedAt: expect.any(String),
        }),
        firstRecordedAt: expect.any(Date),
      }),
    }));
    expect(realtime.enqueueForUsers).toHaveBeenCalledWith(tx, ['author', 'holder', 'recipient'], {
      type: 'TRANSFERS_CHANGED',
      eventId: 'event',
      ticketId: 'ticket',
    });
  });

  it('does not retroactively consume a ticket issued after the recorded attendance time', async () => {
    const { service, tx } = setup();
    const attendedAt = new Date(Date.now() - 60 * 60 * 1_000);
    const issuedAt = new Date(attendedAt.getTime() + 60_000);
    const candidate = { id: 'ticket', issuedAt };
    tx.eventTicket.findFirst.mockImplementation(async ({ where }: { where: { issuedAt: { lte: Date } } }) =>
      issuedAt <= where.issuedAt.lte ? candidate : null,
    );

    await expect(service.consumeForAttendance(tx as never, 'event', 'person', { attendedAt })).resolves.toBe(false);

    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ issuedAt: { lte: attendedAt } }),
    }));
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('does not consume a ticket accepted by this holder after the recorded attendance time', async () => {
    const { service, tx } = setup();
    const attendedAt = new Date(Date.now() - 60 * 60 * 1_000);

    await expect(service.consumeForAttendance(tx as never, 'event', 'person', { attendedAt })).resolves.toBe(false);

    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        holderPersonId: 'person',
        transfers: {
          none: {
            senderStatus: 'ACCEPTED',
            recipientStatus: 'ACCEPTED',
            acceptedAt: { gt: attendedAt },
          },
        },
      }),
    }));
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('uses processing time when no persisted attendance time is provided', async () => {
    const { service, tx } = setup();
    tx.eventTicket.findFirst.mockResolvedValue({
      id: 'ticket',
      eventId: 'event',
      holderPersonId: 'person',
      issuedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      status: 'ACTIVE',
      event: { name: 'Kit', majorEventId: 'major', eventGroup: null, ticketConfig: null },
      holder: { userId: 'user' },
    } as never);

    await expect(service.consumeForAttendance(tx as never, 'event', 'person')).resolves.toBe(true);

    const update = tx.eventTicket.updateMany.mock.calls[0][0];
    expect(update.data.consumedAt).toBeInstanceOf(Date);
    expect(update.where.issuedAt.lte).toEqual(update.data.consumedAt);
    expect(update.where.expiresAt.gt).toEqual(update.data.consumedAt);
  });

  it('still requires the requested person to be the ticket holder at upload time', async () => {
    const { service, tx } = setup();
    tx.eventTicket.findFirst.mockResolvedValue(null as never);

    await expect(service.consumeForAttendance(tx as never, 'event', 'old-holder', {
      attendedAt: new Date(Date.now() - 60 * 60 * 1_000),
    })).resolves.toBe(false);

    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ holderPersonId: 'old-holder', eventId: 'event' }),
    }));
    expect(tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('uses the event/holder lookup rather than accepting a barcode ticket ID as ownership', async () => {
    const { service, tx } = setup();
    await expect(service.consumeForAttendance(tx as never, 'event', 'person')).resolves.toBe(false);
    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventId: 'event', holderPersonId: 'person', status: 'ACTIVE', expiresAt: { gt: expect.any(Date) } }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.eventTicket.findFirst.mock.invocationCallOrder[0]);
  });
});
