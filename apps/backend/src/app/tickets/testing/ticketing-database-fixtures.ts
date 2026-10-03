import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type TicketingDatabaseFixture = {
  prefix: string;
  eventId: string;
  ticketConfigId: string;
  ticketId: string;
  senderUserId: string;
  senderPersonId: string;
  recipientUserId: string;
  recipientPersonId: string;
  recipientDocument: string;
  eventEndsAt: Date;
  ticketExpiresAt: Date;
};

export type TicketingDatabaseFixtureOptions = {
  prefix?: string;
  eventEndsAt?: Date;
  ticketExpiresAt?: Date;
  recipientDocument?: string;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Creates a self-contained event, ticket policy, active ticket, and two linked accounts. */
export async function createTicketingDatabaseFixture(
  prisma: PrismaService,
  options: TicketingDatabaseFixtureOptions = {},
): Promise<TicketingDatabaseFixture> {
  const prefix = options.prefix ?? `ticketing-test-${randomUUID()}`;
  const now = new Date();
  const eventEndsAt = options.eventEndsAt ?? new Date(now.getTime() + DAY_MS);
  const ticketExpiresAt = options.ticketExpiresAt ?? new Date(now.getTime() + 2 * DAY_MS);
  const senderUserId = `${prefix}-sender-user`;
  const senderPersonId = `${prefix}-sender-person`;
  const recipientUserId = `${prefix}-recipient-user`;
  const recipientPersonId = `${prefix}-recipient-person`;
  const eventId = `${prefix}-event`;
  const ticketConfigId = `${prefix}-config`;
  const recipientDocument = options.recipientDocument ?? createTicketingPassportDocument();

  const ticket = await prisma.$transaction(async (tx) => {
    await tx.user.createMany({
      data: [
        { id: senderUserId, email: `${prefix}-sender@example.test`, name: 'Taylor Sender' },
        { id: recipientUserId, email: `${prefix}-recipient@example.test`, name: 'Riley Recipient', identityDocument: recipientDocument },
      ],
    });
    await tx.people.createMany({
      data: [
        {
          id: senderPersonId,
          name: 'Taylor Sender',
          secondaryEmails: [],
          userId: senderUserId,
          identityDocument: `${prefix}-sender-passport`,
          isCPF: false,
        },
        {
          id: recipientPersonId,
          name: 'Riley Recipient',
          secondaryEmails: [],
          userId: recipientUserId,
          identityDocument: recipientDocument,
          isCPF: false,
        },
      ],
    });

    await tx.event.create({
      data: {
        id: eventId,
        name: 'Ticketing integration event',
        startDate: new Date(eventEndsAt.getTime() - 2 * 60 * 60 * 1_000),
        endDate: eventEndsAt,
        emoji: '🎟️',
        publicationState: 'PUBLISHED',
      },
    });
    await tx.ticketConfig.create({
      data: {
        id: ticketConfigId,
        eventId,
        enabled: true,
        displayName: 'Integration ticket',
        transferable: true,
      },
    });
    return tx.eventTicket.create({
      data: {
        eventId,
        ticketConfigId,
        holderPersonId: senderPersonId,
        originalHolderPersonId: senderPersonId,
        source: 'ADMIN',
        status: 'ACTIVE',
        expiresAt: ticketExpiresAt,
      },
      select: { id: true },
    });
  });

  return {
    prefix,
    eventId,
    ticketConfigId,
    ticketId: ticket.id,
    senderUserId,
    senderPersonId,
    recipientUserId,
    recipientPersonId,
    recipientDocument,
    eventEndsAt,
    ticketExpiresAt,
  };
}

function createTicketingPassportDocument(): string {
  return `TKT${randomUUID().replace(/-/gu, '').slice(0, 8).toUpperCase()}`;
}

/** Removes only rows created by one fixture, leaving the rest of the disposable DB alone. */
export async function clearTicketingDatabaseFixture(
  prisma: PrismaService,
  fixture: Pick<TicketingDatabaseFixture, 'prefix' | 'eventId' | 'senderUserId' | 'senderPersonId' | 'recipientUserId' | 'recipientPersonId'>,
): Promise<void> {
  const users = [fixture.senderUserId, fixture.recipientUserId];
  const people = [fixture.senderPersonId, fixture.recipientPersonId];
  const transfers = await prisma.ticketTransfer.findMany({
    where: { eventId: fixture.eventId },
    select: { id: true },
  });
  const transferIds = transfers.map(({ id }) => id);

  if (transferIds.length > 0) {
    await prisma.ticketNotificationOutbox.deleteMany({ where: { transferId: { in: transferIds } } });
  }
  await prisma.ticketRealtimeOutbox.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.ticketEntitlementReconciliation.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.ticketPurchase.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.ticketTransfer.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.auditLogEntry.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.eventAttendance.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.eventSubscription.deleteMany({ where: { eventId: fixture.eventId } });
  await prisma.ticketTransferAuthorCooldown.deleteMany({ where: { userId: { in: users } } });
  await prisma.people.deleteMany({ where: { id: { in: people } } });
  await prisma.event.deleteMany({ where: { id: fixture.eventId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
