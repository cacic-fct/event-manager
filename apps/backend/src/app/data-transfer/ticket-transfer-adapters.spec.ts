import { ForbiddenException } from '@nestjs/common';
import type { ResourceOfKind, TransferResource } from '@cacic-fct/shared-data-transfer';
import { parseTransferDocument } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { TicketPurchaseTransferAdapter } from './ticket-purchase-transfer.adapter';
import { EventTicketTransferAdapter } from './event-ticket-transfer.adapter';
import type { TransferAdapterContext } from './data-transfer-adapter';
import { transferPersonKey } from './transfer-person-creation';

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
  const purchase: ResourceOfKind<'ticket-purchase'> = {
    kind: 'ticket-purchase',
    id: 'purchase-1',
    data: {
      eventId: event.id,
      person: { email: 'ana@example.com' },
      amountCents: 2500,
      purchasedAt: new Date(now.getTime() - 3_600_000).toISOString(),
    },
  };
  const ticket: ResourceOfKind<'event-ticket'> = {
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

describe('issued ticket transfer and optional export', () => {
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
    for (const resource of output.resources) expect(resource.data.person).not.toHaveProperty('id');
    expect(output.resources[0]?.data).toMatchObject({
      person: { name: 'Ana Silva', email: 'ana@example.com' },
      originalHolderPersonId: 'original-1',
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
});
