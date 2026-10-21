import { randomUUID } from 'node:crypto';
import type { TransferApplyRequest, TransferDocument } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import type { FrozenResourceService } from '../../common/frozen-resource.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { TicketIssuanceService } from '../../tickets/ticket-issuance.service';
import { TicketRealtimeService } from '../../tickets/ticket-realtime.service';
import {
  clearTicketingDatabaseFixture,
  createTicketingDatabaseFixture,
} from '../../tickets/testing/ticketing-database-fixtures';
import { DataTransferJournalService } from '../data-transfer-journal.service';
import { DataTransferService } from '../data-transfer.service';
import { EventTicketTransferAdapter } from '../event-ticket-transfer.adapter';
import { PersonTransferMatcherService } from '../person-transfer-matcher.service';
import { TicketPurchaseTransferAdapter } from '../ticket-purchase-transfer.adapter';
import { TransferKeyAllocations } from '../transfer-key-allocations';

export function postgresTransferDatabaseUrl(): string {
  let url: URL | undefined;
  try {
    const value = process.env['DATA_TRANSFER_TEST_DATABASE_URL'];
    url = value ? new URL(value) : undefined;
  } catch {
    // Configuration errors deliberately omit connection details.
  }
  if (
    !url ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/fct_app_data_transfer_test' ||
    url.search ||
    url.hash
  ) {
    throw new Error('A loopback fct_app_data_transfer_test database is required; application databases are forbidden.');
  }
  return url.toString();
}

export async function createPostgresTransferFixture(prisma: PrismaService) {
  const fixture = await createTicketingDatabaseFixture(prisma);
  const majorEventId = `${fixture.prefix}-major`;
  const otherPersonId = `${fixture.prefix}-third-person`;
  const now = new Date();
  await prisma.majorEvent.create({
    data: {
      id: majorEventId,
      name: 'Import test major event',
      startDate: now,
      endDate: fixture.eventEndsAt,
    },
  });
  await prisma.event.update({ where: { id: fixture.eventId }, data: { majorEventId } });
  await prisma.people.create({ data: { id: otherPersonId, name: 'Morgan Other', secondaryEmails: [] } });
  const actor: AuthenticatedUser = {
    sub: fixture.senderUserId,
    preferredUsername: 'Import organizer',
    realm_access: { roles: ['access'] },
    token: 'postgres-test-token',
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: { is_onboarded: true },
  };
  const auditWhere = { OR: [{ eventId: fixture.eventId }, { actorId: fixture.senderUserId }] };
  const peopleWhere = {
    OR: [
      { id: { in: [fixture.senderPersonId, fixture.recipientPersonId, otherPersonId] } },
      { email: { startsWith: fixture.prefix } },
    ],
  };
  const ticketDocument = (personId = fixture.recipientPersonId, id: string = randomUUID()): TransferDocument => ({
    format: 'cacic-event-data',
    version: 1,
    resources: [
      {
        kind: 'event-ticket',
        id,
        data: {
          eventId: fixture.eventId,
          person: { id: personId },
          source: 'ADMIN',
          sourceKey: null,
          status: 'ACTIVE',
          issuedAt: new Date(now.getTime() - 3_600_000).toISOString(),
          expiresAt: fixture.ticketExpiresAt.toISOString(),
          consumedAt: null,
          revokedAt: null,
          revokedReason: null,
        },
      },
    ],
  });
  const purchaseDocument = (personId = fixture.recipientPersonId): TransferDocument => ({
    format: 'cacic-event-data',
    version: 1,
    resources: [
      {
        kind: 'ticket-purchase',
        id: randomUUID(),
        data: {
          eventId: fixture.eventId,
          person: { id: personId },
          amountCents: 2500,
          purchasedAt: new Date(now.getTime() - 3_600_000).toISOString(),
        },
      },
    ],
  });
  const state = () =>
    Promise.all([
      prisma.event.findUnique({ where: { id: fixture.eventId } }),
      prisma.majorEvent.findUnique({ where: { id: majorEventId } }),
      prisma.people.findMany({ where: peopleWhere, orderBy: { id: 'asc' } }),
      prisma.eventTicket.findMany({ where: { eventId: fixture.eventId }, orderBy: { id: 'asc' } }),
      prisma.ticketPurchase.findMany({ where: { eventId: fixture.eventId }, orderBy: { id: 'asc' } }),
      prisma.eventTicketHistory.findMany({ where: { ticket: { eventId: fixture.eventId } }, orderBy: { id: 'asc' } }),
      prisma.ticketTransfer.findMany({ where: { eventId: fixture.eventId }, orderBy: { id: 'asc' } }),
      prisma.ticketRealtimeOutbox.findMany({ where: { eventId: fixture.eventId }, orderBy: { id: 'asc' } }),
      prisma.auditLogEntry.findMany({ where: auditWhere, orderBy: { id: 'asc' } }),
    ]);
  const cleanup = async () => {
    await prisma.auditLogEntry.deleteMany({ where: auditWhere });
    await clearTicketingDatabaseFixture(prisma, fixture);
    await prisma.people.deleteMany({ where: peopleWhere });
    await prisma.majorEvent.delete({ where: { id: majorEventId } });
  };
  return {
    ...fixture,
    majorEventId,
    otherPersonId,
    actor,
    auditWhere,
    peopleWhere,
    ticketDocument,
    purchaseDocument,
    state,
    cleanup,
  };
}

export function createPostgresTransferRuntime(prisma: PrismaService) {
  const authorization = {
    hasEventManagerAccess: () => true,
    isSuperAdmin: () => false,
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthorizationPolicyService;
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  } as unknown as FrozenResourceService;
  // Polling and publishing are not started. All transactional outbox writes are real.
  const realtime = new TicketRealtimeService(prisma, { publish: jest.fn() } as never);
  const issuance = new TicketIssuanceService(prisma, realtime);
  const matcher = new PersonTransferMatcherService(prisma);
  const tickets = new EventTicketTransferAdapter(authorization, matcher, realtime);
  const purchases = new TicketPurchaseTransferAdapter(authorization, matcher, issuance);
  const journal = new DataTransferJournalService(prisma, authorization, frozen);
  const transfer = new DataTransferService(
    prisma,
    authorization,
    frozen,
    [tickets, purchases],
    new TransferKeyAllocations(),
    journal,
  );
  const review = async (document: TransferDocument, actor: AuthenticatedUser): Promise<TransferApplyRequest> => {
    const preview = await transfer.preview({ document }, actor);
    expect(preview.canApply).toBe(true);
    expect(preview.summary.skip).toBe(0);
    return { document, planHash: preview.planHash, allowPartial: false, allocationToken: preview.allocation?.token };
  };
  return { transfer, journal, tickets, purchases, realtime, issuance, review };
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out coordinating PostgreSQL transactions.')), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A one-shot rendezvous; retries pass through without waiting for another arrival. */
export function rendezvous(parties: number) {
  let arrivals = 0;
  const ready = deferred();
  return async () => {
    arrivals += 1;
    if (arrivals >= parties) ready.resolve();
    await within(ready.promise);
  };
}

export async function waitForDatabaseCondition(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Expected database concurrency condition was not observed.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
