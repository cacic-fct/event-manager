import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ResourceOfKind, TransferResource } from '@cacic-fct/shared-data-transfer';
import { parseTransferDocument } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { TicketPurchaseTransferAdapter } from './ticket-purchase-transfer.adapter';
import { EventTicketTransferAdapter } from './event-ticket-transfer.adapter';
import type { TransferAdapterContext } from './data-transfer-adapter';
import { transferPersonKey } from './transfer-person-creation';

type EditableResource<Kind extends 'ticket-purchase' | 'event-ticket'> = Omit<ResourceOfKind<Kind>, 'data'> & {
  data: { -readonly [Field in keyof ResourceOfKind<Kind>['data']]: ResourceOfKind<Kind>['data'][Field] };
};

function harness() {
  const now = new Date();
  const event = {
    id: 'event-1',
    name: 'Jantar',
    emoji: '🎟️',
    endDate: new Date(now.getTime() + 86_400_000),
    majorEventId: 'major-1',
    eventGroupId: null,
    updatedAt: now,
  };
  const config = {
    id: 'config-1',
    enabled: true,
    displayName: null,
    displayEmoji: null,
    expirationMode: 'EVENT_END',
    customExpiresAt: null,
    updatedAt: now,
  };
  const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const people = {
    match: jest.fn().mockResolvedValue({ id: 'person-1' }),
    hasReservedIdentity: jest.fn().mockResolvedValue(false),
    reviewCandidates: jest.fn().mockResolvedValue([]),
  };
  const issuance = {
    issueForPerson: jest.fn().mockImplementation(async (_tx, eventId, personId, _source, sourceKey) => ({
      id: 'issued-ticket',
      eventId,
      originalHolderPersonId: personId,
      sourceKey,
    })),
  };
  const realtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
  const tx = {
    event: { findFirst: jest.fn().mockResolvedValue(event), findMany: jest.fn().mockResolvedValue([{ id: event.id }]) },
    eventGroup: { findFirst: jest.fn().mockResolvedValue(null) },
    ticketConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    ticketPurchase: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventTicket: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventTicketHistory: { create: jest.fn() },
    ticketTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    people: {
      findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
      findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    },
    auditLogEntry: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const context = {
    tx,
    actor: { sub: 'organizer-1' },
    document: { format: 'cacic-event-data', version: 1, resources: [] },
    frozenResources: {
      assertEventMutable: jest.fn(),
      assertEventGroupMutable: jest.fn(),
      assertMajorEventMutable: jest.fn(),
    },
  } as unknown as TransferAdapterContext;
  const purchases = new TicketPurchaseTransferAdapter(authorization as never, people as never, issuance as never);
  const tickets = new EventTicketTransferAdapter(authorization as never, people as never, realtime as never);
  const purchase: EditableResource<'ticket-purchase'> = {
    kind: 'ticket-purchase',
    id: 'purchase-1',
    data: {
      eventId: event.id,
      person: { email: 'ana@example.com' },
      amountCents: 2500,
      purchasedAt: new Date(now.getTime() - 3_600_000).toISOString(),
    },
  };
  const ticket: EditableResource<'event-ticket'> = {
    kind: 'event-ticket',
    id: 'ticket-1',
    data: {
      eventId: event.id,
      person: { email: 'ana@example.com' },
      originalHolderPersonId: 'person-1',
      source: 'ADMIN',
      sourceKey: null,
      status: 'ACTIVE',
      issuedAt: purchase.data.purchasedAt,
      expiresAt: event.endDate.toISOString(),
      consumedAt: null,
      revokedAt: null,
      revokedReason: null,
    },
  };
  return {
    now,
    event,
    config,
    tx,
    context,
    purchases,
    tickets,
    purchase,
    ticket,
    authorization,
    people,
    issuance,
    realtime,
  };
}

describe('standalone ticket purchase transfer', () => {
  function storedPurchase(h: ReturnType<typeof harness>) {
    return {
      id: 'stored-purchase',
      personId: 'person-1',
      eventId: 'event-1',
      status: 'APPROVED',
      createdAt: new Date(h.purchase.data.purchasedAt ?? ''),
      updatedAt: h.now,
      amountCents: 2000,
      priceTierName: 'Original',
    };
  }

  it('updates an approved purchase matched by person without issuing another ticket or changing its original date', async () => {
    const h = harness();
    const stored = storedPurchase(h);
    h.tx.ticketPurchase.findFirst.mockResolvedValue(stored);
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    await h.purchases.apply(snapshot, 'update', h.context);
    expect(h.tx.ticketPurchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: stored.id,
        updatedAt: stored.updatedAt,
        status: 'APPROVED',
        personId: 'person-1',
        eventId: 'event-1',
      },
      data: { amountCents: 2500, priceTierName: 'Original' },
    });
    expect(h.issuance.issueForPerson).not.toHaveBeenCalled();
    expect(h.tx.ticketPurchase.create).not.toHaveBeenCalled();
    expect(h.tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
    expect(await h.purchases.readAppliedResource(snapshot, h.context)).toMatchObject({
      id: stored.id,
      data: { purchasedAt: h.purchase.data.purchasedAt },
    });
  });

  it('rejects a purchase update when the conditional write loses a race', async () => {
    const h = harness();
    h.tx.ticketPurchase.findFirst.mockResolvedValue(storedPurchase(h));
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    h.tx.ticketPurchase.updateMany.mockResolvedValue({ count: 0 });
    await expect(h.purchases.apply(snapshot, 'update', h.context)).rejects.toThrow(ConflictException);
    expect(h.tx.ticketPurchase.updateMany).toHaveBeenCalledTimes(1);
    expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(h.issuance.issueForPerson).not.toHaveBeenCalled();
  });

  it('preserves the purchase date during updates and rejects moving it', async () => {
    const h = harness();
    h.tx.ticketPurchase.findFirst.mockResolvedValue(storedPurchase(h));
    h.purchase.data.purchasedAt = new Date(h.now.getTime() - 7_200_000).toISOString();
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    await expect(h.purchases.apply(snapshot, 'update', h.context)).rejects.toThrow('não pode ser alterada');
    expect(h.tx.ticketPurchase.updateMany).not.toHaveBeenCalled();
    expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it.each(['sourceKey', 'eventId', 'originalHolderPersonId'] as const)(
    'rejects issuance returning a ticket with another %s instead of approving the wrong right',
    async (field) => {
      const h = harness();
      const snapshot = await h.purchases.resolve(h.purchase, h.context);
      h.issuance.issueForPerson.mockResolvedValue({
        id: 'wrong-ticket',
        eventId: 'event-1',
        originalHolderPersonId: 'person-1',
        sourceKey: 'purchase-1',
        [field]: 'another-identity',
      });
      await expect(h.purchases.apply(snapshot, 'create', h.context)).rejects.toThrow(ConflictException);
      expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a purchase when approval permission is revoked after review', async () => {
    const h = harness();
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    h.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Receipt.Approve)) throw new ForbiddenException();
    });
    await expect(h.purchases.apply(snapshot, 'create', h.context)).rejects.toThrow(ForbiddenException);
    expect(h.tx.ticketPurchase.create).not.toHaveBeenCalled();
    expect(h.issuance.issueForPerson).not.toHaveBeenCalled();
    expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it.each(['future', 'expired'] as const)('rejects a %s purchase date before issuing rights', async (date) => {
    const h = harness();
    h.purchase.data.purchasedAt = new Date(h.now.getTime() + 60_000).toISOString();
    if (date === 'expired') {
      h.event.endDate = new Date(h.now.getTime() - 7_200_000);
      h.purchase.data.purchasedAt = new Date(h.now.getTime() - 3_600_000).toISOString();
    }
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    await expect(h.purchases.apply(snapshot, 'create', h.context)).rejects.toThrow('antes da expiração');
    expect(h.tx.ticketPurchase.create).not.toHaveBeenCalled();
    expect(h.issuance.issueForPerson).not.toHaveBeenCalled();
  });

  it('records an approved purchase and issues its right without reading or creating a subscription', async () => {
    const h = harness();
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    expect(snapshot.scope).toMatchObject({ eventId: 'event-1', majorEventId: 'major-1' });
    await h.purchases.validate(snapshot, h.context);
    await h.purchases.apply(snapshot, 'create', h.context);
    expect(h.tx.ticketPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personId: 'person-1',
        majorEventSubscriptionId: null,
        status: 'APPROVED',
        amountCents: 2500,
        objectKey: '',
        sizeBytes: 0,
      }),
    });
    expect(h.issuance.issueForPerson).toHaveBeenCalledWith(
      h.tx,
      'event-1',
      'person-1',
      'PURCHASE',
      'purchase-1',
      expect.objectContaining({ issuedAt: new Date(h.purchase.data.purchasedAt ?? ''), actorUserId: 'organizer-1' }),
    );
  });

  it('requires a person review and honors an explicit creation decision', async () => {
    const h = harness();
    h.people.match.mockResolvedValue({ missing: true, message: 'Pessoa não encontrada.' });
    const pending = await h.purchases.resolve(h.purchase, h.context);
    expect(pending.personPrompt).toBeDefined();
    h.context.personDecisions = [
      { key: transferPersonKey(h.purchase.data.person ?? {}), action: 'create', data: { name: 'Ana Silva' } },
    ];
    const ready = await h.purchases.resolve(h.purchase, h.context);
    expect(ready.personCreation).toMatchObject({ data: { name: 'Ana Silva', email: 'ana@example.com' } });
    expect(h.tx.ticketPurchase.create).not.toHaveBeenCalled();
  });

  it('authorizes the target before resolving any person and requires ticket/receipt rights', async () => {
    const h = harness();
    h.authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(h.purchases.resolve(h.purchase, h.context)).rejects.toThrow(ForbiddenException);
    expect(h.people.match).not.toHaveBeenCalled();
    expect(h.authorization.assertPermissions).toHaveBeenCalledWith(
      h.context.actor,
      expect.arrayContaining([Permission.Ticket.Read, Permission.Receipt.Read]),
      expect.objectContaining({ eventId: 'event-1' }),
    );
  });

  it('rejects an existing ticket, another owner’s purchase, and purchases still awaiting review', async () => {
    const h = harness();
    h.tx.eventTicket.findFirst.mockResolvedValue({ id: 'other-ticket', sourceKey: null, updatedAt: h.now });
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    await expect(h.purchases.validate(snapshot, h.context)).rejects.toThrow('já possui um bilhete');
    h.tx.ticketPurchase.findUnique.mockResolvedValue({ personId: 'other-person', eventId: 'event-1' });
    await expect(h.purchases.resolve(h.purchase, h.context)).rejects.toThrow(ForbiddenException);
    h.tx.ticketPurchase.findUnique.mockResolvedValue(null);
    h.tx.ticketPurchase.findFirst.mockResolvedValue({ status: 'UNDER_REVIEW' });
    await expect(h.purchases.resolve(h.purchase, h.context)).rejects.toThrow('fluxo de comprovantes');
  });

  it('matches an approved purchase by event/person and blocks stale writes', async () => {
    const h = harness();
    const stored = {
      id: 'stored-purchase',
      personId: 'person-1',
      eventId: 'event-1',
      status: 'APPROVED',
      createdAt: new Date(h.purchase.data.purchasedAt ?? ''),
      updatedAt: h.now,
      amountCents: 2000,
      priceTierName: null,
    };
    h.tx.ticketPurchase.findFirst.mockResolvedValue(stored);
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    expect(snapshot.resolvedId).toBe(stored.id);
    h.tx.ticketPurchase.findFirst.mockResolvedValue({ ...stored, updatedAt: new Date(h.now.getTime() + 1) });
    await expect(h.purchases.apply(snapshot, 'update', h.context)).rejects.toThrow('A compra mudou');
  });

  it('uses executable event/configuration changes and preserves historical purchase dates', async () => {
    const h = harness();
    h.tx.event.findFirst.mockResolvedValue(null);
    h.tx.ticketConfig.findUnique.mockResolvedValue(null);
    const parents: TransferResource[] = [
      {
        kind: 'event',
        id: 'event-1',
        data: { name: 'Jantar', majorEventId: 'major-1', endDate: h.event.endDate.toISOString() },
      },
      { kind: 'ticket-config', id: 'new-config', data: { eventId: 'event-1', enabled: true } },
    ];
    h.context.document.resources = [...parents, h.purchase];
    const snapshot = await h.purchases.resolve(h.purchase, h.context);
    expect(snapshot.dependencies).toContainEqual({ kind: 'ticket-config', id: 'new-config' });
    await expect(h.purchases.validatePlan(snapshot, h.context, parents)).resolves.toBeUndefined();
    await expect(h.purchases.validatePlan(snapshot, h.context, parents.slice(0, 1))).rejects.toThrow('Habilite');
  });
});

