import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../../audit-log/audit-log.service';
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
import { PUBLIC_EVENT_SELECT, PUBLIC_EVENT_WHERE, PublicEvent } from '../../public-events/models';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { EventSubscriptionCountersService } from '../../events/subscription-counters.service';

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

type EventGroupSubscriptionAuditSnapshot = EventGroupSubscriptionRecord & {
  eventIds: string[];
};

@Injectable()
export class CurrentUserEventSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly counters: EventSubscriptionCountersService = new EventSubscriptionCountersService(),
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
  ) {}

  getEventSubscriptionError(
    event: Pick<
      EventRecord,
      'id' | 'allowSubscription' | 'subscriptionStartDate' | 'subscriptionEndDate' | 'startDate'
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
      'id' | 'allowSubscription' | 'subscriptionStartDate' | 'subscriptionEndDate' | 'startDate'
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
    actor?: AuthenticatedUser,
  ): Promise<PublicEvent> {
    const result = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const targetEvent = await tx.event.findFirst({
        where: {
          AND: [PUBLIC_EVENT_WHERE, { id: eventId }],
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
        const groupSubscription = await this.subscribeCurrentUserEventGroupTx(tx, personId, targetEvent.eventGroupId, now);
        await this.recordEventGroupSubscriptionChange(groupSubscription, personId, actor, tx);
        return {
          event: targetEvent,
          createdSubscription: null,
          createdGroupSubscription: groupSubscription.createdGroupSubscription ? groupSubscription.subscription : null,
        };
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
        const createdSubscription = await tx.eventSubscription.create({
          data: {
            eventId: targetEvent.id,
            personId,
            createdByMethod: 'SELF_SUBSCRIPTION',
          },
          select: {
            id: true,
            eventId: true,
            personId: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
          },
        });
        await this.attendanceCategories.refreshForAttendance(personId, targetEvent.id, tx);
        await this.refreshEventSubscriptionCounters(tx, [targetEvent.id]);
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.EVENT_SUBSCRIPTION,
            entityId: createdSubscription.id,
            entityLabel: personId,
            operation: AuditLogOperation.USER_CREATE,
            actor,
            after: createdSubscription,
            scope: { permission: Permission.Subscription.Create, eventId: createdSubscription.eventId },
            summary: 'Inscrição em evento criada pelo usuário.',
          },
          tx,
        );
        return { event: targetEvent, createdSubscription, createdGroupSubscription: null };
      }

      return { event: targetEvent, createdSubscription: null, createdGroupSubscription: null };
    });

    return this.mapper.mapPublicEvent(result.event);
  }

  async unsubscribeCurrentUserEvent(
    personId: string,
    eventId: string,
    actor?: AuthenticatedUser,
  ): Promise<PublicEvent> {
    const event = await this.runSerializableSubscriptionTransaction(async (tx) => {
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

      const now = new Date();
      if (targetEvent.startDate <= now) {
        throw new BadRequestException(`Event ${eventId} has already started and cannot be unsubscribed.`);
      }

      const existingSubscription = await tx.eventSubscription.findFirst({
        where: {
          eventId: targetEvent.id,
          personId,
          deletedAt: null,
        },
        select: {
          id: true,
          eventId: true,
          personId: true,
          eventGroupSubscriptionId: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
          deletedAt: true,
        },
      });

      if (!existingSubscription) {
        throw new BadRequestException(`Current user is not subscribed to event ${eventId}.`);
      }

      const groupSubscription = existingSubscription.eventGroupSubscriptionId
        ? await tx.eventGroupSubscription.findUnique({
            where: {
              id: existingSubscription.eventGroupSubscriptionId,
            },
            select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
          })
        : null;
      const previousGroupEventIds = groupSubscription
        ? await this.getEventGroupSubscriptionEventIds(tx, personId, groupSubscription.id)
        : [];
      await tx.eventSubscription.update({
        where: {
          id: existingSubscription.id,
        },
        data: {
          deletedAt: now,
        },
      });
      await this.refreshEventSubscriptionCounters(tx, [targetEvent.id]);
      if (groupSubscription) {
        const currentGroupEventIds = await this.getEventGroupSubscriptionEventIds(tx, personId, groupSubscription.id);
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION,
            entityId: groupSubscription.id,
            entityLabel: personId,
            operation: AuditLogOperation.UPDATE,
            actor,
            before: this.buildEventGroupSubscriptionAuditSnapshot(groupSubscription, previousGroupEventIds),
            after: this.buildEventGroupSubscriptionAuditSnapshot(groupSubscription, currentGroupEventIds),
            scope: { permission: Permission.Subscription.Update, eventGroupId: groupSubscription.eventGroupId },
            summary: 'Inscrição em grupo de eventos atualizada pelo usuário.',
          },
          tx,
        );
      } else {
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.EVENT_SUBSCRIPTION,
            entityId: existingSubscription.id,
            entityLabel: personId,
            operation: AuditLogOperation.DELETE,
            actor,
            before: existingSubscription,
            after: { ...existingSubscription, deletedAt: now },
            scope: { permission: Permission.Subscription.Delete, eventId: existingSubscription.eventId },
            summary: 'Inscrição em evento cancelada pelo usuário.',
            force: true,
          },
          tx,
        );
      }

      return targetEvent;
    });

    return this.mapper.mapPublicEvent(event);
  }

  async subscribeCurrentUserEventGroup(
    personId: string,
    eventGroupId: string,
    actor?: AuthenticatedUser,
  ): Promise<CurrentUserEventGroupSubscription> {
    const subscription = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const result = await this.subscribeCurrentUserEventGroupTx(tx, personId, eventGroupId);
      await this.recordEventGroupSubscriptionChange(result, personId, actor, tx);
      return result;
    });

    return this.mapper.mapCurrentUserEventGroupSubscription(subscription.subscription, subscription.events);
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

  async getCurrentUserSubscribedItems(personId: string): Promise<CurrentUserSubscribedItem[]> {
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

    const eventsBySubscriptionId = await this.getSubscribedEventsByEventGroupSubscription(
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
      const startDate = events.length > 0 ? this.mapper.getEarliestEventStartDate(events) : new Date();

      items.push({
        type: 'group',
        id: subscription.id,
        eventGroup: subscription.eventGroup,
        events,
        startDate,
      });
    }

    return items.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  private async subscribeCurrentUserEventGroupTx(
    tx: TransactionClient,
    personId: string,
    eventGroupId: string,
    now = new Date(),
  ): Promise<{
    subscription: EventGroupSubscriptionRecord;
    events: PublicEvent[];
    createdGroupSubscription: boolean;
    previousAuditSnapshot: EventGroupSubscriptionAuditSnapshot | null;
    currentAuditSnapshot: EventGroupSubscriptionAuditSnapshot;
  }> {
    const [groupEvents, existingSubscription, activeChildSubscriptions] = await Promise.all([
      tx.event.findMany({
        where: {
          AND: [PUBLIC_EVENT_WHERE, { eventGroupId }],
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
            deletedAt: null,
            eventGroupId,
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
        throw new NotFoundException(`Event group ${eventGroupId} was not found.`);
      }

      throw new BadRequestException(`Event group ${eventGroupId} has no active events available for subscription.`);
    }

    if (groupEvents.some((event) => event.majorEventId != null)) {
      throw new BadRequestException(
        `Event group ${eventGroupId} belongs to a major event. Major-event integration for group subscriptions is still pending.`,
      );
    }

    const eligibleEvents = groupEvents.filter((event) => this.getEventSubscriptionError(event, now) === null);
    const hasExistingSubscriptionState = existingSubscription != null || activeChildSubscriptions.length > 0;

    if (!hasExistingSubscriptionState && eligibleEvents.length === 0) {
      throw new BadRequestException(
        `Event group ${eventGroupId} has no events currently available for self-subscription.`,
      );
    }

    const createdGroupSubscription = existingSubscription == null;
    const previousEventIds = existingSubscription
      ? activeChildSubscriptions
          .filter((childSubscription) => childSubscription.eventGroupSubscriptionId === existingSubscription.id)
          .map((childSubscription) => childSubscription.eventId)
      : [];
    const subscription =
      existingSubscription ??
      (await tx.eventGroupSubscription.create({
        data: {
          eventGroupId,
          personId,
          createdByMethod: 'SELF_SUBSCRIPTION',
        },
        select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
      }));

    const childEventIds = activeChildSubscriptions.map((childSubscription) => childSubscription.eventId);
    if (childEventIds.length > 0) {
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

    const activeEventIdSet = new Set(activeChildSubscriptions.map((childSubscription) => childSubscription.eventId));
    const missingEligibleEvents = eligibleEvents.filter((event) => !activeEventIdSet.has(event.id));

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
          createdByMethod: 'SELF_SUBSCRIPTION',
        })),
      });
      await this.attendanceCategories.refreshForEventPersons(
        eventsToCreate.map((event) => event.id),
        [personId],
        tx,
      );
    }
    await this.refreshEventSubscriptionCounters(tx, [...childEventIds, ...eventsToCreate.map((event) => event.id)]);

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
      createdGroupSubscription,
      previousAuditSnapshot: existingSubscription
        ? this.buildEventGroupSubscriptionAuditSnapshot(existingSubscription, previousEventIds)
        : null,
      currentAuditSnapshot: this.buildEventGroupSubscriptionAuditSnapshot(
        subscription,
        events.map((eventSubscription) => eventSubscription.event.id),
      ),
    };
  }

  private async recordEventGroupSubscriptionChange(
    result: {
      subscription: EventGroupSubscriptionRecord;
      createdGroupSubscription: boolean;
      previousAuditSnapshot: EventGroupSubscriptionAuditSnapshot | null;
      currentAuditSnapshot: EventGroupSubscriptionAuditSnapshot;
    },
    personId: string,
    actor: AuthenticatedUser | undefined,
    tx: TransactionClient,
  ): Promise<void> {
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION,
        entityId: result.subscription.id,
        entityLabel: personId,
        operation: result.createdGroupSubscription ? AuditLogOperation.USER_CREATE : AuditLogOperation.UPDATE,
        actor,
        before: result.previousAuditSnapshot ?? undefined,
        after: result.currentAuditSnapshot,
        scope: {
          permission: result.createdGroupSubscription ? Permission.Subscription.Create : Permission.Subscription.Update,
          eventGroupId: result.subscription.eventGroupId,
        },
        summary: result.createdGroupSubscription
          ? 'Inscrição em grupo de eventos criada pelo usuário.'
          : 'Inscrição em grupo de eventos atualizada pelo usuário.',
      },
      tx,
    );
  }

  private async getEventGroupSubscriptionEventIds(
    tx: TransactionClient,
    personId: string,
    eventGroupSubscriptionId: string,
  ): Promise<string[]> {
    const subscriptions = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        eventGroupSubscriptionId,
        event: {
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return subscriptions.map((subscription) => subscription.eventId);
  }

  private buildEventGroupSubscriptionAuditSnapshot(
    subscription: EventGroupSubscriptionRecord,
    eventIds: string[],
  ): EventGroupSubscriptionAuditSnapshot {
    return {
      ...subscription,
      eventIds: [...eventIds].sort(),
    };
  }

  private async ensureAvailableSlots(tx: TransactionClient, event: Pick<EventRecord, 'id' | 'slots'>): Promise<void> {
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
      throw new BadRequestException(`Event ${event.id} has no available slots for subscription.`);
    }
  }

  private async refreshEventSubscriptionCounters(tx: TransactionClient, eventIds: string[]): Promise<void> {
    await this.counters.refresh(tx, eventIds);
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

      const events = eventsBySubscriptionId.get(subscription.eventGroupSubscriptionId) ?? [];
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
        if (attempt < maxAttempts && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Could not complete subscription.');
  }
}
