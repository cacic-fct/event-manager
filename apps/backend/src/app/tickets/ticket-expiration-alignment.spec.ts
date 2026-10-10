import { EventTicketStatus, TicketExpirationMode } from '@prisma/client';
import { TicketIssuanceService } from './ticket-issuance.service';

describe('ticket expiration alignment', () => {
  it('aligns all active tickets, including expired-unused, and notifies holders and transferees', async () => {
    const target = new Date(Date.now() + 86_400_000);
    const f = alignmentFixture({
      endDate: target,
      expirationMode: TicketExpirationMode.EVENT_END,
      candidates: [
        ticketRow('expired-active', new Date(Date.now() - 86_400_000), EventTicketStatus.ACTIVE, 'holder-a'),
        ticketRow('future-active', new Date(Date.now() + 172_800_000), EventTicketStatus.ACTIVE, 'holder-b'),
      ],
      pendingTransfers: [{ authorUserId: 'author-a', senderUserId: 'holder-a', recipientUserId: 'recipient-a' }],
    });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'ALL_ACTIVE',
      actorUserId: 'admin-1',
      permission: 'TicketConfig.Update',
    })).resolves.toBe(2);

    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(f.tx.event.findFirst.mock.invocationCallOrder[0]);
    expect(f.tx.eventTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: 'event-1', status: EventTicketStatus.ACTIVE }),
    }));
    expect(f.tx.eventTicket.updateMany).toHaveBeenCalledTimes(2);
    expect(f.tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'expired-active', status: EventTicketStatus.ACTIVE }),
      data: { expiresAt: target },
    }));
    expect(f.tx.auditLogEntry.create).toHaveBeenCalledTimes(2);
    expect(f.realtime.enqueueForUsers).toHaveBeenCalledWith(f.tx, ['holder-a', 'holder-b'], {
      type: 'TICKETS_CHANGED',
      eventId: 'event-1',
    });
    expect(f.realtime.enqueueForUsers).toHaveBeenCalledWith(f.tx, ['author-a', 'holder-a', 'recipient-a'], {
      type: 'TRANSFERS_CHANGED',
      eventId: 'event-1',
    });
  });

  it('preserves consumed and revoked tickets even if a query mock returns them', async () => {
    const target = new Date(Date.now() + 60_000);
    const f = alignmentFixture({
      endDate: target,
      expirationMode: TicketExpirationMode.EVENT_END,
      candidates: [
        ticketRow('consumed', new Date(), EventTicketStatus.CONSUMED, 'holder-a'),
        ticketRow('revoked', new Date(), EventTicketStatus.REVOKED, 'holder-b'),
      ],
    });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'ALL_ACTIVE',
    })).resolves.toBe(0);

    expect(f.tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(f.tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(f.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it('keeps custom expiration fixed when an event end date changes', async () => {
    const f = alignmentFixture({
      endDate: new Date(Date.now() + 86_400_000),
      expirationMode: TicketExpirationMode.CUSTOM,
      customExpiresAt: new Date(Date.now() + 172_800_000),
      candidates: [ticketRow('custom-ticket', new Date(), EventTicketStatus.ACTIVE, 'holder-a')],
    });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'EVENT_END_ONLY',
    })).resolves.toBe(0);

    expect(f.tx.eventTicket.findMany).not.toHaveBeenCalled();
    expect(f.tx.eventTicket.updateMany).not.toHaveBeenCalled();
  });

  it('updates only event-end tickets to the newly committed event end date', async () => {
    const endDate = new Date(Date.now() + 4 * 86_400_000);
    const f = alignmentFixture({
      endDate,
      expirationMode: TicketExpirationMode.EVENT_END,
      candidates: [ticketRow('event-end-ticket', new Date(), EventTicketStatus.ACTIVE, 'holder-a')],
    });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'EVENT_END_ONLY',
    })).resolves.toBe(1);

    expect(f.tx.eventTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: EventTicketStatus.ACTIVE,
        ticketConfig: { is: { expirationMode: TicketExpirationMode.EVENT_END } },
      }),
    }));
    expect(f.tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        ticketConfig: { is: { expirationMode: TicketExpirationMode.EVENT_END } },
      }),
      data: { expiresAt: endDate },
    }));
  });

  it('uses the new custom expiry for every active ticket after a config edit', async () => {
    const customExpiresAt = new Date(Date.now() + 3 * 86_400_000);
    const f = alignmentFixture({
      endDate: new Date(Date.now() + 86_400_000),
      expirationMode: TicketExpirationMode.CUSTOM,
      customExpiresAt,
      candidates: [ticketRow('custom-ticket', new Date(), EventTicketStatus.ACTIVE, 'holder-a')],
    });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'ALL_ACTIVE',
    })).resolves.toBe(1);

    expect(f.tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { expiresAt: customExpiresAt },
    }));
  });

  it('skips audit and publish when consumption or revocation wins the race', async () => {
    const f = alignmentFixture({
      endDate: new Date(Date.now() + 86_400_000),
      expirationMode: TicketExpirationMode.EVENT_END,
      candidates: [ticketRow('raced-ticket', new Date(), EventTicketStatus.ACTIVE, 'holder-a')],
    });
    f.tx.eventTicket.updateMany.mockResolvedValue({ count: 0 });

    await expect(f.service.alignActiveTicketExpirations(f.tx as never, 'event-1', {
      scope: 'EVENT_END_ONLY',
    })).resolves.toBe(0);

    expect(f.tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'raced-ticket',
        status: EventTicketStatus.ACTIVE,
        expiresAt: expect.any(Date),
      }),
    }));
    expect(f.tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(f.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });
});

function ticketRow(id: string, expiresAt: Date, status: EventTicketStatus, userId: string) {
  return {
    id,
    status,
    expiresAt,
    holderPersonId: `person-${userId}`,
    holder: { userId },
  };
}

function alignmentFixture(input: {
  endDate: Date;
  expirationMode: TicketExpirationMode;
  customExpiresAt?: Date | null;
  candidates: ReturnType<typeof ticketRow>[];
  pendingTransfers?: Array<{ authorUserId: string; senderUserId: string | null; recipientUserId: string | null }>;
}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    event: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'event-1',
        name: 'Festa',
        endDate: input.endDate,
        majorEventId: null,
        eventGroup: null,
        ticketConfig: {
          id: 'config-1',
          displayName: 'Ingresso da festa',
          expirationMode: input.expirationMode,
          customExpiresAt: input.customExpiresAt ?? null,
        },
      }),
    },
    eventTicket: {
      findMany: jest.fn().mockResolvedValue(input.candidates),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ticketTransfer: { findMany: jest.fn().mockResolvedValue(input.pendingTransfers ?? []) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Admin', email: null }) },
    auditLogEntry: { create: jest.fn().mockResolvedValue({}) },
  };
  const realtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
  const service = new TicketIssuanceService({} as never, realtime as never);
  return { service, tx, realtime };
}