describe('ticket lifecycle import safety', () => {
  it.each([
    ['disabled configuration', 'Habilite a configuração'],
    ['missing original holder', 'titular original'],
    ['reserved source', 'origem já pertence'],
    ['duplicate holder', 'já possui outro bilhete'],
  ] as const)('rejects %s before granting a ticket', async (conflict, message) => {
    const h = harness();
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    if (conflict === 'disabled configuration') h.config.enabled = false;
    if (conflict === 'missing original holder') h.tx.people.findFirst.mockResolvedValue(null);
    if (conflict === 'reserved source') {
      // Source keys are globally unique, even when the conflicting ticket has another holder.
      Object.assign(snapshot.resource.data, { sourceKey: 'reserved-source' });
      h.tx.eventTicket.findUnique.mockImplementation(async ({ where }) =>
        where.sourceKey ? { id: 'another-ticket' } : null,
      );
    }
    if (conflict === 'duplicate holder') h.tx.eventTicket.findFirst.mockResolvedValue({ id: 'another-ticket' });
    await expect(h.tickets.apply(snapshot, 'create', h.context)).rejects.toThrow(message);
    expect(h.tx.eventTicket.create).not.toHaveBeenCalled();
    expect(h.tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(h.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it.each([
    ['future issuance', { issuedAt: 60_000 }, 'emissão'],
    ['expiration equal to issuance', { expiresAt: -3_600_000 }, 'emissão'],
    ['consumption before issuance', { status: 'CONSUMED', consumedAt: -7_200_000 }, 'consumo'],
    ['future consumption', { status: 'CONSUMED', consumedAt: 60_000 }, 'consumo'],
    ['missing consumption', { status: 'CONSUMED' }, 'consumo'],
    ['consumption on active ticket', { consumedAt: -60_000 }, 'consumo'],
    ['revocation before issuance', { status: 'REVOKED', revokedAt: -7_200_000 }, 'revogação'],
    ['future revocation', { status: 'REVOKED', revokedAt: 60_000 }, 'revogação'],
    ['missing revocation', { status: 'REVOKED' }, 'revogação'],
    ['revocation on active ticket', { revokedAt: -60_000 }, 'revogação'],
    ['revocation reason on active ticket', { revokedReason: 'Cancelado' }, 'revogação'],
  ] as const)('rejects %s before ticket, history, audit or notification writes', async (_name, fields, message) => {
    const h = harness();
    Object.assign(
      h.ticket.data,
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          key,
          typeof value === 'number' ? new Date(h.now.getTime() + value).toISOString() : value,
        ]),
      ),
    );
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await expect(h.tickets.apply(snapshot, 'create', h.context)).rejects.toThrow(message);
    expect(h.tx.eventTicket.create).not.toHaveBeenCalled();
    expect(h.tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(h.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  function existingTicket(h: ReturnType<typeof harness>) {
    return {
      id: h.ticket.id,
      eventId: h.event.id,
      holderPersonId: 'person-1',
      originalHolderPersonId: 'person-1',
      source: 'ADMIN',
      sourceKey: null,
      status: 'ACTIVE',
      issuedAt: new Date(h.ticket.data.issuedAt ?? ''),
      expiresAt: h.event.endDate,
      consumedAt: null,
      revokedAt: null,
      revokedReason: null,
      updatedAt: h.now,
    };
  }

  it('hides tickets from another event before resolving holder identities', async () => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue({ ...existingTicket(h), eventId: 'other-event' } as never);
    await expect(h.tickets.resolve(h.ticket, h.context)).rejects.toThrow(ForbiddenException);
    expect(h.people.match).not.toHaveBeenCalled();
  });

  it('rejects a changed revision between resolution and application without writing ticket history', async () => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue(existingTicket(h) as never);
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    h.tx.eventTicket.findUnique.mockResolvedValue({
      ...existingTicket(h),
      updatedAt: new Date(h.now.getTime() + 1),
    } as never);
    await expect(h.tickets.apply(snapshot, 'update', h.context)).rejects.toThrow(ConflictException);
    expect(h.tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(h.tx.eventTicketHistory.create).not.toHaveBeenCalled();
  });

  it('records an explicit revocation with its historical date and reason', async () => {
    const h = harness();
    const revokedAt = new Date(h.now.getTime() - 60_000);
    Object.assign(h.ticket.data, { status: 'REVOKED', revokedAt: revokedAt.toISOString(), revokedReason: 'Cancelado' });
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await h.tickets.apply(snapshot, 'create', h.context);
    expect(h.tx.eventTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'REVOKED',
        revokedAt,
        revokedReason: 'Cancelado',
        consumedAt: null,
      }),
    });
    expect(h.tx.eventTicketHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: 'REVOKED' }),
    });
  });

  it.each([
    ['source', 'PURCHASE'],
    ['sourceKey', 'another-purchase'],
    ['originalHolderPersonId', 'another-person'],
    ['issuedAt', 'earlier'],
  ] as const)('keeps an existing ticket’s %s immutable', async (field, value) => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue(existingTicket(h) as never);
    Object.assign(h.ticket.data, {
      [field]: value === 'earlier' ? new Date(h.now.getTime() - 7_200_000).toISOString() : value,
    });
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await expect(h.tickets.apply(snapshot, 'update', h.context)).rejects.toThrow('imutáveis');
    expect(h.tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(h.tx.eventTicketHistory.create).not.toHaveBeenCalled();
  });

  it('blocks holder replacement while a transfer is pending', async () => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue(existingTicket(h) as never);
    h.people.match.mockResolvedValue({ id: 'next-holder' });
    h.tx.ticketTransfer.findFirst.mockResolvedValue({ id: 'pending-transfer' } as never);
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await expect(h.tickets.apply(snapshot, 'update', h.context)).rejects.toThrow('transferência pendente');
    expect(h.tx.eventTicket.updateMany).not.toHaveBeenCalled();
    expect(h.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it('rejects a revision race at the conditional write without recording a false successful transfer', async () => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue(existingTicket(h) as never);
    h.people.match.mockResolvedValue({ id: 'next-holder' });
    h.tx.eventTicket.updateMany.mockResolvedValue({ count: 0 });
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await expect(h.tickets.apply(snapshot, 'update', h.context)).rejects.toThrow(ConflictException);
    expect(h.tx.eventTicket.updateMany).toHaveBeenCalledWith({
      where: { id: h.ticket.id, updatedAt: h.now },
      data: expect.objectContaining({ holderPersonId: 'next-holder' }),
    });
    expect(h.tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(h.tx.auditLogEntry.create).not.toHaveBeenCalled();
    expect(h.realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it('notifies both holders and records lineage when a reviewed replacement succeeds', async () => {
    const h = harness();
    h.tx.eventTicket.findUnique.mockResolvedValue(existingTicket(h) as never);
    h.people.match.mockResolvedValue({ id: 'next-holder' });
    h.tx.people.findUnique
      .mockResolvedValueOnce({ userId: 'next-user' })
      .mockResolvedValueOnce({ userId: 'previous-user' });
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await h.tickets.apply(snapshot, 'update', h.context);
    expect(h.tx.eventTicketHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'TRANSFERRED',
        previousHolderPersonId: 'person-1',
        newHolderPersonId: 'next-holder',
      }),
    });
    expect(h.realtime.enqueueForUsers).toHaveBeenCalledWith(h.tx, ['next-user', 'previous-user'], {
      type: 'TICKETS_CHANGED',
      eventId: h.event.id,
      ticketId: h.ticket.id,
    });
  });
});

