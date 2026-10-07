import { FrozenResourceService } from '../common/frozen-resource.service';
import { ConflictException, GoneException } from '@nestjs/common';
import { EventTicketIssueSource, TicketHistoryOperation } from '@prisma/client';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { TicketSubscriptionSyncService } from '../events/ticket-subscription-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketNotificationOutboxService } from './ticket-notification-outbox.service';
import { TicketTransferRetentionService } from './ticket-transfer-retention.service';
import { TicketTransferResolutionService } from './ticket-transfer-resolution.service';
import { TicketTransferService } from './ticket-transfer.service';
import { TicketEligibilityService } from './ticket-eligibility.service';
import { TicketIssuanceService } from './ticket-issuance.service';
import { TicketRealtimeService } from './ticket-realtime.service';
import { TicketsResolver } from './tickets.resolver';
import { SportsIdentityProtectionService } from '../sports/security/sports-identity-protection.service';
import {
  clearTicketingDatabaseFixture,
  createTicketingDatabaseFixture,
} from './testing/ticketing-database-fixtures';
import type { TicketingDatabaseFixture } from './testing/ticketing-database-fixtures';

const describePostgres = process.env['TICKETING_POSTGRES_INTEGRATION_TEST'] === '1' ? describe : describe.skip;

describePostgres('ticketing with isolated PostgreSQL and real services', () => {
  let prisma: PrismaService;
  let previousDatabaseUrl: string | undefined;
  const fixtures: TicketingDatabaseFixture[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env['TICKETING_TEST_DATABASE_URL'];
    if (!databaseUrl) throw new Error('Set TICKETING_TEST_DATABASE_URL to the disposable fct_app_ticketing_test database.');
    assertDedicatedTestDatabase(databaseUrl);
    previousDatabaseUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = databaseUrl;

    prisma = new PrismaService();
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1 FROM "event_tickets" LIMIT 0`;
  });

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop();
      if (fixture) await clearTicketingDatabaseFixture(prisma, fixture);
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousDatabaseUrl;
  });

  it('resolves transfer identity asynchronously and preserves privacy through acceptance', async () => {
    const fixture = await createFixture();
    const runtime = createTransferRuntime(prisma);
    const authorContext = { req: { user: { sub: fixture.senderUserId } } } as never;
    const recipientContext = { req: { user: { sub: fixture.recipientUserId } } } as never;

    const started = await runtime.resolver.startTicketTransfer(
      fixture.ticketId,
      fixture.recipientDocument,
      authorContext,
    );
    expect(started).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      recipient: null,
      submittedDestinationIdentityDocument: fixture.recipientDocument,
    }));
    expect(started.ticket.aztecPayload).toBeNull();
    expect(JSON.stringify(started)).not.toContain(fixture.recipientUserId);
    expect(JSON.stringify(started)).not.toContain(fixture.recipientPersonId);

    await invokePrivate(runtime.resolution, 'processPending');

    const authorView = await runtime.resolver.ticketTransfer(started.id, authorContext);
    const recipientView = await runtime.resolver.ticketTransfer(started.id, recipientContext);
    expect(authorView).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      recipient: null,
      submittedDestinationIdentityDocument: fixture.recipientDocument,
    }));
    expect(authorView?.ticket.aztecPayload).toBeNull();
    expect(recipientView).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      sender: expect.objectContaining({ personId: fixture.senderPersonId }),
      recipient: expect.objectContaining({ personId: fixture.recipientPersonId }),
      submittedDestinationIdentityDocument: null,
    }));
    expect(recipientView?.ticket.aztecPayload).toBeNull();
    expect(JSON.stringify(authorView)).not.toContain(fixture.recipientUserId);

    const accepted = await runtime.resolver.acceptTicketTransfer(started.id, recipientContext);
    const savedTransfer = await prisma.ticketTransfer.findUniqueOrThrow({ where: { id: started.id } });
    const savedTicket = await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } });
    const history = await prisma.eventTicketHistory.findMany({
      where: { transferId: started.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(accepted).toEqual(expect.objectContaining({ senderStatus: 'ACCEPTED', recipientStatus: 'ACCEPTED' }));
    expect(savedTransfer.submittedDestinationIdentityDocumentEncrypted).toBeNull();
    expect(savedTicket.holderPersonId).toBe(fixture.recipientPersonId);
    expect(history.map(({ operation }) => operation)).toEqual(expect.arrayContaining([
      TicketHistoryOperation.TRANSFER_REQUESTED,
      TicketHistoryOperation.TRANSFERRED,
      TicketHistoryOperation.TRANSFER_ACCEPTED,
    ]));

    const issuance = new TicketIssuanceService(prisma, runtime.realtime);
    await prisma.$transaction((tx) => issuance.consumeForAttendance(tx, fixture.eventId, fixture.recipientPersonId));
    const archivedWalletTicket = await runtime.resolver.myWalletTicket(fixture.ticketId, recipientContext);
    expect(archivedWalletTicket).toEqual(expect.objectContaining({
      id: fixture.ticketId,
      status: 'CONSUMED',
      aztecPayload: `ticket:${fixture.ticketId}:${fixture.recipientUserId}`,
    }));
    await expect(runtime.transfers.startForUser(
      fixture.ticketId,
      fixture.recipientDocument,
      { sub: fixture.recipientUserId } as never,
    )).rejects.toBeInstanceOf(GoneException);

    await assertNotificationRetry(prisma, started.id);
    await assertRealtimeRetry(prisma, fixture.eventId, runtime.published);
  });

  it('allows only one pending transfer and holder change under concurrency', async () => {
    const fixture = await createFixture();
    const runtime = createTransferRuntime(prisma);
    const user = { sub: fixture.senderUserId } as never;
    const attempts = await Promise.allSettled([
      runtime.transfers.startForUser(fixture.ticketId, fixture.recipientDocument, user),
      runtime.transfers.startForUser(fixture.ticketId, fixture.recipientDocument, user),
    ]);
    const starts = attempts.filter((result) => result.status === 'fulfilled');
    const startFailures = attempts.filter((result) => result.status === 'rejected');
    expect(starts).toHaveLength(1);
    expect(startFailures).toHaveLength(1);
    if (startFailures[0]?.status === 'rejected') {
      expect(startFailures[0].reason).toBeInstanceOf(ConflictException);
    }

    const transfer = await prisma.ticketTransfer.findFirstOrThrow({ where: { ticketId: fixture.ticketId } });
    expect(await prisma.ticketTransfer.count({ where: { ticketId: fixture.ticketId, senderStatus: 'PENDING' } })).toBe(1);
    expect(await prisma.ticketTransferAuthorCooldown.findUniqueOrThrow({ where: { userId: fixture.senderUserId } }))
      .toEqual(expect.objectContaining({ submissionCount: 1 }));
    await prisma.ticketTransfer.update({
      where: { id: transfer.id },
      data: { recipientPersonId: fixture.recipientPersonId, recipientUserId: fixture.recipientUserId },
    });

    const acceptances = await Promise.allSettled([
      runtime.transfers.acceptForUser(transfer.id, { sub: fixture.recipientUserId } as never),
      runtime.transfers.acceptForUser(transfer.id, { sub: fixture.recipientUserId } as never),
    ]);
    expect(acceptances.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(acceptances.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).holderPersonId)
      .toBe(fixture.recipientPersonId);
    expect(await prisma.eventTicketHistory.count({
      where: { transferId: transfer.id, operation: TicketHistoryOperation.TRANSFERRED },
    })).toBe(1);
  });

  it('issues one deterministic entitlement and redeems an active ticket at most once', async () => {
    const fixture = await createFixture();
    const { realtime } = createRealtime(prisma);
    const issuance = new TicketIssuanceService(prisma, realtime);
    const sourceKey = `event-subscription:${fixture.eventId}:${fixture.recipientPersonId}`;
    const issued = await Promise.all([
      prisma.$transaction((tx) => issuance.issueForPerson(
        tx,
        fixture.eventId,
        fixture.recipientPersonId,
        EventTicketIssueSource.EVENT_SUBSCRIPTION,
        sourceKey,
      )),
      prisma.$transaction((tx) => issuance.issueForPerson(
        tx,
        fixture.eventId,
        fixture.recipientPersonId,
        EventTicketIssueSource.EVENT_SUBSCRIPTION,
        sourceKey,
      )),
    ]);
    expect(issued[0].id).toBe(issued[1].id);
    expect(await prisma.eventTicket.count({ where: { sourceKey } })).toBe(1);

    const historicalAttendance = new Date(Date.now() - 2_000);
    await prisma.eventTicket.update({
      where: { id: fixture.ticketId },
      data: { issuedAt: new Date(historicalAttendance.getTime() + 1_000) },
    });
    await expect(prisma.$transaction((tx) => issuance.consumeForAttendance(
      tx,
      fixture.eventId,
      fixture.senderPersonId,
      { attendedAt: historicalAttendance },
    ))).resolves.toBe(false);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).status).toBe('ACTIVE');

    await prisma.eventTicket.update({
      where: { id: fixture.ticketId },
      data: { issuedAt: new Date(Date.now() - 10_000) },
    });
    const redemptions = await Promise.all([
      prisma.$transaction((tx) => issuance.consumeForAttendance(tx, fixture.eventId, fixture.senderPersonId)),
      prisma.$transaction((tx) => issuance.consumeForAttendance(tx, fixture.eventId, fixture.senderPersonId)),
    ]);
    expect(redemptions.filter(Boolean)).toHaveLength(1);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).status).toBe('CONSUMED');
    expect(await prisma.eventTicketHistory.count({
      where: { ticketId: fixture.ticketId, operation: TicketHistoryOperation.CONSUMED },
    })).toBe(1);
  });

  it('backfills pre-enablement PRESENT kit attendance at its recorded time', async () => {
    const attendedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const fixture = await createFixture({ eventEndsAt: new Date(attendedAt.getTime() + 60 * 60 * 1_000) });
    await removeSeedTicketAndDisableAutoIssue(fixture);
    await createEventSubscription(fixture, fixture.senderPersonId, new Date(attendedAt.getTime() - 60 * 60 * 1_000));
    await createPresentAttendance(fixture, fixture.senderPersonId, attendedAt);
    const config = await enableEventSubscriptionIssuance(fixture);
    const issuance = createIssuance(prisma);
    await enqueueReconciliation(fixture, config.updatedAt, issuance);

    await drainReconciliationJob(fixture, issuance);

    const sourceKey = eventSubscriptionTicketKey(fixture, fixture.senderPersonId);
    const ticket = await prisma.eventTicket.findUniqueOrThrow({ where: { sourceKey } });
    expect(ticket).toEqual(expect.objectContaining({
      status: 'CONSUMED',
      issuedAt: attendedAt,
      consumedAt: attendedAt,
      consumedByPersonId: fixture.senderPersonId,
    }));
    expect(await prisma.eventTicket.count({
      where: { eventId: fixture.eventId, holderPersonId: fixture.senderPersonId, status: 'ACTIVE' },
    })).toBe(0);
    expect(await prisma.eventTicketHistory.findMany({ where: { ticketId: ticket.id }, select: { operation: true } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ operation: TicketHistoryOperation.ISSUED }),
        expect.objectContaining({ operation: TicketHistoryOperation.CONSUMED }),
      ]));

    const scanAudit = await prisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: 'TICKET', entityId: ticket.id, operation: 'SCAN' },
      select: { createdAt: true, metadata: true },
    });
    const metadata = JSON.parse(JSON.stringify(scanAudit.metadata)) as Record<string, unknown>;
    expect(metadata['attendedAt']).toBe(attendedAt.toISOString());
    expect(new Date(String(metadata['processedAt'])).getTime()).toBeGreaterThanOrEqual(config.updatedAt.getTime());
    expect(scanAudit.createdAt.getTime()).toBeGreaterThanOrEqual(config.updatedAt.getTime());

    const job = await prisma.ticketEntitlementReconciliation.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    expect(job.completedAt).toBeInstanceOf(Date);
    expect(job.attempts).toBe(0);
  });

  it('consumes the pass when attendance arrives before subscription backfill', async () => {
    const fixture = await createFixture();
    await removeSeedTicketAndDisableAutoIssue(fixture);
    await createEventSubscription(fixture, fixture.senderPersonId, new Date(Date.now() - 60_000));
    const config = await enableEventSubscriptionIssuance(fixture);
    const issuance = createIssuance(prisma);
    await enqueueReconciliation(fixture, config.updatedAt, issuance);
    const attendedAt = new Date();
    await createPresentAttendance(fixture, fixture.senderPersonId, attendedAt);
    const categories = new AttendanceCategoryService(prisma, undefined, issuance);

    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.senderPersonId,
      fixture.eventId,
      tx,
      true,
    ));

    const sourceKey = eventSubscriptionTicketKey(fixture, fixture.senderPersonId);
    const ticket = await prisma.eventTicket.findUniqueOrThrow({ where: { sourceKey } });
    expect(ticket).toEqual(expect.objectContaining({
      status: 'CONSUMED',
      issuedAt: attendedAt,
      consumedAt: attendedAt,
    }));
    const attendance = await prisma.eventAttendance.findUniqueOrThrow({
      where: { personId_eventId: { personId: fixture.senderPersonId, eventId: fixture.eventId } },
    });
    expect(attendance).toEqual(expect.objectContaining({
      status: 'PRESENT',
      category: 'REGULAR',
      currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
    }));

    await drainReconciliationJob(fixture, issuance);
    expect(await prisma.eventTicket.count({ where: { eventId: fixture.eventId, holderPersonId: fixture.senderPersonId } }))
      .toBe(1);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { sourceKey } })).status).toBe('CONSUMED');
  });

  it('does not use a later admin ticket for older subscription attendance', async () => {
    const attendedAt = new Date(Date.now() - 60 * 60 * 1_000);
    const fixture = await createFixture();
    await removeSeedTicketAndDisableAutoIssue(fixture);
    await createEventSubscription(fixture, fixture.senderPersonId, new Date(attendedAt.getTime() - 60_000));
    await createPresentAttendance(fixture, fixture.senderPersonId, attendedAt);
    const config = await enableEventSubscriptionIssuance(fixture);
    const issuance = createIssuance(prisma);
    const manualTicket = await prisma.$transaction((tx) => issuance.issueForPerson(
      tx,
      fixture.eventId,
      fixture.senderPersonId,
      EventTicketIssueSource.ADMIN,
      `admin:${fixture.eventId}:${fixture.senderPersonId}`,
    ));
    await enqueueReconciliation(fixture, config.updatedAt, issuance);

    await drainReconciliationJob(fixture, issuance);

    const savedManualTicket = await prisma.eventTicket.findUniqueOrThrow({ where: { id: manualTicket.id } });
    expect(savedManualTicket).toEqual(expect.objectContaining({
      source: EventTicketIssueSource.ADMIN,
      status: 'ACTIVE',
      consumedAt: null,
    }));
    expect(savedManualTicket.issuedAt.getTime()).toBeGreaterThan(attendedAt.getTime());
    expect(await prisma.eventTicket.findUnique({ where: { sourceKey: eventSubscriptionTicketKey(fixture, fixture.senderPersonId) } }))
      .toBeNull();
    expect(await prisma.eventTicketHistory.count({
      where: { ticketId: manualTicket.id, operation: TicketHistoryOperation.CONSUMED },
    })).toBe(0);
  });

  it('keeps a later-received ticket active until its holder attends', async () => {
    const fixture = await createFixture();
    const acceptedAt = new Date(Date.now() - 60_000);
    const attendedAt = new Date(acceptedAt.getTime() - 60_000);
    const issuedAt = new Date(attendedAt.getTime() - 60_000);
    await createPresentAttendance(fixture, fixture.recipientPersonId, attendedAt);
    const transfer = await prisma.$transaction(async (tx) => {
      await tx.eventTicket.update({
        where: { id: fixture.ticketId },
        data: { holderPersonId: fixture.recipientPersonId, issuedAt },
      });
      const accepted = await tx.ticketTransfer.create({
        data: {
          ticketId: fixture.ticketId,
          eventId: fixture.eventId,
          senderPersonId: fixture.senderPersonId,
          senderUserId: fixture.senderUserId,
          recipientPersonId: fixture.recipientPersonId,
          recipientUserId: fixture.recipientUserId,
          authorUserId: fixture.senderUserId,
          initiatorType: 'HOLDER',
          senderStatus: 'ACCEPTED',
          recipientStatus: 'ACCEPTED',
          createdAt: new Date(acceptedAt.getTime() - 30_000),
          acceptedAt,
        },
      });
      await tx.eventTicketHistory.createMany({
        data: [
          {
            ticketId: fixture.ticketId,
            transferId: accepted.id,
            operation: TicketHistoryOperation.TRANSFERRED,
            previousHolderPersonId: fixture.senderPersonId,
            newHolderPersonId: fixture.recipientPersonId,
            actorUserId: fixture.recipientUserId,
          },
          {
            ticketId: fixture.ticketId,
            transferId: accepted.id,
            operation: TicketHistoryOperation.TRANSFER_ACCEPTED,
            previousHolderPersonId: fixture.senderPersonId,
            newHolderPersonId: fixture.recipientPersonId,
            actorUserId: fixture.recipientUserId,
          },
        ],
      });
      return accepted;
    });
    expect(transfer.acceptedAt?.getTime()).toBeGreaterThan(attendedAt.getTime());

    const issuance = createIssuance(prisma);
    const categories = new AttendanceCategoryService(prisma, undefined, issuance);
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.recipientPersonId,
      fixture.eventId,
      tx,
      true,
    ));

    const historicalAttendance = await prisma.eventAttendance.findUniqueOrThrow({
      where: { personId_eventId: { personId: fixture.recipientPersonId, eventId: fixture.eventId } },
    });
    const ticketBeforeCurrentAttendance = await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } });
    expect(historicalAttendance).toEqual(expect.objectContaining({
      category: 'NON_REGULAR',
      currentAssessment: 'TICKET_REQUIRED',
    }));
    expect(ticketBeforeCurrentAttendance).toEqual(expect.objectContaining({
      holderPersonId: fixture.recipientPersonId,
      status: 'ACTIVE',
      issuedAt,
    }));

    const currentAttendedAt = new Date();
    await prisma.eventAttendance.update({
      where: { personId_eventId: { personId: fixture.recipientPersonId, eventId: fixture.eventId } },
      data: { attendedAt: currentAttendedAt },
    });
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.recipientPersonId,
      fixture.eventId,
      tx,
      true,
    ));
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.recipientPersonId,
      fixture.eventId,
      tx,
      true,
    ));

    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).status).toBe('CONSUMED');
    expect(await prisma.eventTicketHistory.count({
      where: { ticketId: fixture.ticketId, operation: TicketHistoryOperation.CONSUMED },
    })).toBe(1);
    expect(await prisma.eventAttendance.findUniqueOrThrow({
      where: { personId_eventId: { personId: fixture.recipientPersonId, eventId: fixture.eventId } },
    })).toEqual(expect.objectContaining({
      category: 'REGULAR',
      currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
    }));
  });

  it('does not backdate a reactivated subscription ticket across historical attendance', async () => {
    const fixture = await createFixture();
    const { issuance, subscription, ticket } = await issueAutomaticEventSubscriptionTicket(
      fixture,
      fixture.senderPersonId,
    );
    const attendedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const originalIssuedAt = new Date(attendedAt.getTime() - 60 * 60 * 1_000);
    const featureEnabledAt = new Date(attendedAt.getTime() - 60 * 60 * 1_000);
    await prisma.ticketConfig.update({
      where: { id: fixture.ticketConfigId },
      data: { createdAt: featureEnabledAt, updatedAt: featureEnabledAt },
    });
    await prisma.eventSubscription.update({
      where: { id: subscription.id },
      data: { createdAt: featureEnabledAt },
    });
    await prisma.eventTicket.update({ where: { id: ticket.id }, data: { issuedAt: originalIssuedAt } });
    await createPresentAttendance(fixture, fixture.senderPersonId, attendedAt);
    const categories = new AttendanceCategoryService(prisma, undefined, issuance);

    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.senderPersonId,
      fixture.eventId,
      tx,
    ));
    await prisma.eventSubscription.update({ where: { id: subscription.id }, data: { deletedAt: new Date() } });
    await syncAutomaticEventSource(issuance, fixture, fixture.senderPersonId);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('REVOKED');
    await prisma.eventSubscription.update({ where: { id: subscription.id }, data: { deletedAt: null } });
    await syncAutomaticEventSource(issuance, fixture, fixture.senderPersonId);

    const reactivatedTicket = await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(reactivatedTicket.status).toBe('ACTIVE');
    expect(reactivatedTicket.issuedAt.getTime()).toBeGreaterThan(attendedAt.getTime());
    const reactivationAudit = await prisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: 'TICKET', entityId: ticket.id, operation: 'REISSUE' },
    });
    expect(reactivationAudit).toEqual(expect.objectContaining({
      before: expect.objectContaining({ issuedAt: originalIssuedAt.toISOString() }),
      after: expect.objectContaining({ issuedAt: reactivatedTicket.issuedAt.toISOString() }),
    }));
    expect(await prisma.eventTicketHistory.count({
      where: { ticketId: ticket.id, operation: TicketHistoryOperation.ISSUED },
    })).toBe(2);
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.senderPersonId,
      fixture.eventId,
      tx,
      true,
    ));

    const oldAttendance = await prisma.eventAttendance.findUniqueOrThrow({
      where: { personId_eventId: { personId: fixture.senderPersonId, eventId: fixture.eventId } },
    });
    expect(oldAttendance).toEqual(expect.objectContaining({
      category: 'NON_REGULAR',
      currentAssessment: 'TICKET_REQUIRED',
    }));
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('ACTIVE');

    const currentAttendedAt = new Date();
    await prisma.eventAttendance.update({
      where: { personId_eventId: { personId: fixture.senderPersonId, eventId: fixture.eventId } },
      data: { attendedAt: currentAttendedAt },
    });
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.senderPersonId,
      fixture.eventId,
      tx,
      true,
    ));
    await prisma.$transaction((tx) => categories.refreshForAttendance(
      fixture.senderPersonId,
      fixture.eventId,
      tx,
      true,
    ));
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('CONSUMED');
    expect(await prisma.eventTicketHistory.count({
      where: { ticketId: ticket.id, operation: TicketHistoryOperation.CONSUMED },
    })).toBe(1);
  });

  it('does not consume an older pass on a later subscription refresh', async () => {
    const fixture = await createFixture();
    await removeSeedTicketAndDisableAutoIssue(fixture);
    const config = await enableEventSubscriptionIssuance(fixture);
    const attendedAt = new Date();
    await createPresentAttendance(fixture, fixture.senderPersonId, attendedAt);
    const subscription = await createEventSubscription(
      fixture,
      fixture.senderPersonId,
      new Date(attendedAt.getTime() + 1),
    );
    const issuance = createIssuance(prisma);
    const subscriptionSync = new TicketSubscriptionSyncService(issuance);

    await prisma.$transaction((tx) => subscriptionSync.forEvent(tx, fixture.eventId, fixture.senderPersonId));
    const issuedTicket = await prisma.eventTicket.findUniqueOrThrow({
      where: { sourceKey: eventSubscriptionTicketKey(fixture, fixture.senderPersonId) },
    });
    await prisma.eventTicket.update({ where: { id: issuedTicket.id }, data: { issuedAt: subscription.createdAt } });
    await prisma.$transaction((tx) => new AttendanceCategoryService(prisma, undefined, issuance)
      .refreshForAttendance(fixture.senderPersonId, fixture.eventId, tx));

    const sourceKey = eventSubscriptionTicketKey(fixture, fixture.senderPersonId);
    const ticket = await prisma.eventTicket.findUniqueOrThrow({ where: { sourceKey } });
    expect(ticket.status).toBe('ACTIVE');
    expect(ticket.issuedAt.getTime()).toBeGreaterThan(attendedAt.getTime());
    expect(ticket.consumedAt).toBeNull();
    const attendance = await prisma.eventAttendance.findUniqueOrThrow({
      where: { personId_eventId: { personId: fixture.senderPersonId, eventId: fixture.eventId } },
    });
    expect(attendance).toEqual(expect.objectContaining({
      category: 'NON_REGULAR',
      currentAssessment: 'TICKET_REQUIRED',
    }));
    expect(config.updatedAt.getTime()).toBeLessThanOrEqual(attendedAt.getTime());
  });

  it('revokes a canceled source and never remints an automatic right after transfer history', async () => {
    const canceledFixture = await createFixture();
    const canceled = await issueAutomaticEventSubscriptionTicket(canceledFixture, canceledFixture.senderPersonId);
    await prisma.eventSubscription.update({ where: { id: canceled.subscription.id }, data: { deletedAt: new Date() } });
    await syncAutomaticEventSource(canceled.issuance, canceledFixture, canceledFixture.senderPersonId);
    expect((await prisma.eventTicket.findUniqueOrThrow({ where: { id: canceled.ticket.id } })).status).toBe('REVOKED');

    const transferredFixture = await createFixture();
    const transferred = await issueAutomaticEventSubscriptionTicket(
      transferredFixture,
      transferredFixture.senderPersonId,
    );
    await prisma.eventTicket.update({
      where: { id: transferred.ticket.id },
      data: { holderPersonId: transferredFixture.recipientPersonId },
    });
    await prisma.eventTicketHistory.create({
      data: {
        ticketId: transferred.ticket.id,
        operation: TicketHistoryOperation.TRANSFERRED,
        previousHolderPersonId: transferredFixture.senderPersonId,
        newHolderPersonId: transferredFixture.recipientPersonId,
      },
    });
    await prisma.eventSubscription.update({ where: { id: transferred.subscription.id }, data: { deletedAt: new Date() } });
    await syncAutomaticEventSource(transferred.issuance, transferredFixture, transferredFixture.senderPersonId);

    expect(await prisma.eventTicket.count({
      where: {
        eventId: transferredFixture.eventId,
        holderPersonId: transferredFixture.senderPersonId,
        status: { in: ['ACTIVE', 'CONSUMED'] },
      },
    })).toBe(0);
    expect(await prisma.eventTicket.findUniqueOrThrow({ where: { id: transferred.ticket.id } }))
      .toEqual(expect.objectContaining({ holderPersonId: transferredFixture.recipientPersonId, status: 'ACTIVE' }));
    expect(await prisma.eventTicket.count({ where: { eventId: transferredFixture.eventId } })).toBe(1);
  });

  it('completes a backfill for an expired event when no historical PRESENT redemption exists', async () => {
    const fixture = await createFixture({ eventEndsAt: new Date(Date.now() - 60 * 60 * 1_000) });
    await removeSeedTicketAndDisableAutoIssue(fixture);
    await createEventSubscription(fixture, fixture.senderPersonId, new Date(Date.now() - 2 * 60 * 60 * 1_000));
    const config = await enableEventSubscriptionIssuance(fixture);
    const issuance = createIssuance(prisma);
    await enqueueReconciliation(fixture, config.updatedAt, issuance);

    await drainReconciliationJob(fixture, issuance);

    const job = await prisma.ticketEntitlementReconciliation.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    expect(job.completedAt).toBeInstanceOf(Date);
    expect(job.attempts).toBe(0);
    expect(await prisma.eventTicket.count({ where: { eventId: fixture.eventId } })).toBe(0);
  });

  it('clears terminal transfer identity data after 30 days while leaving open requests intact', async () => {
    const fixture = await createFixture({ eventEndsAt: new Date(Date.now() - 31 * DAY_MS) });
    const terminal = await prisma.ticketTransfer.create({
      data: {
        ticketId: fixture.ticketId,
        eventId: fixture.eventId,
        senderPersonId: fixture.senderPersonId,
        senderUserId: fixture.senderUserId,
        authorUserId: fixture.senderUserId,
        initiatorType: 'HOLDER',
        submittedDestinationIdentityDocumentEncrypted: 'terminal-encrypted-document',
        senderStatus: 'ACCEPTED',
        recipientStatus: 'ACCEPTED',
      },
    });
    const pending = await prisma.ticketTransfer.create({
      data: {
        ticketId: fixture.ticketId,
        eventId: fixture.eventId,
        senderPersonId: fixture.senderPersonId,
        senderUserId: fixture.senderUserId,
        authorUserId: fixture.senderUserId,
        initiatorType: 'HOLDER',
        submittedDestinationIdentityDocumentEncrypted: 'pending-encrypted-document',
        senderStatus: 'PENDING',
        recipientStatus: 'PENDING',
      },
    });

    const retention = new TicketTransferRetentionService(prisma);
    await invokePrivate(retention, 'clearExpiredDocuments');

    await expect(prisma.ticketTransfer.findUniqueOrThrow({ where: { id: terminal.id } }))
      .resolves.toEqual(expect.objectContaining({ submittedDestinationIdentityDocumentEncrypted: null }));
    await expect(prisma.ticketTransfer.findUniqueOrThrow({ where: { id: pending.id } }))
      .resolves.toEqual(expect.objectContaining({ submittedDestinationIdentityDocumentEncrypted: 'pending-encrypted-document' }));
  });

  async function createFixture(options: { eventEndsAt?: Date } = {}): Promise<TicketingDatabaseFixture> {
    const fixture = await createTicketingDatabaseFixture(prisma, options);
    fixtures.push(fixture);
    return fixture;
  }

  async function removeSeedTicketAndDisableAutoIssue(fixture: TicketingDatabaseFixture): Promise<void> {
    await prisma.eventTicket.deleteMany({ where: { eventId: fixture.eventId } });
    await prisma.ticketConfig.update({
      where: { id: fixture.ticketConfigId },
      data: { enabled: false, issueOnEventSubscription: false, issueOnMajorEventSubscription: false },
    });
  }

  async function enableEventSubscriptionIssuance(fixture: TicketingDatabaseFixture) {
    return prisma.ticketConfig.update({
      where: { id: fixture.ticketConfigId },
      data: { enabled: true, issueOnEventSubscription: true },
    });
  }

  async function createEventSubscription(fixture: TicketingDatabaseFixture, personId: string, createdAt: Date) {
    return prisma.eventSubscription.create({ data: { eventId: fixture.eventId, personId, createdAt } });
  }

  async function createPresentAttendance(
    fixture: TicketingDatabaseFixture,
    personId: string,
    attendedAt: Date,
  ): Promise<void> {
    await prisma.eventAttendance.create({
      data: {
        eventId: fixture.eventId,
        personId,
        status: 'PRESENT',
        attendedAt,
        createdAt: attendedAt,
        createdByMethod: 'SCANNER',
        createdById: fixture.senderUserId,
        committedById: fixture.senderUserId,
      },
    });
  }

  function createIssuance(database: PrismaService): TicketIssuanceService {
    const { realtime } = createRealtime(database);
    return new TicketIssuanceService(database, realtime);
  }

  async function enqueueReconciliation(
    fixture: TicketingDatabaseFixture,
    effectiveAt: Date,
    issuance: TicketIssuanceService,
  ): Promise<void> {
    await prisma.$transaction((tx) => issuance.enqueueExistingSubscriptionReconciliation(tx, fixture.eventId, effectiveAt));
  }

  async function drainReconciliationJob(
    fixture: TicketingDatabaseFixture,
    issuance: TicketIssuanceService,
  ): Promise<void> {
    const maxSteps = 4;
    let lastState: string | null = null;
    for (let step = 0; step < maxSteps; step++) {
      const before = await prisma.ticketEntitlementReconciliation.findFirstOrThrow({ where: { eventId: fixture.eventId } });
      if (before.completedAt) return;
      const state = `${before.phase}:${before.cursor ?? ''}`;
      if (state === lastState) throw new Error(`Ticket reconciliation made no phase or cursor progress (${state}).`);
      lastState = state;

      await invokePrivate(issuance, 'processReconciliationJobs');

      const after = await prisma.ticketEntitlementReconciliation.findUniqueOrThrow({ where: { id: before.id } });
      if (after.completedAt) return;
      if (after.attempts !== before.attempts) {
        throw new Error(`Ticket reconciliation deferred after ${after.attempts} attempt(s).`);
      }
      if (`${after.phase}:${after.cursor ?? ''}` === state) {
        throw new Error(`Ticket reconciliation did not advance from ${state}.`);
      }
      const madeDue = await prisma.ticketEntitlementReconciliation.updateMany({
        where: {
          id: after.id,
          completedAt: null,
          attempts: after.attempts,
          phase: after.phase,
          cursor: after.cursor,
        },
        data: { nextAttemptAt: new Date() },
      });
      if (madeDue.count !== 1) throw new Error('Ticket reconciliation changed while the test drained its next phase.');
    }
    throw new Error(`Ticket reconciliation did not complete within ${maxSteps} phase/page steps.`);
  }

  async function issueAutomaticEventSubscriptionTicket(
    fixture: TicketingDatabaseFixture,
    personId: string,
  ) {
    await removeSeedTicketAndDisableAutoIssue(fixture);
    const subscription = await createEventSubscription(fixture, personId, new Date(Date.now() - 60_000));
    await enableEventSubscriptionIssuance(fixture);
    const issuance = createIssuance(prisma);
    await syncAutomaticEventSource(issuance, fixture, personId);
    const ticket = await prisma.eventTicket.findUniqueOrThrow({
      where: { sourceKey: eventSubscriptionTicketKey(fixture, personId) },
    });
    return { issuance, subscription, ticket };
  }

  async function syncAutomaticEventSource(
    issuance: TicketIssuanceService,
    fixture: TicketingDatabaseFixture,
    personId: string,
  ): Promise<void> {
    await prisma.$transaction((tx) => issuance.syncForPerson(
      tx,
      fixture.eventId,
      personId,
      EventTicketIssueSource.EVENT_SUBSCRIPTION,
      eventSubscriptionTicketKey(fixture, personId),
    ));
  }
});

function createTransferRuntime(prisma: PrismaService) {
  const { realtime, published } = createRealtime(prisma);
  const identities = new SportsIdentityProtectionService({
    get: jest.fn((key: string) => key === 'SPORTS_IDENTITY_SECRET' ? 'ticketing-integration-secret' : 'test'),
  } as never);
  const eligibility = new TicketEligibilityService(prisma, {} as never);
  const transfers = new TicketTransferService(prisma, identities, eligibility, realtime, new FrozenResourceService(prisma));
  const resolution = new TicketTransferResolutionService(prisma, identities, eligibility, realtime);
  const issuance = new TicketIssuanceService(prisma, realtime);
  const resolver = new TicketsResolver(prisma, {} as never, {} as never, issuance, eligibility, transfers, realtime,
    new FrozenResourceService(prisma),
  );
  return { realtime, published, transfers, resolution, resolver };
}

function createRealtime(prisma: PrismaService) {
  const published = jest.fn(async () => undefined);
  const invalidations = {
    scope: jest.fn((channel: string, ...parts: string[]) => `${channel}:${parts.join(':')}`),
    publish: published,
  };
  const realtime = new TicketRealtimeService(prisma, invalidations as never);
  return { realtime, published };
}

async function assertNotificationRetry(prisma: PrismaService, transferId: string): Promise<void> {
  const transport = { notifyTicketTransfer: jest.fn().mockResolvedValue(false) };
  const service = new TicketNotificationOutboxService(prisma, transport as never);
  await invokePrivate(service, 'processPending');
  const failed = await prisma.ticketNotificationOutbox.findMany({ where: { transferId }, orderBy: { id: 'asc' } });
  expect(failed.length).toBeGreaterThan(0);
  expect(failed.every((item) => item.attempts === 1 && item.sentAt === null && item.leaseUntil === null))
    .toBe(true);

  await prisma.ticketNotificationOutbox.updateMany({ where: { transferId }, data: { nextAttemptAt: new Date(0) } });
  transport.notifyTicketTransfer.mockResolvedValue(true);
  await invokePrivate(service, 'processPending');
  const delivered = await prisma.ticketNotificationOutbox.findMany({ where: { transferId } });
  expect(delivered.every((item) => item.sentAt instanceof Date && item.leaseUntil === null && item.lastError === null))
    .toBe(true);
}

async function assertRealtimeRetry(
  prisma: PrismaService,
  eventId: string,
  publish: jest.Mock,
): Promise<void> {
  publish.mockRejectedValueOnce(new Error('Replay store temporarily unavailable'));
  const service = new TicketRealtimeService(prisma, {
    scope: jest.fn((channel: string, ...parts: string[]) => `${channel}:${parts.join(':')}`),
    publish,
  } as never);
  await invokePrivate(service, 'publishPending');
  const failed = await prisma.ticketRealtimeOutbox.findMany({
    where: { eventId, publishedAt: null, attempts: { gt: 0 } },
  });
  expect(failed).toHaveLength(1);
  expect(failed[0]).toEqual(expect.objectContaining({
    attempts: 1,
    leaseUntil: null,
    lastError: 'Realtime publication failed.',
  }));

  await prisma.ticketRealtimeOutbox.updateMany({
    where: { id: failed[0].id },
    data: { nextAttemptAt: new Date(0) },
  });
  await invokePrivate(service, 'publishPending');
  await expect(prisma.ticketRealtimeOutbox.findUniqueOrThrow({ where: { id: failed[0].id } }))
    .resolves.toEqual(expect.objectContaining({ publishedAt: expect.any(Date), leaseUntil: null, lastError: null }));
}

async function invokePrivate(
  service: object,
  name: 'processPending' | 'publishPending' | 'clearExpiredDocuments' | 'processReconciliationJobs',
): Promise<void> {
  const methods = service as unknown as Record<typeof name, () => Promise<void>>;
  await methods[name].call(service);
}

function eventSubscriptionTicketKey(fixture: TicketingDatabaseFixture, personId: string): string {
  return `event-subscription:${fixture.eventId}:${personId}`;
}

function assertDedicatedTestDatabase(value: string): void {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('TICKETING_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (databaseUrl.protocol !== 'postgres:' && databaseUrl.protocol !== 'postgresql:') {
    throw new Error('TICKETING_TEST_DATABASE_URL must use PostgreSQL.');
  }
  if (databaseName !== 'fct_app_ticketing_test') {
    throw new Error('Ticketing PostgreSQL integration tests only run against the fct_app_ticketing_test database.');
  }
  if (databaseUrl.hostname !== '127.0.0.1' && databaseUrl.hostname !== 'localhost') {
    throw new Error('Ticketing PostgreSQL integration tests require a loopback-hosted disposable database.');
  }
}

const DAY_MS = 24 * 60 * 60 * 1_000;
