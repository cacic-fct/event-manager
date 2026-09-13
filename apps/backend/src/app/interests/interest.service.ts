import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import {
  InterestTargetType,
  SubscriptionCreationMethod,
  SubscriptionStatus,
  type InterestTargetType as InterestTargetTypeValue,
  type SubscriptionStatus as SubscriptionStatusValue,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE, PUBLIC_MAJOR_EVENT_WHERE } from '../public-events/models';
import { CurrentUserEventSubscriptionService } from '../current-user/events/subscription.service';
import { EventSubscriptionsResolver } from '../events/subscriptions.resolver';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from '../events/attendance-eligibility';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import {
  CurrentUserInterestState,
  EventInterest,
  EventInterestConversion,
  EventInterestPerson,
} from './models';

type PrismaExecutor = PrismaService | PrismaClient | Prisma.TransactionClient;

const INTEREST_SELECT = {
  id: true,
  personId: true,
  eventId: true,
  eventGroupId: true,
  majorEventId: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  person: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.EventInterestSelect;

type EventInterestRecord = Prisma.EventInterestGetPayload<{ select: typeof INTEREST_SELECT }>;

type InterestTarget = {
  targetType: InterestTargetTypeValue;
  targetId: string;
};

type TargetPermission =
  | typeof Permission.Event.Read
  | typeof Permission.EventGroup.Read
  | typeof Permission.MajorEvent.Read;

type ConversionRequest = {
  interestId: string;
  selectedEventIds?: string[] | null;
  subscriptionStatus?: SubscriptionStatusValue | null;
  amountPaid?: number | null;
  paymentDate?: Date | null;
  paymentTier?: string | null;
  imageLicenseAgreementAccepted?: boolean | null;
};

@Injectable()
export class EventInterestsService {
  private readonly logger = new Logger(EventInterestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly eventSubscriptions: CurrentUserEventSubscriptionService,
    private readonly workspaceSubscriptions: EventSubscriptionsResolver,
    private readonly frozenResources: FrozenResourceService,
    @Inject(RealtimeInvalidationService)
    @Optional()
    private readonly realtime: Pick<RealtimeInvalidationService, 'scope' | 'publish'> = {
      scope: (channel) => channel,
      publish: async () => ({}) as never,
    },
  ) {}

  async getCurrentUserInterest(
    personId: string,
    targetType: InterestTargetTypeValue,
    targetId: string,
  ): Promise<EventInterest | null> {
    const target = await this.requirePublicTarget(this.prisma, { targetType, targetId }, false);
    if (!target) {
      return null;
    }

    const interest = await this.prisma.eventInterest.findFirst({
      where: {
        personId,
        deletedAt: null,
        ...this.targetWhere({ targetType, targetId }),
      },
      select: INTEREST_SELECT,
    });

    return interest ? this.toModel(interest) : null;
  }

  async getCurrentUserInterestState(
    personId: string,
    targetType: InterestTargetTypeValue,
    targetId: string,
  ): Promise<CurrentUserInterestState> {
    const target = this.normalizeTarget(targetType, targetId);
    const targetState = await this.findInterestTargetState(this.prisma, target);
    if (!targetState) {
      throw new NotFoundException('O alvo do interesse não foi encontrado.');
    }

    const [interest, subscribed] = await Promise.all([
      this.prisma.eventInterest.findFirst({
        where: { personId, deletedAt: null, ...this.targetWhere(target) },
        select: INTEREST_SELECT,
      }),
      this.hasActiveSubscription(this.prisma, personId, target),
    ]);

    return {
      interest: interest ? this.toModel(interest) : null,
      subscribed,
      endsAt: targetState.endsAt,
      enabled: targetState.interestEnabled,
    };
  }

  async listCurrentUserInterests(personId: string, majorEventId?: string | null): Promise<EventInterest[]> {
    const interests = await this.prisma.eventInterest.findMany({
      where: {
        personId,
        deletedAt: null,
        ...(majorEventId
          ? {
              OR: [
                { majorEventId },
                { event: { majorEventId } },
                { eventGroup: { majorEventId } },
              ],
            }
          : {}),
      },
      select: INTEREST_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return Promise.all(
      interests.map(async (interest) => ({
        ...this.toModel(interest),
        isSubscribed: Boolean(await this.findExistingSubscription(interest)),
      })),
    );
  }

  async setCurrentUserInterest(
    personId: string,
    target: InterestTarget,
    interested: boolean,
    actor?: AuthenticatedUser,
  ): Promise<EventInterest | null> {
    const normalizedTarget = this.normalizeTarget(target.targetType, target.targetId);
    const actorId = actor?.sub ?? personId;
    const result = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await this.lockTargetPerson(tx, personId, normalizedTarget);
      const targetRecord = await this.requirePublicTarget(tx, normalizedTarget, interested);
      if (!targetRecord) {
        throw new NotFoundException('O evento não está disponível para marcar interesse.');
      }
      const targetState = await this.findInterestTargetState(tx, normalizedTarget);
      if (!targetState || targetState.endsAt <= new Date()) {
        throw new BadRequestException('Não é possível alterar o interesse após o encerramento do alvo.');
      }

      if (await this.hasActiveSubscription(tx, personId, normalizedTarget)) {
        throw new BadRequestException('Pessoas já inscritas não podem alterar o interesse deste alvo.');
      }

      const existing = await tx.eventInterest.findFirst({
        where: {
          personId,
          deletedAt: null,
          ...this.targetWhere(normalizedTarget),
        },
        select: { id: true },
      });

      if (!interested) {
        if (existing) {
          await tx.eventInterest.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
          });
        }
        return null;
      }

      if (existing) {
        return tx.eventInterest.findUniqueOrThrow({
          where: { id: existing.id },
          select: INTEREST_SELECT,
        });
      }

      return tx.eventInterest.create({
        data: {
          personId,
          ...this.targetCreateData(normalizedTarget),
          createdById: actorId,
        },
        select: INTEREST_SELECT,
      });
    });

    await this.publishTargetInvalidations(normalizedTarget);
    return result ? this.toModel(result) : null;
  }

  async listAdminInterests(
    user: AuthenticatedUser | undefined,
    target: InterestTarget,
    options: { query?: string | null; skip?: number; take?: number } = {},
  ): Promise<EventInterest[]> {
    const normalizedTarget = this.normalizeTarget(target.targetType, target.targetId);
    await this.assertTargetPermission(user, normalizedTarget, Permission.Subscription.Read);

    const where: Prisma.EventInterestWhereInput = {
      deletedAt: null,
      ...this.targetWhere(normalizedTarget),
    };
    const query = options.query?.trim();
    if (query) {
      where.person = {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { identityDocument: { contains: query, mode: 'insensitive' } },
          { academicId: { contains: query, mode: 'insensitive' } },
        ],
      };
    }

    const interests = await this.prisma.eventInterest.findMany({
      where,
      select: INTEREST_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: Math.max(0, options.skip ?? 0),
      take: Math.min(Math.max(1, options.take ?? 50), 100),
    });

    const subscribedPersonIds = await this.findSubscribedPersonIdsForTarget(normalizedTarget, interests.map(({ personId }) => personId));
    return interests.map((interest) => ({
      ...this.toModel(interest),
      isSubscribed: subscribedPersonIds.has(interest.personId),
    }));
  }

  private async publishTargetInvalidations(target: InterestTarget): Promise<void> {
    const scopes = new Set<string>();
    const addEventScope = (eventId: string) => scopes.add(this.realtime.scope('admin-event-subscriptions', eventId));
    const addMajorScope = (majorEventId: string) =>
      scopes.add(this.realtime.scope('admin-major-event-subscriptions', majorEventId));

    try {
      if (target.targetType === InterestTargetType.EVENT) {
        const event = await this.prisma.event.findUnique({
          where: { id: target.targetId },
          select: { majorEventId: true },
        });
        addEventScope(target.targetId);
        if (event?.majorEventId) {
          addMajorScope(event.majorEventId);
        }
      } else if (target.targetType === InterestTargetType.EVENT_GROUP) {
        const group = await this.prisma.eventGroup.findUnique({
          where: { id: target.targetId },
          select: { majorEventId: true, events: { select: { id: true } } },
        });
        for (const event of group?.events ?? []) {
          addEventScope(event.id);
        }
        if (group?.majorEventId) {
          addMajorScope(group.majorEventId);
        }
      } else {
        addMajorScope(target.targetId);
      }

      await Promise.all(
        [...scopes].map((scope) =>
          this.realtime.publish(scope, {
            type: 'INTERESTS_INVALIDATED',
            targetType: target.targetType,
            targetId: target.targetId,
            occurredAt: new Date().toISOString(),
          }),
        ),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Interest realtime invalidation failed for ${target.targetType}:${target.targetId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async findSubscribedPersonIdsForTarget(target: InterestTarget, personIds: string[]): Promise<Set<string>> {
    const subscribed = new Set<string>();
    if (personIds.length === 0) {
      return subscribed;
    }

    if (target.targetType === InterestTargetType.MAJOR_EVENT) {
      const rows = await this.prisma.majorEventSubscription.findMany({
        where: {
          majorEventId: target.targetId,
          personId: { in: personIds },
          deletedAt: null,
          subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
        },
        select: { personId: true },
      });
      rows.forEach(({ personId }) => subscribed.add(personId));
      return subscribed;
    }

    if (target.targetType === InterestTargetType.EVENT) {
      const event = await this.prisma.event.findUnique({ where: { id: target.targetId }, select: { majorEventId: true, eventGroupId: true, autoSubscribe: true } });
      const rows = await this.prisma.eventSubscription.findMany({
        where: { eventId: target.targetId, personId: { in: personIds }, deletedAt: null },
        select: { personId: true },
      });
      rows.forEach(({ personId }) => subscribed.add(personId));
      if (event?.eventGroupId) {
        const groups = await this.prisma.eventGroupSubscription.findMany({
          where: { eventGroupId: event.eventGroupId, personId: { in: personIds }, deletedAt: null },
          select: { personId: true },
        });
        groups.forEach(({ personId }) => subscribed.add(personId));
      }
      if (event?.majorEventId) {
        if (event.autoSubscribe) {
          return this.addAutomaticSubscribers(subscribed, event.majorEventId, personIds);
        }
        const selections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
          where: {
            eventId: target.targetId,
            deletedAt: null,
            subscription: {
              majorEventId: event.majorEventId,
              personId: { in: personIds },
              deletedAt: null,
              subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
            },
          },
          select: { subscription: { select: { personId: true } } },
        });
        selections.forEach(({ subscription }) => subscribed.add(subscription.personId));
      }
      return subscribed;
    }

    const group = await this.prisma.eventGroup.findUnique({
      where: { id: target.targetId },
      select: {
        majorEventId: true,
        events: { where: { autoSubscribe: true, deletedAt: null }, select: { id: true }, take: 1 },
      },
    });
    const groups = await this.prisma.eventGroupSubscription.findMany({
      where: { eventGroupId: target.targetId, personId: { in: personIds }, deletedAt: null },
      select: { personId: true },
    });
    groups.forEach(({ personId }) => subscribed.add(personId));
    const events = await this.prisma.eventSubscription.findMany({
      where: { personId: { in: personIds }, deletedAt: null, event: { eventGroupId: target.targetId } },
      select: { personId: true },
    });
    events.forEach(({ personId }) => subscribed.add(personId));
    if (group?.majorEventId) {
      if (group.events?.length) {
        return this.addAutomaticSubscribers(subscribed, group.majorEventId, personIds);
      }
      const selections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
        where: {
          deletedAt: null,
          event: { eventGroupId: target.targetId, majorEventId: group.majorEventId },
          subscription: {
            majorEventId: group.majorEventId,
            personId: { in: personIds },
            deletedAt: null,
            subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
          },
        },
        select: { subscription: { select: { personId: true } } },
      });
      selections.forEach(({ subscription }) => subscribed.add(subscription.personId));
    }
    return subscribed;
  }

  private async addAutomaticSubscribers(subscribed: Set<string>, majorEventId: string, personIds: string[]): Promise<Set<string>> {
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId,
        personId: { in: personIds },
        deletedAt: null,
        subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
      },
      select: { personId: true },
    });
    subscriptions.forEach(({ personId }) => subscribed.add(personId));
    return subscribed;
  }

  async convertInterestToSubscription(
    user: AuthenticatedUser | undefined,
    request: ConversionRequest,
  ): Promise<EventInterestConversion> {
    const interestId = request.interestId.trim();
    if (!interestId) {
      throw new BadRequestException('interestId é obrigatório.');
    }

    const interest = await this.prisma.eventInterest.findFirst({
      where: { id: interestId, deletedAt: null },
      select: INTEREST_SELECT,
    });
    if (!interest) {
      throw new NotFoundException('Interesse não encontrado.');
    }

    const target = this.targetFromRecord(interest);
    await this.assertTargetPermission(user, target, Permission.Subscription.Create);
    await this.assertTargetPermission(user, target, Permission.Subscription.Read);

    const actor = user;
    const existing = await this.findExistingSubscription(interest);
    if (!existing) {
      try {
        if (target.targetType === InterestTargetType.MAJOR_EVENT) {
          await this.createMajorEventSubscriptionFromInterest(actor, interest, request);
        } else if (target.targetType === InterestTargetType.EVENT && interest.eventId) {
          const event = await this.prisma.event.findFirst({
            where: { id: interest.eventId, deletedAt: null },
            select: { id: true, majorEventId: true, eventGroupId: true },
          });
          if (!event) {
            throw new NotFoundException('Evento do interesse não encontrado.');
          }

          if (event.majorEventId) {
            await this.createMajorEventSubscriptionFromInterest(actor, interest, {
              ...request,
              selectedEventIds: request.selectedEventIds ?? [event.id],
            });
          } else if (!event.eventGroupId) {
            await this.workspaceSubscriptions.createWorkspaceEventSubscription(
              {
                eventId: event.id,
                personId: interest.personId,
              },
              { req: { user: actor } },
            );
          } else {
            await this.assertEventGroupConversionPermissions(actor, event.eventGroupId);
            await this.frozenResources.assertEventGroupMutable(event.eventGroupId, actor, 'edit');
            await this.eventSubscriptions.subscribeCurrentUserEvent(
              interest.personId,
              event.id,
              actor,
              undefined,
              request.imageLicenseAgreementAccepted,
              {
                createdById: actor?.sub,
                createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
                bypassSubscriptionPolicy: true,
              },
            );
          }
        } else if (interest.eventGroupId) {
          const group = await this.prisma.eventGroup.findFirst({
            where: { id: interest.eventGroupId, deletedAt: null },
            select: { majorEventId: true },
          });
          if (!group) {
            throw new NotFoundException('Grupo de eventos do interesse não encontrado.');
          }

          if (group.majorEventId) {
            const selectedEventIds = request.selectedEventIds ?? [];
            if (selectedEventIds.length === 0) {
              throw new BadRequestException('A conversão do grupo exige atividades selecionadas.');
            }
            await this.createMajorEventSubscriptionFromInterest(actor, interest, {
              ...request,
              selectedEventIds,
            });
          } else {
            await this.assertEventGroupConversionPermissions(actor, interest.eventGroupId);
            await this.frozenResources.assertEventGroupMutable(interest.eventGroupId, actor, 'edit');
            await this.eventSubscriptions.subscribeCurrentUserEventGroup(
              interest.personId,
              interest.eventGroupId,
              actor,
              request.imageLicenseAgreementAccepted,
              {
                createdById: actor?.sub,
                createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
                bypassSubscriptionPolicy: true,
              },
            );
          }
        }
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const persisted = await this.prisma.eventInterest.findUniqueOrThrow({
      where: { id: interest.id },
      select: INTEREST_SELECT,
    });
    const subscription = await this.findExistingSubscription(persisted);
    if (!subscription) {
      throw new BadRequestException('A conversão não criou uma inscrição ativa.');
    }

    await this.publishTargetInvalidations(target);
    return {
      interest: this.toModel(persisted),
      personId: persisted.personId,
      subscriptionId: subscription.subscriptionId,
      eventSubscriptionId: subscription.eventSubscriptionId,
      eventGroupSubscriptionId: subscription.eventGroupSubscriptionId,
      majorEventSubscriptionId: subscription.majorEventSubscriptionId,
      subscriptionStatus: subscription.subscriptionStatus,
    };
  }

  private async createMajorEventSubscriptionFromInterest(
    actor: AuthenticatedUser | undefined,
    interest: EventInterestRecord,
    request: ConversionRequest,
  ): Promise<void> {
    const majorEventId = interest.majorEventId ?? (await this.getMajorEventIdForInterest(interest));
    const selectedEventIds = [...new Set((request.selectedEventIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const existingMajorSubscription = await this.prisma.majorEventSubscription.findFirst({
      where: { majorEventId, personId: interest.personId, deletedAt: null },
      select: { id: true, subscriptionStatus: true },
    });
    if (existingMajorSubscription) {
      await this.assertMajorConversionPermissions(actor, majorEventId, Permission.Subscription.Update);
      const existingSelections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
        where: { subscriptionId: existingMajorSubscription.id, deletedAt: null },
        select: { eventId: true },
      });
      const mergedEventIds = [
        ...new Set([...existingSelections.map(({ eventId }) => eventId), ...selectedEventIds]),
      ];
      if (mergedEventIds.length === 0) {
        return;
      }
      const nextStatus = request.subscriptionStatus
        ?? (this.inactiveMajorSubscriptionStatuses().includes(existingMajorSubscription.subscriptionStatus)
          ? await this.defaultMajorEventStatus(majorEventId, request)
          : existingMajorSubscription.subscriptionStatus);
      await this.workspaceSubscriptions.updateWorkspaceMajorEventSubscription(
        existingMajorSubscription.id,
        {
          selectedEventIds: mergedEventIds,
          subscriptionStatus: nextStatus,
          ...(request.amountPaid != null ? { amountPaid: request.amountPaid } : {}),
          ...(request.paymentDate != null ? { paymentDate: request.paymentDate } : {}),
          ...(request.paymentTier != null ? { paymentTier: request.paymentTier } : {}),
          ...(request.imageLicenseAgreementAccepted != null
            ? { imageLicenseAgreementAccepted: request.imageLicenseAgreementAccepted }
            : {}),
        },
        { req: { user: actor } },
      );
      return;
    }
    if (selectedEventIds.length === 0) {
      throw new BadRequestException('A conversão para grande evento exige pelo menos uma atividade selecionada.');
    }

    await this.assertMajorConversionPermissions(actor, majorEventId, Permission.Subscription.Create);
    await this.workspaceSubscriptions.createWorkspaceMajorEventSubscription(
      {
        majorEventId,
        personId: interest.personId,
        selectedEventIds,
        subscriptionStatus: request.subscriptionStatus ?? (await this.defaultMajorEventStatus(majorEventId, request)),
        amountPaid: request.amountPaid ?? undefined,
        paymentDate: request.paymentDate ?? undefined,
        paymentTier: request.paymentTier ?? undefined,
        imageLicenseAgreementAccepted: request.imageLicenseAgreementAccepted ?? false,
      },
      { req: { user: actor } },
    );
  }

  private async getMajorEventIdForInterest(interest: EventInterestRecord): Promise<string> {
    if (interest.eventId) {
      const event = await this.prisma.event.findUnique({ where: { id: interest.eventId }, select: { majorEventId: true } });
      if (event?.majorEventId) {
        return event.majorEventId;
      }
    }
    if (interest.eventGroupId) {
      const group = await this.prisma.eventGroup.findUnique({ where: { id: interest.eventGroupId }, select: { majorEventId: true } });
      if (group?.majorEventId) {
        return group.majorEventId;
      }
    }
    throw new BadRequestException('O interesse não está associado a um grande evento.');
  }

  private async defaultMajorEventStatus(
    majorEventId: string,
    request: ConversionRequest,
  ): Promise<SubscriptionStatusValue> {
    if (request.subscriptionStatus) {
      return request.subscriptionStatus;
    }
    const majorEvent = await this.prisma.majorEvent.findUnique({
      where: { id: majorEventId },
      select: { isPaymentRequired: true },
    });
    if (!majorEvent?.isPaymentRequired || request.amountPaid === 0) {
      return SubscriptionStatus.CONFIRMED;
    }
    return SubscriptionStatus.WAITING_RECEIPT_UPLOAD;
  }

  private async findExistingSubscription(interest: EventInterestRecord): Promise<{
    subscriptionId: string;
    eventSubscriptionId: string | null;
    eventGroupSubscriptionId: string | null;
    majorEventSubscriptionId: string | null;
    subscriptionStatus: SubscriptionStatusValue | null;
  } | null> {
    if (interest.majorEventId) {
      const subscription = await this.prisma.majorEventSubscription.findFirst({
        where: {
          majorEventId: interest.majorEventId,
          personId: interest.personId,
          deletedAt: null,
          subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
        },
        select: { id: true, subscriptionStatus: true },
      });
      return subscription
        ? {
            subscriptionId: subscription.id,
            eventSubscriptionId: null,
            eventGroupSubscriptionId: null,
            majorEventSubscriptionId: subscription.id,
            subscriptionStatus: subscription.subscriptionStatus as SubscriptionStatusValue,
          }
        : null;
    }

    if (interest.eventId) {
      const event = await this.prisma.event.findUnique({ where: { id: interest.eventId }, select: { majorEventId: true, autoSubscribe: true } });
      if (event?.majorEventId) {
        const eventSubscription = await this.prisma.eventSubscription.findFirst({
          where: { eventId: interest.eventId, personId: interest.personId, deletedAt: null },
          select: { id: true, eventGroupSubscriptionId: true },
        });
        if (eventSubscription) {
          return {
            subscriptionId: eventSubscription.id,
            eventSubscriptionId: eventSubscription.id,
            eventGroupSubscriptionId: eventSubscription.eventGroupSubscriptionId,
            majorEventSubscriptionId: null,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
          };
        }
        if (event.autoSubscribe) {
          return this.findAutomaticSubscription(this.prisma, interest.personId, event.majorEventId);
        }
        const subscription = await this.prisma.majorEventSubscriptionEventSelection.findFirst({
          where: {
            eventId: interest.eventId,
            deletedAt: null,
            subscription: {
              majorEventId: event.majorEventId,
              personId: interest.personId,
              deletedAt: null,
              subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
            },
          },
          select: { subscription: { select: { id: true, subscriptionStatus: true } } },
        });
        return subscription?.subscription
          ? {
              subscriptionId: subscription.subscription.id,
              eventSubscriptionId: null,
              eventGroupSubscriptionId: null,
              majorEventSubscriptionId: subscription.subscription.id,
              subscriptionStatus: subscription.subscription.subscriptionStatus as SubscriptionStatusValue,
            }
          : null;
      }
      const subscription = await this.prisma.eventSubscription.findFirst({
        where: { eventId: interest.eventId, personId: interest.personId, deletedAt: null },
        select: { id: true, eventGroupSubscriptionId: true },
      });
      return subscription
        ? {
            subscriptionId: subscription.id,
            eventSubscriptionId: subscription.id,
            eventGroupSubscriptionId: subscription.eventGroupSubscriptionId,
            majorEventSubscriptionId: null,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
          }
        : null;
    }

    if (interest.eventGroupId) {
      const group = await this.prisma.eventGroup.findUnique({
        where: { id: interest.eventGroupId },
        select: {
          majorEventId: true,
          events: { where: { autoSubscribe: true, deletedAt: null }, select: { id: true }, take: 1 },
        },
      });
      if (group?.majorEventId) {
        const eventSubscription = await this.prisma.eventSubscription.findFirst({
          where: {
            personId: interest.personId,
            deletedAt: null,
            event: { eventGroupId: interest.eventGroupId, majorEventId: group.majorEventId },
          },
          select: { id: true, eventGroupSubscriptionId: true },
        });
        if (eventSubscription) {
          return {
            subscriptionId: eventSubscription.id,
            eventSubscriptionId: eventSubscription.id,
            eventGroupSubscriptionId: eventSubscription.eventGroupSubscriptionId,
            majorEventSubscriptionId: null,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
          };
        }
        if (group.events?.length) {
          return this.findAutomaticSubscription(this.prisma, interest.personId, group.majorEventId);
        }
        const subscription = await this.prisma.majorEventSubscriptionEventSelection.findFirst({
          where: {
            deletedAt: null,
            event: { eventGroupId: interest.eventGroupId, majorEventId: group.majorEventId },
            subscription: {
              majorEventId: group.majorEventId,
              personId: interest.personId,
              deletedAt: null,
              subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
            },
          },
          select: { subscription: { select: { id: true, subscriptionStatus: true } } },
        });
        return subscription?.subscription
          ? {
              subscriptionId: subscription.subscription.id,
              eventSubscriptionId: null,
              eventGroupSubscriptionId: null,
              majorEventSubscriptionId: subscription.subscription.id,
              subscriptionStatus: subscription.subscription.subscriptionStatus as SubscriptionStatusValue,
            }
          : null;
      }
      const subscription = await this.prisma.eventGroupSubscription.findFirst({
        where: { eventGroupId: interest.eventGroupId, personId: interest.personId, deletedAt: null },
        select: { id: true },
      });
      return subscription
        ? {
            subscriptionId: subscription.id,
            eventSubscriptionId: null,
            eventGroupSubscriptionId: subscription.id,
            majorEventSubscriptionId: null,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
          }
        : null;
    }

    return null;
  }

  private async assertTargetPermission(
    user: AuthenticatedUser | undefined,
    target: InterestTarget,
    permission: Permission,
  ): Promise<void> {
    const targetPermission = this.permissionForTarget(target.targetType);
    await this.authorizationPolicy.assertPermissions(user, [permission, targetPermission], this.resourceContext(target));
  }

  private async assertEventGroupConversionPermissions(
    user: AuthenticatedUser | undefined,
    eventGroupId: string,
  ): Promise<void> {
    await this.authorizationPolicy.assertPermissions(
      user,
      [Permission.Subscription.Create, Permission.EventGroup.Read],
      { eventGroupId },
    );
  }

  private async assertMajorConversionPermissions(
    user: AuthenticatedUser | undefined,
    majorEventId: string,
    subscriptionPermission: typeof Permission.Subscription.Create | typeof Permission.Subscription.Update,
  ): Promise<void> {
    await this.authorizationPolicy.assertPermissions(
      user,
      [subscriptionPermission, Permission.Event.Read, Permission.MajorEvent.Read],
      { majorEventId },
    );
  }

  private permissionForTarget(targetType: InterestTargetTypeValue): TargetPermission {
    switch (targetType) {
      case InterestTargetType.EVENT:
        return Permission.Event.Read;
      case InterestTargetType.EVENT_GROUP:
        return Permission.EventGroup.Read;
      case InterestTargetType.MAJOR_EVENT:
        return Permission.MajorEvent.Read;
    }
  }

  private resourceContext(target: InterestTarget): {
    eventId?: string;
    eventGroupId?: string;
    majorEventId?: string;
  } {
    switch (target.targetType) {
      case InterestTargetType.EVENT:
        return { eventId: target.targetId };
      case InterestTargetType.EVENT_GROUP:
        return { eventGroupId: target.targetId };
      case InterestTargetType.MAJOR_EVENT:
        return { majorEventId: target.targetId };
    }
  }

  private async requirePublicTarget(
    tx: PrismaExecutor,
    target: InterestTarget,
    requireInterestEnabled: boolean,
  ): Promise<{ id: string } | null> {
    const now = new Date();
    const futureOnly = requireInterestEnabled ? { endDate: { gt: now } } : {};
    const enabled = requireInterestEnabled ? { interestEnabled: true } : {};
    switch (target.targetType) {
      case InterestTargetType.EVENT:
        return tx.event.findFirst({
          where: { AND: [PUBLIC_EVENT_WHERE, { id: target.targetId, ...futureOnly, ...enabled }] },
          select: { id: true },
        });
      case InterestTargetType.EVENT_GROUP:
        return tx.eventGroup.findFirst({
          where: {
            id: target.targetId,
            deletedAt: null,
            ...enabled,
            events: { some: { AND: [PUBLIC_EVENT_WHERE, futureOnly] } },
          },
          select: { id: true },
        });
      case InterestTargetType.MAJOR_EVENT:
        return tx.majorEvent.findFirst({
          where: { AND: [PUBLIC_MAJOR_EVENT_WHERE, { id: target.targetId, ...futureOnly, ...enabled }] },
          select: { id: true },
        });
    }
  }

  private async findInterestTargetState(
    tx: PrismaExecutor,
    target: InterestTarget,
  ): Promise<{ interestEnabled: boolean; endsAt: Date } | null> {
    switch (target.targetType) {
      case InterestTargetType.EVENT: {
        const event = await tx.event.findFirst({
          where: { AND: [PUBLIC_EVENT_WHERE, { id: target.targetId }] },
          select: { interestEnabled: true, endDate: true },
        });
        return event ? { interestEnabled: event.interestEnabled, endsAt: event.endDate } : null;
      }
      case InterestTargetType.EVENT_GROUP: {
        const group = await tx.eventGroup.findFirst({
          where: {
            id: target.targetId,
            deletedAt: null,
            events: { some: { AND: [PUBLIC_EVENT_WHERE] } },
          },
          select: {
            interestEnabled: true,
            events: {
              where: { AND: [PUBLIC_EVENT_WHERE] },
              select: { endDate: true },
            },
          },
        });
        if (!group || group.events.length === 0) {
          return null;
        }
        return {
          interestEnabled: group.interestEnabled,
          endsAt: group.events.reduce(
            (latest, event) => (event.endDate > latest ? event.endDate : latest),
            group.events[0].endDate,
          ),
        };
      }
      case InterestTargetType.MAJOR_EVENT: {
        const majorEvent = await tx.majorEvent.findFirst({
          where: { ...PUBLIC_MAJOR_EVENT_WHERE, id: target.targetId },
          select: { interestEnabled: true, endDate: true },
        });
        return majorEvent ? { interestEnabled: majorEvent.interestEnabled, endsAt: majorEvent.endDate } : null;
      }
    }
  }

  private async hasActiveSubscription(
    tx: PrismaExecutor,
    personId: string,
    target: InterestTarget,
  ): Promise<boolean> {
    switch (target.targetType) {
      case InterestTargetType.EVENT: {
        const event = await tx.event.findUnique({ where: { id: target.targetId }, select: { majorEventId: true, autoSubscribe: true } });
        if (!event) {
          return false;
        }
        const directSubscription = await tx.eventSubscription.findFirst({
          where: { eventId: target.targetId, personId, deletedAt: null },
          select: { id: true },
        });
        if (directSubscription) {
          return true;
        }
        if (!event.majorEventId) {
          return false;
        }
        if (event.autoSubscribe) {
          return Boolean(await this.findAutomaticSubscription(tx, personId, event.majorEventId));
        }
        return Boolean(
          await tx.majorEventSubscriptionEventSelection.findFirst({
            where: {
              eventId: target.targetId,
              deletedAt: null,
              subscription: {
                majorEventId: event.majorEventId,
                personId,
                deletedAt: null,
                subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
              },
            },
            select: { id: true },
          }),
        );
      }
      case InterestTargetType.EVENT_GROUP: {
        const group = await tx.eventGroup.findUnique({
          where: { id: target.targetId },
          select: {
            majorEventId: true,
            events: { where: { autoSubscribe: true, deletedAt: null }, select: { id: true }, take: 1 },
          },
        });
        const directSubscription = await tx.eventSubscription.findFirst({
          where: { personId, deletedAt: null, event: { eventGroupId: target.targetId } },
          select: { id: true },
        });
        if (directSubscription) {
          return true;
        }
        if (group?.majorEventId) {
          if (group.events?.length) {
            return Boolean(await this.findAutomaticSubscription(tx, personId, group.majorEventId));
          }
          return Boolean(
            await tx.majorEventSubscriptionEventSelection.findFirst({
              where: {
                deletedAt: null,
                event: { eventGroupId: target.targetId, majorEventId: group.majorEventId },
                subscription: {
                  majorEventId: group.majorEventId,
                  personId,
                  deletedAt: null,
                  subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
                },
              },
              select: { id: true },
            }),
          );
        }
        return Boolean(
          await tx.eventGroupSubscription.findFirst({
            where: { eventGroupId: target.targetId, personId, deletedAt: null },
            select: { id: true },
          }),
        );
      }
      case InterestTargetType.MAJOR_EVENT:
        return Boolean(
          await tx.majorEventSubscription.findFirst({
            where: {
              majorEventId: target.targetId,
              personId,
              deletedAt: null,
              subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
            },
            select: { id: true },
          }),
        );
    }
  }

  private async findAutomaticSubscription(tx: PrismaExecutor, personId: string, majorEventId: string) {
    const subscription = await tx.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId,
        deletedAt: null,
        subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
      },
      select: { id: true, subscriptionStatus: true },
    });
    return subscription
      ? {
          subscriptionId: subscription.id,
          eventSubscriptionId: null,
          eventGroupSubscriptionId: null,
          majorEventSubscriptionId: subscription.id,
          subscriptionStatus: subscription.subscriptionStatus as SubscriptionStatusValue,
        }
      : null;
  }

  private inactiveMajorSubscriptionStatuses(): SubscriptionStatus[] {
    return Object.values(SubscriptionStatus).filter(
      (status) =>
        !ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES.includes(
          status as (typeof ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES)[number],
        ),
    );
  }

  private normalizeTarget(targetType: InterestTargetTypeValue, targetId: string): InterestTarget {
    if (!Object.values(InterestTargetType).includes(targetType)) {
      throw new BadRequestException('Tipo de interesse inválido.');
    }
    const normalizedId = targetId.trim();
    if (!normalizedId) {
      throw new BadRequestException('targetId é obrigatório.');
    }
    return { targetType, targetId: normalizedId };
  }

  private targetWhere(target: InterestTarget): Prisma.EventInterestWhereInput {
    switch (target.targetType) {
      case InterestTargetType.EVENT:
        return { eventId: target.targetId };
      case InterestTargetType.EVENT_GROUP:
        return { eventGroupId: target.targetId };
      case InterestTargetType.MAJOR_EVENT:
        return { majorEventId: target.targetId };
    }
  }

  private targetCreateData(target: InterestTarget): Pick<
    Prisma.EventInterestUncheckedCreateInput,
    'eventId' | 'eventGroupId' | 'majorEventId'
  > {
    switch (target.targetType) {
      case InterestTargetType.EVENT:
        return { eventId: target.targetId };
      case InterestTargetType.EVENT_GROUP:
        return { eventGroupId: target.targetId };
      case InterestTargetType.MAJOR_EVENT:
        return { majorEventId: target.targetId };
    }
  }

  private targetFromRecord(record: EventInterestRecord): InterestTarget {
    if (record.eventId) {
      return { targetType: InterestTargetType.EVENT, targetId: record.eventId };
    }
    if (record.eventGroupId) {
      return { targetType: InterestTargetType.EVENT_GROUP, targetId: record.eventGroupId };
    }
    if (record.majorEventId) {
      return { targetType: InterestTargetType.MAJOR_EVENT, targetId: record.majorEventId };
    }
    throw new BadRequestException('Interesse sem alvo válido.');
  }

  private toModel(record: EventInterestRecord): EventInterest {
    const target = this.targetFromRecord(record);
    const person: EventInterestPerson | null = record.person
      ? {
          id: record.person.id,
          name: record.person.name,
          email: record.person.email,
        }
      : null;
    return {
      id: record.id,
      personId: record.personId,
      person,
      targetType: target.targetType,
      targetId: target.targetId,
      eventId: record.eventId,
      eventGroupId: record.eventGroupId,
      majorEventId: record.majorEventId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdById: record.createdById,
    };
  }

  private async lockTargetPerson(tx: Prisma.TransactionClient, personId: string, target: InterestTarget): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-interest:${target.targetType}:${target.targetId}:${personId}`}, 0))`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