describe('issued ticket transfer and optional export', () => {
  it.each([
    [null, 'ACTIVE', false],
    [null, 'CONSUMED', false],
    [null, 'REVOKED', true],
    ['ACTIVE', 'ACTIVE', false],
    ['ACTIVE', 'REVOKED', true],
    ['REVOKED', 'REVOKED', false],
  ] as const)('requires revoke access only for a revocation (%s → %s)', async (previous, status, revokes) => {
    const h = harness();
    h.ticket.data.status = status;
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    if (previous) {
      snapshot.current = {
        ...snapshot.resource,
        data: { ...snapshot.resource.data, status: previous },
      } as ResourceOfKind<'event-ticket'>;
    }
    h.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Ticket.Revoke)) throw new ForbiddenException();
    });
    const check = h.tickets.assertWrite(snapshot, previous ? 'update' : 'create', h.context);
    if (revokes) await expect(check).rejects.toThrow(ForbiddenException);
    else await expect(check).resolves.toBeUndefined();
  });

  it('requires transfer rights for imported lineage during preview and apply', async () => {
    const h = harness();
    h.ticket.data.originalHolderPersonId = 'original-1';
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    h.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.TicketTransfer.Manage)) throw new ForbiddenException();
    });
    await expect(h.tickets.assertWrite(snapshot, 'create', h.context)).rejects.toThrow(ForbiddenException);
    await expect(h.tickets.apply(snapshot, 'create', h.context)).rejects.toThrow(ForbiddenException);
    expect(h.tx.eventTicket.create).not.toHaveBeenCalled();
    h.ticket.data.originalHolderPersonId = 'person-1';
    const unchanged = await h.tickets.resolve(h.ticket, h.context);
    await expect(h.tickets.assertWrite(unchanged, 'create', h.context)).resolves.toBeUndefined();
  });

  it.each(['EVENT_SUBSCRIPTION', 'MAJOR_EVENT_SUBSCRIPTION'] as const)(
    'validates %s source keys against the original holder',
    async (source) => {
      const h = harness();
      h.ticket.data.source = source;
      h.ticket.data.originalHolderPersonId = 'original-1';
      const prefix = source === 'EVENT_SUBSCRIPTION' ? 'event-subscription' : 'major-event-subscription';
      for (const sourceKey of [null, `${prefix}:other-event:original-1`, `${prefix}:event-1:person-1`]) {
        h.ticket.data.sourceKey = sourceKey;
        const snapshot = await h.tickets.resolve(h.ticket, h.context);
        await expect(h.tickets.validate(snapshot, h.context)).rejects.toThrow('origem automática');
      }
      h.ticket.data.sourceKey = `${prefix}:event-1:original-1`;
      const snapshot = await h.tickets.resolve(h.ticket, h.context);
      await expect(h.tickets.validate(snapshot, h.context)).resolves.toBeUndefined();
    },
  );

  it('reserves planned purchase IDs even when the explicit ticket has a different holder', async () => {
    const h = harness();
    h.ticket.data.sourceKey = h.purchase.id;
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    const purchase = { ...h.purchase, data: { ...h.purchase.data, person: { id: 'other-person' } } };
    await expect(h.tickets.validatePlan(snapshot, h.context, [purchase, snapshot.resource])).rejects.toThrow(
      'mesma origem',
    );
    await expect(h.tickets.validatePlan(snapshot, h.context, [snapshot.resource])).resolves.toBeUndefined();
  });

  it.each(['ADMIN', 'PURCHASE', 'EVENT_SUBSCRIPTION', 'MAJOR_EVENT_SUBSCRIPTION'] as const)(
    'imports an unsubscribed holder’s %s ticket with the original identity and state',
    async (source) => {
      const h = harness();
      h.ticket.data.source = source;
      if (source === 'EVENT_SUBSCRIPTION' || source === 'MAJOR_EVENT_SUBSCRIPTION') {
        const prefix = source === 'EVENT_SUBSCRIPTION' ? 'event-subscription' : 'major-event-subscription';
        h.ticket.data.sourceKey = `${prefix}:event-1:person-1`;
      }
      h.ticket.data.status = 'CONSUMED';
      h.ticket.data.consumedAt = new Date(h.now.getTime() - 60_000).toISOString();
      const snapshot = await h.tickets.resolve(h.ticket, h.context);
      await h.tickets.validate(snapshot, h.context);
      await h.tickets.apply(snapshot, 'create', h.context);
      expect(h.tx.eventTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: 'ticket-1', holderPersonId: 'person-1', source, status: 'CONSUMED' }),
      });
      expect(h.realtime.enqueueForUsers).toHaveBeenCalled();
    },
  );

  it('does not read tickets unless explicitly selected and authorizes each child event before exporting holders', async () => {
    const h = harness();
    const target = { kind: 'major-event', id: 'major-1' } as const;
    const options = { includeDescendants: false, includeConfiguration: false };
    expect(await h.tickets.exportTarget(target, options, h.context)).toEqual({ resources: [], issues: [] });
    expect(h.tx.event.findMany).not.toHaveBeenCalled();
    h.authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    const output = await h.tickets.exportTarget(target, { ...options, includeTickets: true }, h.context);
    expect(output.issues).toHaveLength(1);
    expect(h.tx.eventTicket.findMany).not.toHaveBeenCalled();
  });

  it('requires person read permission for private holder fields while preserving the permitted holder reference', async () => {
    const h = harness();
    h.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Person.Read)) throw new ForbiddenException();
    });
    h.tx.eventTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-1',
        eventId: 'event-1',
        holderPersonId: 'person-1',
        issuedAt: h.now,
        expiresAt: h.event.endDate,
        updatedAt: h.now,
        holder: {
          id: 'person-1',
          name: 'Ana Silva',
          email: 'ana@example.test',
          phone: '18999999999',
          academicId: '123',
          identityDocument: 'private-document',
          deletedAt: null,
          mergedIntoId: null,
        },
      },
    ]);
    const output = await h.tickets.exportTarget(
      { kind: 'event', id: 'event-1' },
      { includeDescendants: false, includeConfiguration: false, includeTickets: true },
      h.context,
    );
    expect(output.resources[0]?.data).toHaveProperty('person', { name: 'Ana Silva' });
    expect(h.authorization.assertPermissions).toHaveBeenCalledWith(h.context.actor, [Permission.Person.Read]);
  });

  it('exports transferred, consumed, and revoked tickets with holder references accepted by the importer', async () => {
    const h = harness();
    const base = {
      id: 'ticket-1',
      eventId: 'event-1',
      holderPersonId: 'person-1',
      originalHolderPersonId: 'original-1',
      source: 'PURCHASE',
      sourceKey: 'purchase-1',
      status: 'CONSUMED',
      issuedAt: new Date(h.purchase.data.purchasedAt ?? ''),
      expiresAt: h.event.endDate,
      consumedAt: new Date(h.now.getTime() - 60_000),
      revokedAt: null,
      revokedReason: null,
      updatedAt: h.now,
      holder: { id: 'person-1', name: 'Ana Silva', email: 'ana@example.com', deletedAt: null, mergedIntoId: null },
      originalHolder: {
        id: 'original-1',
        name: 'Bruno Santos',
        email: 'bruno@example.com',
        deletedAt: null,
        mergedIntoId: null,
      },
    };
    h.tx.eventTicket.findMany.mockResolvedValue([
      base,
      {
        ...base,
        id: 'ticket-2',
        source: 'ADMIN',
        sourceKey: null,
        status: 'REVOKED',
        consumedAt: null,
        revokedAt: h.now,
        revokedReason: 'Cancelado',
      },
    ]);
    const output = await h.tickets.exportTarget(
      { kind: 'event', id: 'event-1' },
      { includeDescendants: false, includeConfiguration: false, includeTickets: true },
      h.context,
    );
    expect(output.resources).toHaveLength(2);
    for (const resource of output.resources) {
      if (resource.kind !== 'event-ticket') throw new Error('Unexpected exported resource.');
      expect(resource.data.person).not.toHaveProperty('id');
    }
    expect(output.resources[0]?.data).toMatchObject({
      person: { name: 'Ana Silva', email: 'ana@example.com' },
      originalHolder: { name: 'Bruno Santos', email: 'bruno@example.com' },
      source: 'PURCHASE',
      status: 'CONSUMED',
    });
    expect(
      parseTransferDocument({ format: 'cacic-event-data', version: 1, resources: output.resources }).resources,
    ).toHaveLength(2);
  });

  it('preserves transferred lineage and rejects duplicate rights in the same executable plan', async () => {
    const h = harness();
    h.ticket.data.originalHolderPersonId = 'original-1';
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    await h.tickets.apply(snapshot, 'create', h.context);
    expect(h.tx.eventTicketHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'TRANSFERRED',
        previousHolderPersonId: 'original-1',
        newHolderPersonId: 'person-1',
      }),
    });
    await expect(
      h.tickets.validatePlan(snapshot, h.context, [
        { ...h.purchase, data: { ...h.purchase.data, person: { id: 'person-1' } } },
      ]),
    ).rejects.toThrow('já possui outro bilhete');
  });

  it.each(['EVENT_SUBSCRIPTION', 'MAJOR_EVENT_SUBSCRIPTION'] as const)(
    'round-trips portable %s lineage with different destination person IDs',
    async (source) => {
      const h = harness();
      const originalHolder = { id: 'source-original', name: 'Bruno Santos', email: 'bruno@example.com' };
      const holder = { id: 'source-holder', name: 'Ana Silva', email: 'ana@example.com' };
      const prefix = source === 'EVENT_SUBSCRIPTION' ? 'event-subscription' : 'major-event-subscription';
      h.tx.eventTicket.findMany.mockResolvedValue([
        {
          id: h.ticket.id,
          eventId: h.event.id,
          holderPersonId: holder.id,
          originalHolderPersonId: originalHolder.id,
          source,
          sourceKey: `${prefix}:event-1:${originalHolder.id}`,
          status: 'ACTIVE',
          issuedAt: new Date(h.ticket.data.issuedAt ?? ''),
          expiresAt: h.event.endDate,
          consumedAt: null,
          revokedAt: null,
          revokedReason: null,
          updatedAt: h.now,
          holder,
          originalHolder,
        },
      ]);
      const output = await h.tickets.exportTarget(
        { kind: 'event', id: h.event.id },
        { includeDescendants: false, includeConfiguration: false, includeTickets: true },
        h.context,
      );
      const exported = parseTransferDocument({
        format: 'cacic-event-data',
        version: 1,
        resources: output.resources,
      }).resources[0];
      if (!exported || exported.kind !== 'event-ticket' || !exported.id) throw new Error('Missing exported ticket.');
      expect(exported.data).not.toHaveProperty('originalHolderPersonId');
      expect(exported.data).not.toHaveProperty('sourceKey');
      expect(exported.data.originalHolder).not.toHaveProperty('id');
      h.people.match.mockImplementation(async (reference) => ({
        id: reference.email === 'bruno@example.com' ? 'destination-original' : 'destination-holder',
      }));
      const snapshot = await h.tickets.resolve({ ...exported, id: exported.id }, h.context);
      await h.tickets.apply(snapshot, 'create', h.context);
      expect(h.tx.eventTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          holderPersonId: 'destination-holder',
          originalHolderPersonId: 'destination-original',
          sourceKey: `${prefix}:event-1:destination-original`,
        }),
      });
      expect(h.tx.eventTicketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'TRANSFERRED',
          previousHolderPersonId: 'destination-original',
          newHolderPersonId: 'destination-holder',
        }),
      });
    },
  );

  it('reuses a newly reviewed current holder as the portable original holder', async () => {
    const h = harness();
    const reference = { name: 'Carla Souza', email: 'carla@example.com' };
    delete h.ticket.data.originalHolderPersonId;
    delete h.ticket.data.sourceKey;
    h.ticket.data.person = reference;
    h.ticket.data.originalHolder = reference;
    h.ticket.data.source = 'EVENT_SUBSCRIPTION';
    h.people.match.mockResolvedValue({ missing: true, message: 'Não encontrada.' });
    h.context.personDecisions = [{ key: transferPersonKey(reference), action: 'create', data: reference }];
    const snapshot = await h.tickets.resolve(h.ticket, h.context);
    expect(snapshot.resource.data).toMatchObject({ originalHolderPersonId: snapshot.personCreation?.id });
    await h.tickets.validate(snapshot, h.context);
  });

  it('blocks ambiguous original holders and conflicting lineage fields', async () => {
    const h = harness();
    h.ticket.data.originalHolder = { name: 'Bruno Santos' };
    await expect(h.tickets.resolve(h.ticket, h.context)).rejects.toThrow('nunca ambos');
    delete h.ticket.data.originalHolderPersonId;
    h.people.match
      .mockResolvedValueOnce({ id: 'person-1' })
      .mockResolvedValueOnce({ reviewIds: ['original-1', 'original-2'], message: 'Mais de uma pessoa.' });
    await expect(h.tickets.resolve(h.ticket, h.context)).rejects.toThrow('titular original');
  });
});
