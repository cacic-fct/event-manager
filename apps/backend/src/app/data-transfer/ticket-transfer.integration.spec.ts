import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import type {
  ResourceOfKind,
  TransferApplyRequest,
  TransferDocument,
  TransferPersonDecision,
} from '@cacic-fct/shared-data-transfer';
import { createTicketTransferFixture } from './testing/ticket-transfer.fixtures';
import type { DataTransferAdapter } from './data-transfer-adapter';

describe('ticket imports with transactional storage and the durable undo journal', () => {
  let fixture: Awaited<ReturnType<typeof createTicketTransferFixture>>;

  beforeEach(async () => {
    fixture = await createTicketTransferFixture();
  });
  afterEach(async () => {
    await fixture.database.close();
  });

  async function reviewedRequest(): Promise<TransferApplyRequest> {
    const preview = await fixture.transfer.preview({ document: fixture.document }, fixture.actor);
    expect(preview).toMatchObject({ canApply: true, summary: { create: 1, skip: 0 } });
    return {
      document: fixture.document,
      planHash: preview.planHash,
      allocationToken: preview.allocation?.token,
      allowPartial: false,
    };
  }

  it('imports portable automatic lineage with destination identities and issue permission alone', async () => {
    fixture.denied.add(Permission.Ticket.Revoke);
    const resource = fixture.document.resources[0] as ResourceOfKind<'event-ticket'>;
    const data = { ...resource.data };
    delete data.sourceKey;
    fixture.document = {
      ...fixture.document,
      resources: [
        {
          ...resource,
          data: {
            ...data,
            person: { name: 'Ana Silva' },
            originalHolder: { name: 'Ana Silva' },
            source: 'EVENT_SUBSCRIPTION',
          },
        },
      ],
    };
    await fixture.transfer.apply(await reviewedRequest(), fixture.actor);
    expect(await fixture.client.eventTicket.findMany()).toEqual([
      expect.objectContaining({
        holderPersonId: 'person-1',
        originalHolderPersonId: 'person-1',
        sourceKey: 'event-subscription:event-1:person-1',
      }),
    ]);
    expect(await fixture.client.eventTicketHistory.findMany()).toEqual([
      expect.objectContaining({ operation: 'ISSUED' }),
    ]);
  });

  it('requires transfer permission after resolving a portable original holder', async () => {
    fixture.denied.add(Permission.TicketTransfer.Manage);
    const resource = fixture.document.resources[0] as ResourceOfKind<'event-ticket'>;
    fixture.document = {
      ...fixture.document,
      resources: [
        {
          ...resource,
          data: {
            ...resource.data,
            person: { name: 'Ana Silva' },
            originalHolder: { name: 'Bruno Santos' },
          },
        },
      ],
    };
    const before = await fixture.state();
    const preview = await fixture.transfer.preview({ document: fixture.document }, fixture.actor);
    expect(preview).toMatchObject({ canApply: false, summary: { skip: 1 } });
    expect(await fixture.state()).toEqual(before);
  });

  it('applies and undoes a ticket update after a reviewed configuration write aligns its expiry', async () => {
    await fixture.transfer.apply(await reviewedRequest(), fixture.actor);
    const originalTicket = (await fixture.client.eventTicket.findMany())[0];
    if (!originalTicket) throw new Error('Expected an existing ticket.');
    const originalRevision = originalTicket['updatedAt'];
    if (!(originalRevision instanceof Date)) throw new Error('Expected a persisted ticket revision.');
    const originalConfig = await fixture.client.ticketConfig.findUnique({ where: { id: 'config-1' } });
    const expiresAt = new Date(Date.now() + 172_800_000);
    // Model the parent's alignment writes, including Prisma's automatic updatedAt advance,
    // against the transactional fixture so the real service and journal coordinate them.
    const configuration: DataTransferAdapter = {
      kinds: ['ticket-config'],
      dependencyOrder: 80,
      resolve: async (resource, context) => {
        const config = await context.tx.ticketConfig.findUnique({ where: { id: resource.id } });
        if (!config) throw new Error('Expected ticket configuration.');
        return {
          resource,
          current: { kind: 'ticket-config', id: config.id, data: { eventId: config.eventId } },
          revision: config.updatedAt.toISOString(),
          scope: { eventId: config.eventId },
          dependencies: [],
        };
      },
      assertRead: async () => undefined,
      assertWrite: async () => undefined,
      assertMutable: async () => undefined,
      validate: async () => undefined,
      apply: async (snapshot, _action, context) => {
        await context.tx.ticketConfig.updateMany({
          where: { id: snapshot.resource.id, updatedAt: new Date(snapshot.revision ?? '') },
          data: { expirationMode: 'CUSTOM', customExpiresAt: expiresAt },
        });
        await context.tx.eventTicket.updateMany({
          where: { id: String(originalTicket['id']) },
          data: {
            expiresAt,
            updatedAt: new Date(originalRevision.getTime() + 1),
          },
        });
        return {};
      },
      exportTarget: async () => ({ resources: [], issues: [] }),
    };
    const transfer = fixture.createService([configuration]);
    const document: TransferDocument = {
      format: 'cacic-event-data',
      version: 1,
      resources: [
        {
          kind: 'ticket-config',
          id: 'config-1',
          data: { eventId: 'event-1', expirationMode: 'CUSTOM', customExpiresAt: expiresAt.toISOString() },
        },
        {
          kind: 'event-ticket',
          id: String(originalTicket['id']),
          data: { eventId: 'event-1', expiresAt: expiresAt.toISOString() },
        },
      ],
    };
    const preview = await transfer.preview({ document }, fixture.actor);
    expect(preview).toMatchObject({ canApply: true, summary: { update: 2, skip: 0 } });

    const applied = await transfer.apply({ document, planHash: preview.planHash, allowPartial: false }, fixture.actor);
    expect(applied.applied).toBe(true);
    expect(await fixture.client.eventTicket.findUnique({ where: { id: originalTicket['id'] } })).toMatchObject({
      expiresAt,
    });

    await transfer.undo(applied.batchId ?? '', fixture.actor);
    expect(await fixture.client.eventTicket.findUnique({ where: { id: originalTicket['id'] } })).toEqual({
      ...originalTicket,
      updatedAt: expect.any(Date),
    });
    expect(await fixture.client.ticketConfig.findUnique({ where: { id: 'config-1' } })).toEqual({
      ...originalConfig,
      updatedAt: expect.any(Date),
    });
  });

  it('rolls back the ticket, history, audit and outbox if notification enqueueing fails after its write', async () => {
    const request = await reviewedRequest();
    const before = await fixture.state();
    const enqueue = fixture.realtime.enqueueForUsers.getMockImplementation();
    fixture.realtime.enqueueForUsers.mockImplementationOnce(async (...args) => {
      await enqueue?.(...args);
      throw new Error('Outbox unavailable');
    });

    await expect(fixture.transfer.apply(request, fixture.actor)).rejects.toThrow('Outbox unavailable');
    expect(await fixture.state()).toEqual(before);

    const result = await fixture.transfer.apply(request, fixture.actor);
    expect(result.applied).toBe(true);
    expect(await fixture.client.eventTicket.findMany()).toHaveLength(1);
    expect(await fixture.client.eventTicketHistory.findMany()).toHaveLength(1);
    expect(await fixture.client.ticketRealtimeOutbox.findMany()).toHaveLength(1);
  });

  it.each(['create', 'merge'] as const)(
    'atomically persists and undoes an explicitly reviewed person %s together with their ticket',
    async (action) => {
      if (action === 'merge') {
        await fixture.client.people.update({ where: { id: 'person-1' }, data: { userId: null } });
      }
      const beforePeople = await fixture.client.people.findMany();
      const resource = fixture.document.resources[0] as ResourceOfKind<'event-ticket'>;
      const person = { name: action === 'merge' ? 'Ana Silva' : 'Carla Souza', email: 'imported@example.test' };
      fixture.document = {
        ...fixture.document,
        resources: [
          {
            ...resource,
            data: { ...resource.data, person },
          },
        ],
      };
      const pending = await fixture.transfer.preview({ document: fixture.document }, fixture.actor);
      expect(pending.canApply).toBe(false);
      const prompt = pending.personPrompts?.[0];
      if (!prompt) throw new Error('Expected an explicit person review.');
      const choice = { key: prompt.key, data: person, reviewHash: prompt.reviewHash };
      const personDecisions: TransferPersonDecision[] = [
        action === 'merge' ? { ...choice, action, personId: 'person-1' } : { ...choice, action },
      ];
      const preview = await fixture.transfer.preview({ document: fixture.document, personDecisions }, fixture.actor);
      expect(preview.canApply).toBe(true);
      const request = {
        document: fixture.document,
        personDecisions,
        planHash: preview.planHash,
        allocationToken: preview.allocation?.token,
        allowPartial: false,
      };
      fixture.realtime.enqueueForUsers.mockRejectedValueOnce(new Error('Notification storage unavailable'));
      await expect(fixture.transfer.apply(request, fixture.actor)).rejects.toThrow('Notification storage unavailable');
      expect(await fixture.client.people.findMany()).toEqual(beforePeople);
      expect(await fixture.client.eventTicket.findMany()).toEqual([]);
      expect(await fixture.client.auditLogEntry.findMany()).toEqual([]);

      const result = await fixture.transfer.apply(request, fixture.actor);
      const people = await fixture.client.people.findMany();
      expect(people).toHaveLength(action === 'create' ? 3 : 2);
      expect(people).toContainEqual(
        expect.objectContaining(
          action === 'create'
            ? { name: 'Carla Souza', email: person.email }
            : { id: 'person-1', secondaryEmails: [person.email] },
        ),
      );
      await fixture.transfer.undo(result.batchId ?? '', fixture.actor);
      const restored = await fixture.client.people.findMany();
      expect(restored).toEqual(
        beforePeople.map((row) =>
          action === 'merge' && row['id'] === 'person-1'
            ? { ...row, updatedAt: expect.any(Date), updatedById: fixture.actor.sub }
            : row,
        ),
      );
      expect(await fixture.client.eventTicket.findMany()).toEqual([]);
      expect(await fixture.client.eventTicketHistory.findMany()).toEqual([]);
    },
  );

  it('recovers an exact committed request after service restart without reissuing or restoring an undone ticket', async () => {
    const request = await reviewedRequest();
    const result = await fixture.transfer.apply(request, fixture.actor);
    const committed = await fixture.state();
    const restarted = fixture.createService();

    const replay = await restarted.apply(request, fixture.actor);
    expect(replay).toMatchObject({ applied: true, batchId: result.batchId, document: result.document });
    expect(await fixture.state()).toEqual(committed);

    await restarted.undo(result.batchId ?? '', fixture.actor);
    const undone = await fixture.state();
    await expect(restarted.apply(request, fixture.actor)).rejects.toThrow('já foi desfeita');
    await expect(restarted.undo(result.batchId ?? '', fixture.actor)).rejects.toThrow(ConflictException);
    expect(await fixture.state()).toEqual(undone);
  });

  it.each(['configuration', 'holder'] as const)(
    'rejects a stale %s before persisting any import writes',
    async (change) => {
      const request = await reviewedRequest();
      if (change === 'configuration') {
        await fixture.client.ticketConfig.update({ where: { id: 'config-1' }, data: { enabled: false } });
      } else {
        await fixture.client.people.update({ where: { id: 'person-1' }, data: { mergedIntoId: 'person-2' } });
      }
      const before = await fixture.state();

      await expect(fixture.transfer.apply(request, fixture.actor)).rejects.toThrow(ConflictException);
      expect(await fixture.state()).toEqual(before);
    },
  );

  it('restores the previous holder and lifecycle fields when undoing a reviewed consumption and transfer', async () => {
    const created = await fixture.transfer.apply(await reviewedRequest(), fixture.actor);
    const original = (await fixture.client.eventTicket.findMany())[0];
    const originalHistory = await fixture.client.eventTicketHistory.findMany();
    const resource = created.document?.resources[0] as ResourceOfKind<'event-ticket'>;
    fixture.document = {
      ...fixture.document,
      resources: [
        {
          ...resource,
          data: {
            ...resource.data,
            person: { id: 'person-2' },
            status: 'CONSUMED',
            consumedAt: new Date().toISOString(),
          },
        },
      ],
    };
    const preview = await fixture.transfer.preview({ document: fixture.document }, fixture.actor);
    expect(preview.summary.update).toBe(1);
    const update = await fixture.transfer.apply(
      {
        document: fixture.document,
        planHash: preview.planHash,
        allowPartial: false,
      },
      fixture.actor,
    );
    expect((await fixture.client.eventTicket.findMany())[0]).toMatchObject({
      holderPersonId: 'person-2',
      originalHolderPersonId: 'person-1',
      status: 'CONSUMED',
    });

    await fixture.transfer.undo(update.batchId ?? '', fixture.actor);
    const restored = (await fixture.client.eventTicket.findMany())[0];
    expect(restored).toEqual({ ...original, updatedAt: expect.any(Date) });
    expect(restored['updatedAt']).not.toEqual(original['updatedAt']);
    expect(await fixture.client.eventTicketHistory.findMany()).toEqual(originalHistory);
  });

  it('preserves a later consumption and history entry when undo would erase them', async () => {
    const result = await fixture.transfer.apply(await reviewedRequest(), fixture.actor);
    const ticket = (await fixture.client.eventTicket.findMany())[0];
    await fixture.client.eventTicket.update({
      where: { id: ticket['id'] },
      data: {
        status: 'CONSUMED',
        consumedAt: new Date(),
      },
    });
    await fixture.client.eventTicketHistory.create({ data: { ticketId: ticket['id'], operation: 'CONSUMED' } });
    const before = await fixture.state();

    await expect(fixture.transfer.undo(result.batchId ?? '', fixture.actor)).rejects.toThrow(ConflictException);
    expect(await fixture.state()).toEqual(before);
  });

  it.each(['permission', 'frozen'] as const)(
    'checks %s again before undoing a committed ticket import',
    async (change) => {
      const result = await fixture.transfer.apply(await reviewedRequest(), fixture.actor);
      const before = await fixture.state();
      if (change === 'permission') fixture.denied.add(Permission.Ticket.Revoke);
      else fixture.frozen.assertEventMutable.mockRejectedValue(new ForbiddenException('Frozen event'));

      await expect(fixture.transfer.undo(result.batchId ?? '', fixture.actor)).rejects.toThrow(ForbiddenException);
      expect(await fixture.state()).toEqual(before);
    },
  );
});
