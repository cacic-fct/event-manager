import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import {
  CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
  EVENT_SELECT,
  EventGroupSubscriptionRecord,
  EventRecord,
  PublicEventGroupRecord,
  TransactionClient,
} from '../selects';
import { CurrentUserEventGroupSubscription } from '../models';
import { PUBLIC_EVENT_SELECT, PublicEvent } from '../../public-events/models';

export type CurrentUserSubscribedItem =
  | {
      type: 'single';
      id: string;
      event: PublicEvent;
      startDate: Date;
    }
  | {
      type: 'group';
      id: string;
      eventGroup: PublicEventGroupRecord;
      events: PublicEvent[];
      startDate: Date;
    };

@Injectable()
export class CurrentUserEventSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
  ) {}

  getEventSubscriptionError(
    event: Pick<
      EventRecord,
      | 'id'
      | 'allowSubscription'
      | 'subscriptionStartDate'
      | 'subscriptionEndDate'
      | 'startDate'
    >,
    now = new Date(),
  ): string | null {
    if (!event.allowSubscription) {
      return `Event ${event.id} does not allow subscriptions.`;
    }

    if (event.subscriptionStartDate && now < event.subscriptionStartDate) {
      return `Subscriptions for event ${event.id} are not open yet.`;
    }

    if (event.subscriptionEndDate && now > event.subscriptionEndDate) {
      return `Subscriptions for event ${event.id} are already closed.`;
    }

    if (event.startDate <= now) {
      return `Event ${event.id} has already started and cannot receive new subscriptions.`;
    }

    return null;
  }

  ensureEventSubscriptionWindowOpen(
    event: Pick<
      EventRecord,
      | 'id'
      | 'allowSubscription'
      | 'subscriptionStartDate'
      | 'subscriptionEndDate'
      | 'startDate'
    >,
    now = new Date(),
  ): void {
    const error = this.getEventSubscriptionError(event, now);
    if (error) {
      throw new BadRequestException(error);
    }
  }

  async subscribeCurrentUserEvent(
    personId: string,
    eventId: string,
  ): Promise<PublicEvent> {
    const event = await this.runSerializableSubscriptionTransaction(
      async (tx) => {
        const targetEvent = await tx.event.findFirst({
          where: {
            id: eventId,
            deletedAt: null,
          },
          select: EVENT_SELECT,
        });

        if (!targetEvent) {
          throw new NotFoundException(`Event ${eventId} was not found.`);
        }

        if (targetEvent.majorEventId) {
          throw new BadRequestException(
            `Event ${eventId} belongs to major event ${targetEvent.majorEventId}. Direct event subscription for major-event content is still pending.`,
          );
        }

        const now = new Date();
        this.ensureEventSubscriptionWindowOpen(targetEvent, now);

        if (targetEvent.eventGroupId) {
          await this.subscribeCurrentUserEventGroupTx(
            tx,
            personId,
            targetEvent.eventGroupId,
            now,
          );
          return targetEvent;
        }

        const existingSubscription = await tx.eventSubscription.findFirst({
          where: {
            eventId: targetEvent.id,
            personId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (!existingSubscription) {
          await this.ensureAvailableSlots(tx, targetEvent);
          await tx.eventSubscription.create({
            data: {
              eventId: targetEvent.id,
              personId,
            },
          });
        }

        return targetEvent;
      },
    );

    return this.mapper.mapPublicEvent(event);
  }

  async subscribeCurrentUserEventGroup(
    personId: string,
    eventGroupId: string,
  ): Promise<CurrentUserEventGroupSubscription> {
    const subscription = await this.runSerializableSubscriptionTransaction(
      (tx) => this.subscribeCurrentUserEventGroupTx(tx, personId, eventGroupId),
    );

    return this.mapper.mapCurrentUserEventGroupSubscription(
      subscription.subscription,
      subscription.events,
    );
  }

  async getSubscribedEventsByEventGroupSubscription(
    personId: string,
    eventGroupSubscriptionIds: string[],
  ): Promise<Map<string, PublicEvent[]>> {
    if (eventGroupSubscriptionIds.length === 0) {
      return new Map();
    }

    const eventSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        eventGroupSubscriptionId: {
          in: eventGroupSubscriptionIds,
        },
        event: {
          deletedAt: null,
        },
      },
      select: {
        eventGroupSubscriptionId: true,
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return this.groupEventsBySubscriptionId(eventSubscriptions);
  }

  async getCurrentUserSubscribedItems(
    personId: string,
  ): Promise<CurrentUserSubscribedItem[]> {
    const [standaloneSubscriptions, groupSubscriptions] = await Promise.all([
      this.prisma.eventSubscription.findMany({
        where: {
          personId,
          deletedAt: null,
          event: {
            deletedAt: null,
            majorEventId: null,
          },
        },
        select: {
          eventId: true,
          event: {
            select: PUBLIC_EVENT_SELECT,
          },
        },
      }),
      this.prisma.eventGroupSubscription.findMany({
        where: {
          personId,
          deletedAt: null,
          eventGroup: {
            deletedAt: null,
          },
        },
        select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
      }),
    ]);

    const eventsBySubscriptionId =
      await this.getSubscribedEventsByEventGroupSubscription(
        personId,
        groupSubscriptions.map((subscription) => subscription.id),
      );

    const items: CurrentUserSubscribedItem[] = [];

    for (const subscription of standaloneSubscriptions) {
      items.push({
        type: 'single',
        id: subscription.eventId,
        event: subscription.event,
        startDate: subscription.event.startDate,
      });
    }

    for (const subscription of groupSubscriptions) {
      const events = eventsBySubscriptionId.get(subscription.id) ?? [];
      const startDate =
        events.length > 0
          ? this.mapper.getEarliestEventStartDate(events)
          : new Date();

      items.push({
        type: 'group',
        id: subscription.id,
        eventGroup: subscription.eventGroup,
        events,
        startDate,
      });
    }

    return items.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  }

  private async subscribeCurrentUserEventGroupTx(
    tx: TransactionClient,
    personId: string,
    eventGroupId: string,
    now = new Date(),
  ): Promise<{
    subscription: EventGroupSubscriptionRecord;
    events: PublicEvent[];
  }> {
    const [groupEvents, existingSubscription, activeChildSubscriptions] =
      await Promise.all([
        tx.event.findMany({
          where: {
            eventGroupId,
            deletedAt: null,
          },
          select: EVENT_SELECT,
          orderBy: {
            startDate: 'asc',
          },
        }),
        tx.eventGroupSubscription.findFirst({
          where: {
            eventGroupId,
            personId,
            deletedAt: null,
          },
          select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
        }),
        tx.eventSubscription.findMany({
          where: {
            personId,
            deletedAt: null,
            event: {
              eventGroupId,
              deletedAt: null,
              majorEventId: null,
            },
          },
          select: {
            eventId: true,
            eventGroupSubscriptionId: true,
          },
        }),
      ]);

    if (groupEvents.length === 0) {
      const eventGroup = await tx.eventGroup.findFirst({
        where: {
          id: eventGroupId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      if (!eventGroup) {
        throw new NotFoundException(
          `Event group ${eventGroupId} was not found.`,
        );
      }

      throw new BadRequestException(
        `Event group ${eventGroupId} has no active events available for subscription.`,
      );
    }

    if (groupEvents.some((event) => event.majorEventId != null)) {
      throw new BadRequestException(
        `Event group ${eventGroupId} belongs to a major event. Major-event integration for group subscriptions is still pending.`,
      );
    }

    const eligibleEvents = groupEvents.filter(
      (event) => this.getEventSubscriptionError(event, now) === null,
    );
    const hasExistingSubscriptionState =
      existingSubscription != null || activeChildSubscriptions.length > 0;

    if (!hasExistingSubscriptionState && eligibleEvents.length === 0) {
      throw new BadRequestException(
        `Event group ${eventGroupId} has no events currently available for self-subscription.`,
      );
    }

    const subscription =
      existingSubscription ??
      (await tx.eventGroupSubscription.create({
        data: {
          eventGroupId,
          personId,
        },
        select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
      }));

    if (activeChildSubscriptions.length > 0) {
      const childEventIds = activeChildSubscriptions.map(
        (childSubscription) => childSubscription.eventId,
      );
      await tx.eventSubscription.updateMany({
        where: {
          personId,
          eventId: {
            in: childEventIds,
          },
          deletedAt: null,
        },
        data: {
          eventGroupSubscriptionId: subscription.id,
        },
      });
    }

    const activeEventIdSet = new Set(
      activeChildSubscriptions.map(
        (childSubscription) => childSubscription.eventId,
      ),
    );
    const missingEligibleEvents = eligibleEvents.filter(
      (event) => !activeEventIdSet.has(event.id),
    );

    const eventsToCreate: EventRecord[] = [];
    for (const event of missingEligibleEvents) {
      try {
        await this.ensureAvailableSlots(tx, event);
        eventsToCreate.push(event);
      } catch (error) {
        if (!hasExistingSubscriptionState) {
          throw error;
        }
      }
    }

    if (eventsToCreate.length > 0) {
      await tx.eventSubscription.createMany({
        data: eventsToCreate.map((event) => ({
          eventId: event.id,
          personId,
          eventGroupSubscriptionId: subscription.id,
        })),
      });
    }

    const events = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        eventGroupSubscriptionId: subscription.id,
        event: {
          deletedAt: null,
        },
      },
      select: {
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return {
      subscription,
      events: events.map((eventSubscription) => eventSubscription.event),
    };
  }

  private async ensureAvailableSlots(
    tx: TransactionClient,
    event: Pick<EventRecord, 'id' | 'slots'>,
  ): Promise<void> {
    if (event.slots == null) {
      return;
    }

    const activeSubscriptionsCount = await tx.eventSubscription.count({
      where: {
        eventId: event.id,
        deletedAt: null,
      },
    });

    if (activeSubscriptionsCount >= event.slots) {
      throw new BadRequestException(
        `Event ${event.id} has no available slots for subscription.`,
      );
    }
  }

  private groupEventsBySubscriptionId(
    eventSubscriptions: Array<{
      eventGroupSubscriptionId: string | null;
      event: PublicEvent;
    }>,
  ): Map<string, PublicEvent[]> {
    const eventsBySubscriptionId = new Map<string, PublicEvent[]>();
    for (const subscription of eventSubscriptions) {
      if (!subscription.eventGroupSubscriptionId) {
        continue;
      }

      const events =
        eventsBySubscriptionId.get(subscription.eventGroupSubscriptionId) ?? [];
      events.push(subscription.event);
      eventsBySubscriptionId.set(subscription.eventGroupSubscriptionId, events);
    }

    return eventsBySubscriptionId;
  }

  private async runSerializableSubscriptionTransaction<T>(
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < maxAttempts &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Could not complete subscription.');
  }
}
