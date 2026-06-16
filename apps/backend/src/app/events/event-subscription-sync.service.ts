import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';

export type MajorEventSubscriptionSyncResult = {
  activeEventIds: string[];
  archivedEventIds: string[];
  createdEventIds: string[];
};

@Injectable()
export class EventSubscriptionSyncService {
  async syncMajorEventConfirmedSubscriptions(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    personId: string,
    selectedEventIds: string[],
    status: SubscriptionStatus,
    createdById?: string,
  ): Promise<MajorEventSubscriptionSyncResult> {
    const selectedEventIdSet = new Set(selectedEventIds);
    const activeSubscriptions = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
      },
    });
    const activeEventIds = activeSubscriptions.map((subscription) => subscription.eventId);
    const activeEventIdSet = new Set(activeEventIds);
    const now = new Date();
    const archivedEventIds = activeEventIds.filter(
      (eventId) => status !== SubscriptionStatus.CONFIRMED || !selectedEventIdSet.has(eventId),
    );

    if (archivedEventIds.length > 0) {
      await tx.eventSubscription.updateMany({
        where: {
          personId,
          eventId: {
            in: archivedEventIds,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
    }

    const createdEventIds =
      status === SubscriptionStatus.CONFIRMED
        ? selectedEventIds.filter((eventId) => !activeEventIdSet.has(eventId))
        : [];
    if (createdEventIds.length > 0) {
      await this.ensureEventIdsHaveAvailableSlots(tx, createdEventIds);
      await tx.eventSubscription.createMany({
        data: createdEventIds.map((eventId) => ({
          eventId,
          personId,
          createdById,
          createdByMethod: 'ADMIN_DASHBOARD',
        })),
      });
    }

    return {
      activeEventIds,
      archivedEventIds,
      createdEventIds,
    };
  }

  async ensureEventIdsHaveAvailableSlots(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) {
      return;
    }

    const events = await tx.event.findMany({
      where: {
        id: {
          in: uniqueEventIds,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        slots: true,
      },
    });
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const missingEventIds = uniqueEventIds.filter((eventId) => !eventsById.has(eventId));
    if (missingEventIds.length > 0) {
      throw new BadRequestException(`Some selected events are not available: ${missingEventIds.join(', ')}.`);
    }

    for (const event of events) {
      if (event.slots == null) {
        continue;
      }

      const activeSubscriptionsCount = await tx.eventSubscription.count({
        where: {
          eventId: event.id,
          deletedAt: null,
        },
      });
      if (activeSubscriptionsCount >= event.slots) {
        throw new BadRequestException(`Event ${event.id} has no available slots for subscription.`);
      }
    }
  }
}
