import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';

/** Keeps subscription entitlements in the same transaction as their source. */
@Injectable()
export class TicketSubscriptionSyncService {
  constructor(private readonly tickets: TicketIssuanceService) {}

  async forEvent(tx: Prisma.TransactionClient, eventId: string, personId: string): Promise<void> {
    await this.tickets.syncForPerson(tx, eventId, personId, 'EVENT_SUBSCRIPTION', `event-subscription:${eventId}:${personId}`);
  }

  async forEvents(tx: Prisma.TransactionClient, eventIds: readonly string[], personId: string): Promise<void> {
    for (const eventId of [...new Set(eventIds)].sort()) await this.forEvent(tx, eventId, personId);
  }

  async forMajorEvent(tx: Prisma.TransactionClient, majorEventId: string, personId: string): Promise<void> {
    // Included rights can concern hidden kit redemption events. Access to the
    // parent subscription was authorized by the caller; this grants no catalog access.
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const configs = await tx.ticketConfig.findMany({
        where: { event: { OR: [{ majorEventId }, { majorEventId: null, eventGroup: { majorEventId } }] } },
        select: { eventId: true }, orderBy: { eventId: 'asc' },
      });
      for (const config of configs) {
        await this.forEvent(tx, config.eventId, personId);
        await this.tickets.syncForPerson(tx, config.eventId, personId, 'MAJOR_EVENT_SUBSCRIPTION', `major-event-subscription:${config.eventId}:${personId}`);
      }
    });
  }
}
