import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ResourceOfKind,
  TransferDocument,
  TransferPersonDecision,
  TransferResult,
} from '@cacic-fct/shared-data-transfer';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPostgresTransferFixture,
  createPostgresTransferRuntime,
  deferred,
  postgresTransferDatabaseUrl,
  rendezvous,
  waitForDatabaseCondition,
  within,
} from './testing/postgres-transfer.fixtures';

if (process.env['DATA_TRANSFER_POSTGRES_TEST'] !== '1') {
  throw new Error('Run this suite with bun run test:data-transfer:database.');
}

describe('JSON imports with real Prisma, PostgreSQL constraints and overlapping transactions', () => {
  let prisma: PrismaService;
  let contender: PrismaService;
  let fixture: Awaited<ReturnType<typeof createPostgresTransferFixture>> | undefined;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    const databaseUrl = postgresTransferDatabaseUrl();
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = databaseUrl;
    prisma = new PrismaService();
    contender = new PrismaService();
    await Promise.all([prisma.$connect(), contender.$connect()]);
    const databases = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(databases[0].name).toBe('fct_app_data_transfer_test');
    // Fail instead of silently skipping when provisioning or migration is incomplete.
    await prisma.eventTicket.findMany({ take: 0 });
    await prisma.ticketPurchase.findMany({ take: 0 });
  });

  beforeEach(async () => {
    fixture = await createPostgresTransferFixture(prisma);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.cleanup();
    fixture = undefined;
  });
  afterAll(async () => {
    await Promise.all([prisma?.$disconnect(), contender?.$disconnect()]);
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
  });

  function scenario() {
    if (!fixture) throw new Error('Missing PostgreSQL fixture.');
    return fixture;
  }

  async function importedTicket(runtime = createPostgresTransferRuntime(prisma)) {
    const f = scenario();
    const request = await runtime.review(f.ticketDocument(), f.actor);
    const result = await runtime.transfer.apply(request, f.actor);
    const resource = result.document?.resources.find((row) => row.kind === 'event-ticket');
    if (!resource || !result.batchId) throw new Error('Expected a journaled imported ticket.');
    return { runtime, result, resource, request };
  }

  async function assertSingleCommittedImport(results: PromiseSettledResult<TransferResult>[]) {
    const f = scenario();
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(await prisma.eventTicket.count({ where: { eventId: f.eventId, holderPersonId: f.recipientPersonId } })).toBe(
      1,
    );
    expect(await prisma.eventTicketHistory.count({ where: { ticket: { eventId: f.eventId } } })).toBe(1);
    expect(await prisma.auditLogEntry.count({ where: { actorId: f.actor.sub, operation: 'IMPORT' } })).toBe(1);
    expect(await prisma.eventSubscription.count({ where: { eventId: f.eventId } })).toBe(0);
  }

  it.each(['ACTIVE', 'CONSUMED'] as const)(
    'enforces the partial holder index for an existing %s right',
    async (status) => {
      const f = scenario();
      await prisma.eventTicket.update({ where: { id: f.ticketId }, data: { status } });
      await expect(
        prisma.eventTicket.create({
          data: {
            eventId: f.eventId,
            ticketConfigId: f.ticketConfigId,
            holderPersonId: f.senderPersonId,
            source: 'ADMIN',
            expiresAt: f.ticketExpiresAt,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(await prisma.eventTicket.count({ where: { eventId: f.eventId } })).toBe(1);
    },
  );

  it('allows a revoked historical right alongside exactly one current right', async () => {
    const f = scenario();
    await prisma.eventTicket.update({ where: { id: f.ticketId }, data: { status: 'REVOKED', revokedAt: new Date() } });
    const runtime = createPostgresTransferRuntime(prisma);
    const document = f.ticketDocument(f.senderPersonId);
    const result = await runtime.transfer.apply(await runtime.review(document, f.actor), f.actor);
    expect(result.applied).toBe(true);
    expect(await prisma.eventTicket.count({ where: { eventId: f.eventId, holderPersonId: f.senderPersonId } })).toBe(2);
  });

  it('keeps source keys globally unique even for revoked tickets with a different holder', async () => {
    const f = scenario();
    const sourceKey = `${f.prefix}-source`;
    await prisma.eventTicket.update({ where: { id: f.ticketId }, data: { sourceKey, status: 'REVOKED' } });
    await expect(
      prisma.eventTicket.create({
        data: {
          eventId: f.eventId,
          ticketConfigId: f.ticketConfigId,
          holderPersonId: f.recipientPersonId,
          source: 'PURCHASE',
          sourceKey,
          expiresAt: f.ticketExpiresAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it.each(['holderPersonId', 'ticketConfigId'] as const)(
    'enforces the %s foreign key through Prisma',
    async (field) => {
      const f = scenario();
      await expect(
        prisma.eventTicket.create({
          data: {
            eventId: f.eventId,
            ticketConfigId: f.ticketConfigId,
            holderPersonId: f.recipientPersonId,
            source: 'ADMIN',
            expiresAt: f.ticketExpiresAt,
            [field]: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    },
  );

  it.each(['ticket', 'purchase', 'mixed'] as const)(
    'commits only one competing %s import for the same right on separate database connections',
    async (kind) => {
      const f = scenario();
      const first = createPostgresTransferRuntime(prisma);
      const second = createPostgresTransferRuntime(contender);
      const documents =
        kind === 'ticket'
          ? [f.ticketDocument(), f.ticketDocument()]
          : kind === 'purchase'
            ? [f.purchaseDocument(), f.purchaseDocument()]
            : [f.ticketDocument(), f.purchaseDocument()];
      const requests = await Promise.all([first.review(documents[0], f.actor), second.review(documents[1], f.actor)]);
      const meet = rendezvous(2);
      const pids = new Set<number>();
      for (const [runtime, document] of [
        [first, documents[0]],
        [second, documents[1]],
      ] as const) {
        const adapter = document.resources[0].kind === 'event-ticket' ? runtime.tickets : runtime.purchases;
        const apply = adapter.apply.bind(adapter);
        jest.spyOn(adapter, 'apply').mockImplementation(async (...args) => {
          const rows = await args[2].tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          pids.add(rows[0].pid);
          await meet();
          return apply(args[0], args[1], args[2]);
        });
      }
      const results = await Promise.allSettled([
        first.transfer.apply(requests[0], f.actor),
        second.transfer.apply(requests[1], f.actor),
      ]);
      expect(pids.size).toBe(2);
      await assertSingleCommittedImport(results);
      const winner = await prisma.eventTicket.findFirstOrThrow({
        where: { eventId: f.eventId, holderPersonId: f.recipientPersonId },
      });
      expect(await prisma.ticketPurchase.count({ where: { eventId: f.eventId } })).toBe(
        winner.source === 'PURCHASE' ? 1 : 0,
      );
    },
  );

  it.each(['id', 'key'] as const)('serializes identical %s requests with a real advisory lock', async (identity) => {
    const f = scenario();
    const first = createPostgresTransferRuntime(prisma);
    const second = createPostgresTransferRuntime(contender);
    const original = f.ticketDocument();
    const resource = original.resources[0] as ResourceOfKind<'event-ticket'>;
    const document: TransferDocument =
      identity === 'id'
        ? original
        : {
            ...original,
            resources: [{ kind: resource.kind, key: 'SHARED-LOCAL-KEY', data: resource.data }],
          };
    const request = await first.review(document, f.actor);
    const reached = deferred();
    const release = deferred();
    const enteredLock = deferred();
    const apply = first.tickets.apply.bind(first.tickets);
    const firstApply = jest.spyOn(first.tickets, 'apply').mockImplementation(async (...args) => {
      reached.resolve();
      await within(release.promise);
      return apply(...args);
    });
    const secondApply = jest.spyOn(second.tickets, 'apply');
    const lock = second.journal.lockRequest.bind(second.journal);
    let blockedPid = 0;
    jest.spyOn(second.journal, 'lockRequest').mockImplementation(async (tx, key) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      blockedPid = rows[0].pid;
      enteredLock.resolve();
      return lock(tx, key);
    });
    const firstAttempt = first.transfer.apply(request, f.actor);
    await within(reached.promise);
    const secondAttempt = second.transfer.apply(request, f.actor);
    try {
      await within(enteredLock.promise);
      await waitForDatabaseCondition(async () => {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = ${blockedPid} AND locktype = 'advisory' AND NOT granted) AS waiting`;
        return rows[0].waiting;
      });
    } finally {
      release.resolve();
    }
    const results = await Promise.all([firstAttempt, secondAttempt]);
    expect(results[0].batchId).toBe(results[1].batchId);
    expect(firstApply).toHaveBeenCalledTimes(1);
    expect(secondApply).not.toHaveBeenCalled();
    expect(await prisma.eventTicketHistory.count({ where: { ticket: { eventId: f.eventId } } })).toBe(1);
    const committed = await f.state();
    const restarted = createPostgresTransferRuntime(contender);
    expect((await restarted.transfer.apply(request, f.actor)).batchId).toBe(results[0].batchId);
    expect(await f.state()).toEqual(committed);
  });

  it('allows only one shared source key to commit even when concurrent imports target different holders', async () => {
    const f = scenario();
    const first = createPostgresTransferRuntime(prisma);
    const second = createPostgresTransferRuntime(contender);
    const sourceKey = `${f.prefix}-shared-source`;
    const document = (personId: string): TransferDocument => {
      const original = f.ticketDocument(personId);
      const resource = original.resources[0] as ResourceOfKind<'event-ticket'>;
      return { ...original, resources: [{ ...resource, data: { ...resource.data, sourceKey } }] };
    };
    const requests = await Promise.all([
      first.review(document(f.recipientPersonId), f.actor),
      second.review(document(f.otherPersonId), f.actor),
    ]);
    const meet = rendezvous(2);
    for (const runtime of [first, second]) {
      const apply = runtime.tickets.apply.bind(runtime.tickets);
      jest.spyOn(runtime.tickets, 'apply').mockImplementation(async (...args) => {
        await meet();
        return apply(...args);
      });
    }
    const outcomes = await Promise.allSettled([
      first.transfer.apply(requests[0], f.actor),
      second.transfer.apply(requests[1], f.actor),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.eventTicket.count({ where: { sourceKey } })).toBe(1);
    expect(await prisma.eventTicket.count({ where: { eventId: f.eventId } })).toBe(2);
    expect(await prisma.auditLogEntry.count({ where: { actorId: f.actor.sub, operation: 'IMPORT' } })).toBe(1);
    expect(await prisma.eventTicketHistory.count({ where: { ticket: { eventId: f.eventId } } })).toBe(1);
  });

  it('allows concurrent independent rights to commit without dropping either journal or outbox', async () => {
    const f = scenario();
    const first = createPostgresTransferRuntime(prisma);
    const second = createPostgresTransferRuntime(contender);
    const requests = await Promise.all([
      first.review(f.ticketDocument(), f.actor),
      second.review(f.ticketDocument(f.otherPersonId), f.actor),
    ]);
    const meet = rendezvous(2);
    for (const runtime of [first, second]) {
      const apply = runtime.tickets.apply.bind(runtime.tickets);
      jest.spyOn(runtime.tickets, 'apply').mockImplementation(async (...args) => {
        await meet();
        return apply(...args);
      });
    }
    const results = await Promise.all([
      first.transfer.apply(requests[0], f.actor),
      second.transfer.apply(requests[1], f.actor),
    ]);
    expect(new Set(results.map((result) => result.batchId)).size).toBe(2);
    expect(await prisma.eventTicket.count({ where: { eventId: f.eventId } })).toBe(3);
    expect(await prisma.eventTicketHistory.count({ where: { ticket: { eventId: f.eventId } } })).toBe(2);
    expect(await prisma.ticketRealtimeOutbox.count({ where: { eventId: f.eventId } })).toBe(3);
  });

  it.each(['foreign-key', 'unique-key', 'journal'] as const)(
    'rolls back all earlier ticket, history, audit and outbox writes after a late %s failure',
    async (failure) => {
      const f = scenario();
      const runtime = createPostgresTransferRuntime(prisma);
      const first = f.ticketDocument();
      const second = f.ticketDocument(f.otherPersonId);
      const document = { ...first, resources: [...first.resources, ...second.resources] };
      const request = await runtime.review(document, f.actor);
      const before = await f.state();
      if (failure === 'journal') {
        jest.spyOn(runtime.journal, 'record').mockRejectedValueOnce(new Error('Journal storage unavailable'));
      } else {
        const apply = runtime.tickets.apply.bind(runtime.tickets);
        let writes = 0;
        jest.spyOn(runtime.tickets, 'apply').mockImplementation(async (...args) => {
          const result = await apply(...args);
          writes += 1;
          if (writes === 2) {
            if (failure === 'foreign-key') {
              await args[2].tx.eventTicketHistory.create({ data: { ticketId: randomUUID(), operation: 'ISSUED' } });
            } else {
              await args[2].tx.eventTicket.create({
                data: {
                  eventId: f.eventId,
                  ticketConfigId: f.ticketConfigId,
                  holderPersonId: f.senderPersonId,
                  source: 'ADMIN',
                  expiresAt: f.ticketExpiresAt,
                },
              });
            }
          }
          return result;
        });
      }
      const attempt = runtime.transfer.apply(request, f.actor);
      if (failure === 'journal') await expect(attempt).rejects.toThrow('Journal storage unavailable');
      else await expect(attempt).rejects.toMatchObject({ code: failure === 'foreign-key' ? 'P2003' : 'P2002' });
      expect(await f.state()).toEqual(before);
    },
  );

  it.each(['create', 'merge'] as const)(
    'rolls back person %s and a paid purchase after real issuance writes fail',
    async (action) => {
      const f = scenario();
      const runtime = createPostgresTransferRuntime(prisma);
      const document = f.purchaseDocument();
      const resource = document.resources[0] as ResourceOfKind<'ticket-purchase'>;
      const person = {
        name: action === 'create' ? 'New Imported Person' : 'Riley Recipient',
        email: `${f.prefix}-new@example.test`,
      };
      const input: TransferDocument = { ...document, resources: [{ ...resource, data: { ...resource.data, person } }] };
      const pending = await runtime.transfer.preview({ document: input }, f.actor);
      const prompt = pending.personPrompts?.[0];
      if (!prompt) throw new Error('Expected person creation review.');
      const choice = { key: prompt.key, data: person, reviewHash: prompt.reviewHash };
      const personDecisions: TransferPersonDecision[] = [
        action === 'create' ? { ...choice, action } : { ...choice, action, personId: f.recipientPersonId },
      ];
      const preview = await runtime.transfer.preview({ document: input, personDecisions }, f.actor);
      expect(preview.canApply).toBe(true);
      const request = { document: input, personDecisions, planHash: preview.planHash, allowPartial: false };
      const before = await f.state();
      const issue = runtime.issuance.issueForPerson.bind(runtime.issuance);
      jest.spyOn(runtime.issuance, 'issueForPerson').mockImplementationOnce(async (...args) => {
        await issue(...args);
        throw new Error('Failure after ticket issuance');
      });
      await expect(runtime.transfer.apply(request, f.actor)).rejects.toThrow('Failure after ticket issuance');
      expect(await f.state()).toEqual(before);
      const applied = await runtime.transfer.apply(request, f.actor);
      expect(await prisma.ticketPurchase.count({ where: { eventId: f.eventId } })).toBe(1);
      await runtime.transfer.undo(applied.batchId ?? '', f.actor);
      expect(await prisma.people.findMany({ where: { email: person.email } })).toEqual([]);
      expect((await prisma.people.findUniqueOrThrow({ where: { id: f.recipientPersonId } })).secondaryEmails).toEqual(
        [],
      );
      expect(await prisma.ticketPurchase.findMany({ where: { eventId: f.eventId } })).toEqual([]);
    },
  );

  it.each(['consumed', 'revoked', 'transferred', 'history', 'pending-transfer'] as const)(
    'preserves later %s data and the entire batch when undo is unsafe',
    async (change) => {
      const f = scenario();
      const { runtime, result, resource } = await importedTicket();
      if (change === 'consumed') {
        await contender.$transaction((tx) => runtime.issuance.consumeForAttendance(tx, f.eventId, f.recipientPersonId));
      } else if (change === 'revoked') {
        await contender.eventTicket.update({
          where: { id: resource.id },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      } else if (change === 'transferred') {
        await contender.eventTicket.update({ where: { id: resource.id }, data: { holderPersonId: f.otherPersonId } });
      } else if (change === 'history') {
        await contender.eventTicketHistory.create({ data: { ticketId: resource.id, operation: 'TRANSFER_REQUESTED' } });
      } else {
        await contender.ticketTransfer.create({
          data: {
            ticketId: resource.id,
            eventId: f.eventId,
            senderPersonId: f.recipientPersonId,
            authorUserId: f.recipientUserId,
          },
        });
        await expect(contender.eventTicket.delete({ where: { id: resource.id } })).rejects.toMatchObject({
          code: 'P2003',
        });
      }
      const before = await f.state();
      await expect(runtime.transfer.undo(result.batchId ?? '', f.actor)).rejects.toThrow(ConflictException);
      expect(await f.state()).toEqual(before);
    },
  );

  it('restores the original holder, dates and lifecycle when undoing an update to an existing ticket', async () => {
    const f = scenario();
    const runtime = createPostgresTransferRuntime(prisma);
    const original = await prisma.eventTicket.findUniqueOrThrow({ where: { id: f.ticketId } });
    const document = f.ticketDocument(f.recipientPersonId, f.ticketId);
    const resource = document.resources[0] as ResourceOfKind<'event-ticket'>;
    const update: TransferDocument = {
      ...document,
      resources: [
        {
          ...resource,
          data: {
            ...resource.data,
            issuedAt: original.issuedAt.toISOString(),
            status: 'CONSUMED',
            consumedAt: new Date().toISOString(),
          },
        },
      ],
    };
    const request = await runtime.review(update, f.actor);
    const applied = await runtime.transfer.apply(request, f.actor);
    expect(await prisma.eventTicket.findUnique({ where: { id: f.ticketId } })).toMatchObject({
      holderPersonId: f.recipientPersonId,
      originalHolderPersonId: f.senderPersonId,
      status: 'CONSUMED',
    });
    await runtime.transfer.undo(applied.batchId ?? '', f.actor);
    expect(await prisma.eventTicket.findUnique({ where: { id: f.ticketId } })).toEqual({
      ...original,
      updatedAt: expect.any(Date),
    });
    expect(await prisma.eventTicketHistory.count({ where: { ticketId: f.ticketId } })).toBe(0);
    await expect(runtime.transfer.apply(request, f.actor)).rejects.toThrow(ConflictException);
  });

  it('preserves both an imported purchase and its consumed right when undo would remove paid entitlement history', async () => {
    const f = scenario();
    const runtime = createPostgresTransferRuntime(prisma);
    const request = await runtime.review(f.purchaseDocument(), f.actor);
    const applied = await runtime.transfer.apply(request, f.actor);
    const consumed = await contender.$transaction((tx) =>
      runtime.issuance.consumeForAttendance(tx, f.eventId, f.recipientPersonId),
    );
    expect(consumed).toBe(true);
    const before = await f.state();
    await expect(runtime.transfer.undo(applied.batchId ?? '', f.actor)).rejects.toThrow(ConflictException);
    expect(await f.state()).toEqual(before);
    expect(await prisma.ticketPurchase.count({ where: { eventId: f.eventId, status: 'APPROVED' } })).toBe(1);
  });

  it('rolls back an undo that already deleted another ticket before discovering a later expiry edit', async () => {
    const f = scenario();
    const runtime = createPostgresTransferRuntime(prisma);
    const first = f.ticketDocument();
    const second = f.ticketDocument(f.otherPersonId);
    const document = { ...first, resources: [...first.resources, ...second.resources] };
    const result = await runtime.transfer.apply(await runtime.review(document, f.actor), f.actor);
    const changed = await contender.eventTicket.findFirstOrThrow({
      where: { eventId: f.eventId, holderPersonId: f.recipientPersonId },
    });
    await contender.eventTicket.update({
      where: { id: changed.id },
      data: {
        expiresAt: new Date(f.ticketExpiresAt.getTime() + 60_000),
      },
    });
    const deletedIds: string[] = [];
    const instrumented = prisma.$extends({
      query: {
        eventTicket: {
          deleteMany: async ({ args, query }) => {
            const deleted = await query(args);
            if (deleted.count > 0 && typeof args.where?.id === 'string') deletedIds.push(args.where.id);
            return deleted;
          },
        },
      },
    });
    const undoRuntime = createPostgresTransferRuntime(instrumented as unknown as PrismaService);
    const before = await f.state();
    await expect(undoRuntime.transfer.undo(result.batchId ?? '', f.actor)).rejects.toThrow(ConflictException);
    expect(deletedIds).toEqual([second.resources[0].id]);
    expect(await f.state()).toEqual(before);
  });

  it('lets only one concurrent undo commit and refuses to replay the removed right', async () => {
    const f = scenario();
    const { runtime, result, request } = await importedTicket();
    const second = createPostgresTransferRuntime(contender);
    const outcomes = await Promise.allSettled([
      runtime.transfer.undo(result.batchId ?? '', f.actor),
      second.transfer.undo(result.batchId ?? '', f.actor),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejection?.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.eventTicket.count({ where: { eventId: f.eventId } })).toBe(1);
    expect(await prisma.eventTicketHistory.count({ where: { ticket: { eventId: f.eventId } } })).toBe(0);
    const undone = await f.state();
    await expect(runtime.transfer.apply(request, f.actor)).rejects.toThrow(ConflictException);
    expect(await f.state()).toEqual(undone);
  });

  it('preserves a consumption committed while undo is paused before deleting the ticket', async () => {
    const f = scenario();
    const { runtime, result, resource } = await importedTicket();
    const reached = deferred();
    const release = deferred();
    let paused = false;
    const instrumented = prisma.$extends({
      query: {
        eventTicket: {
          deleteMany: async ({ args, query }) => {
            if (!paused && args.where?.id === resource.id) {
              paused = true;
              reached.resolve();
              await within(release.promise);
            }
            return query(args);
          },
        },
      },
    });
    const undoRuntime = createPostgresTransferRuntime(instrumented as unknown as PrismaService);
    const undoAttempt = undoRuntime.transfer.undo(result.batchId ?? '', f.actor);
    // Observe the rejection immediately, even if another assertion fails while undo is waiting.
    const outcome = Promise.allSettled([undoAttempt]);
    try {
      await within(reached.promise);
      const consumed = await contender.$transaction((tx) =>
        runtime.issuance.consumeForAttendance(tx, f.eventId, f.recipientPersonId),
      );
      expect(consumed).toBe(true);
    } finally {
      release.resolve();
    }
    const [attempt] = await outcome;
    expect(attempt.status).toBe('rejected');
    if (attempt.status === 'rejected') expect(attempt.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.eventTicket.findUnique({ where: { id: resource.id } })).toMatchObject({ status: 'CONSUMED' });
    expect(await prisma.eventTicketHistory.count({ where: { ticketId: resource.id } })).toBe(2);
    expect((await prisma.auditLogEntry.findUniqueOrThrow({ where: { id: result.batchId } })).revertedAt).toBeNull();
  });
});
