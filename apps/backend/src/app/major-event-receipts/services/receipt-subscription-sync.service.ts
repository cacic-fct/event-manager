import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { EventSubscriptionSyncService } from '../../events/event-subscription-sync.service';
import { EventSubscriptionCountersService } from '../../events/subscription-counters.service';
import { refreshSportsParticipantForSubscription } from '../../sports/sports-payment.service';

@Injectable()
export class ReceiptSubscriptionSyncService {
  constructor(
    private readonly counters: EventSubscriptionCountersService = new EventSubscriptionCountersService(),
    private readonly eventSubscriptions: EventSubscriptionSyncService = new EventSubscriptionSyncService(),
  ) {}

  async syncConfirmedEventSubscriptions(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    personId: string,
    selectedEventIds: string[],
    status: SubscriptionStatus,
    actorId: string,
  ): Promise<void> {
    await this.eventSubscriptions.syncMajorEventConfirmedSubscriptions(
      tx,
      majorEventId,
      personId,
      selectedEventIds,
      status,
      actorId,
    );
  }

  async refreshEventSubscriptionCounters(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    await this.counters.refresh(tx, eventIds);
  }

  async refreshSportsParticipantPayment(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
  ): Promise<void> {
    await refreshSportsParticipantForSubscription(tx, subscriptionId);
  }
}
