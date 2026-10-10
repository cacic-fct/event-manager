import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import { eventAttendanceEligibility } from '../events/attendance-eligibility';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import {
  ANONYMOUS_AUDIENCE,
  audienceContext,
  eventAudienceWhere,
  groupAudienceWhere,
  majorEventAudienceWhere,
} from './audience-context';
import { EventAudienceService } from './event-audience.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';

export type AudienceInvitationTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

export type AudienceInvitationTarget = {
  targetType: AudienceInvitationTargetType;
  targetId: string;
};

export type AudienceInvitationNotificationTarget = {
  type: AudienceInvitationTargetType;
  id: string;
  name: string;
  actionUrl?: string;
};

export type AudienceInvitationPerson = {
  personId: string;
  person: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    userId?: string | null;
    user?: { id: string; email: string; name: string } | null;
  };
};

export type AudienceInvitationSyncResult = {
  invitations: AudienceInvitationPerson[];
  addedPersonIds: string[];
  removedPersonIds: string[];
};

export type EventInvitationFacts = {
  event: boolean;
  eventGroup: boolean;
  majorEvent: boolean;
};

type AudienceExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;
const MAX_INVITATION_PERSONS = 1_000;
const NOTIFICATION_CONCURRENCY = 10;
const PENDING_NOTIFICATION_LIMIT = 100;
const PENDING_NOTIFICATION_PER_TARGET = Math.ceil(PENDING_NOTIFICATION_LIMIT / 3);
const NOTIFICATION_RETRY_BACKOFF_MS = 5 * 60 * 1_000;
const NOTIFICATION_RECONCILE_INTERVAL_MS = 60 * 1_000;

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.PeopleSelect;

const NOTIFICATION_PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userId: true,
  user: { select: { id: true, email: true, name: true } },
} satisfies Prisma.PeopleSelect;

type NotificationPerson = Prisma.PeopleGetPayload<{ select: typeof NOTIFICATION_PERSON_SELECT }>;

type AudienceInvitationDeliveryRecord = {
  personId: string;
  person: NotificationPerson;
  createdAt: Date;
  notifiedAt: Date | null;
  notificationAttemptedAt: Date | null;
};

type PendingAudienceInvitation = AudienceInvitationDeliveryRecord & {
  target: AudienceInvitationTarget;
  targetName: string;
};

const INVITATION_PERSON_SELECT = {
  personId: true,
  person: { select: PERSON_SELECT },
} satisfies Prisma.EventAudienceInvitationSelect;

const EVENT_GROUP_INVITATION_PERSON_SELECT = {
  personId: true,
  person: { select: PERSON_SELECT },
} satisfies Prisma.EventGroupAudienceInvitationSelect;

const MAJOR_EVENT_INVITATION_PERSON_SELECT = {
  personId: true,
  person: { select: PERSON_SELECT },
} satisfies Prisma.MajorEventAudienceInvitationSelect;

/**
 * Stores target invitations independently from the target's audience setting.
 * The resolver owns the target update and audit entry; this service only
 * validates people, applies the delta, and exposes invitation facts to policy
 * and attendance code.
 */
@Injectable()
export class AudienceInvitationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AudienceInvitationService.name);
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private reconcileInFlight?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NovuNotificationsService,
    @Optional() private readonly audiences?: EventAudienceService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.notifications) {
      return;
    }

    this.reconcileTimer = setInterval(() => {
      void this.retryPendingNotifications();
    }, NOTIFICATION_RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
  }

  async replaceInvitations(
    target: AudienceInvitationTarget,
    personIds: readonly string[],
    createdById?: string | null,
    tx: AudienceExecutor = this.prisma,
  ): Promise<AudienceInvitationSyncResult> {
    const normalizedTarget = this.normalizeTarget(target);
    const requestedPersonIds = this.normalizePersonIds(personIds);
    await this.assertTargetExists(normalizedTarget, tx);

    const people = requestedPersonIds.length
      ? await tx.people.findMany({
          where: {
            id: { in: requestedPersonIds },
            deletedAt: null,
            mergedIntoId: null,
          },
          select: { id: true },
        })
      : [];
    const foundPersonIds = new Set(people.map((person) => person.id));
    const missingPersonIds = requestedPersonIds.filter((personId) => !foundPersonIds.has(personId));
    if (missingPersonIds.length > 0) {
      throw new BadRequestException(`People were not found or are inactive: ${missingPersonIds.join(', ')}.`);
    }

    const existing = await this.listInvitations(normalizedTarget, tx);
    const existingPersonIds = new Set(existing.map((invitation) => invitation.personId));
    const requestedPersonIdSet = new Set(requestedPersonIds);
    const addedPersonIds = requestedPersonIds.filter((personId) => !existingPersonIds.has(personId));
    const removedPersonIds = existing
      .map((invitation) => invitation.personId)
      .filter((personId) => !requestedPersonIdSet.has(personId));

    if (removedPersonIds.length > 0) {
      await this.deleteInvitations(normalizedTarget, removedPersonIds, tx);
    }
    if (addedPersonIds.length > 0) {
      await this.createInvitations(normalizedTarget, addedPersonIds, createdById, tx);
    }

    return {
      invitations: await this.listInvitations(normalizedTarget, tx),
      addedPersonIds,
      removedPersonIds,
    };
  }

  /**
   * Resolver-friendly delta API. An omitted list preserves the existing
   * invitations; an empty list removes all invitations. The caller keeps the
   * surrounding target mutation, audit entry, and transaction boundary.
   */
  async synchronize(
    tx: AudienceExecutor,
    target: { type: AudienceInvitationTargetType; id: string },
    personIds: readonly string[] | undefined,
    actorId?: string,
  ): Promise<string[]> {
    if (personIds === undefined) {
      return [];
    }

    const result = await this.replaceInvitations(
      { targetType: target.type, targetId: target.id },
      personIds,
      actorId,
      tx,
    );
    return result.addedPersonIds;
  }

  /**
   * Sends one deterministic Novu transaction per newly added recipient. This
   * method is intentionally post-commit: a provider outage must never roll
   * back an invitation that has already been persisted.
   */
  async notifyInvited(
    target: AudienceInvitationNotificationTarget,
    personIds: readonly string[],
  ): Promise<void> {
    if (!this.notifications || personIds.length === 0) {
      return;
    }

    const normalizedTarget = this.normalizeNotificationTarget(target);
    const invitationTarget: AudienceInvitationTarget = {
      targetType: normalizedTarget.type,
      targetId: normalizedTarget.id,
    };
    const normalizedPersonIds = this.normalizePersonIds(personIds);
    if (normalizedPersonIds.length === 0) {
      return;
    }

    let invitationRecords: AudienceInvitationDeliveryRecord[];
    try {
      invitationRecords = await audienceContext.run(
        { ...ANONYMOUS_AUDIENCE, bypass: true },
        () => this.listInvitationDeliveryRecords(invitationTarget, normalizedPersonIds),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Audience invitation notification lookup failed target=${normalizedTarget.type}:${normalizedTarget.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
    const principalCache = new Map<string, Promise<import('./audience-context').EventAudiencePrincipal>>();

    for (let offset = 0; offset < invitationRecords.length; offset += NOTIFICATION_CONCURRENCY) {
      const batch = invitationRecords.slice(offset, offset + NOTIFICATION_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (invitation) => {
          await this.deliverInvitation(
            {
              ...invitation,
              target: invitationTarget,
              targetName: normalizedTarget.name,
            },
            normalizedTarget.actionUrl,
            principalCache,
          );
        }),
      );
    }
  }

  async retryPendingNotifications(): Promise<void> {
    if (!this.notifications || this.reconcileInFlight) {
      return this.reconcileInFlight ?? Promise.resolve();
    }

    this.reconcileInFlight = this.reconcilePendingNotifications();
    try {
      await this.reconcileInFlight;
    } finally {
      this.reconcileInFlight = undefined;
    }
  }

  private async reconcilePendingNotifications(): Promise<void> {
    try {
      const pending = await this.loadPendingNotifications();
      const principalCache = new Map<string, Promise<import('./audience-context').EventAudiencePrincipal>>();
      for (let offset = 0; offset < pending.length; offset += NOTIFICATION_CONCURRENCY) {
        const batch = pending.slice(offset, offset + NOTIFICATION_CONCURRENCY);
        await Promise.allSettled(batch.map((invitation) => this.deliverInvitation(invitation, undefined, principalCache)));
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Audience invitation notification reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadPendingNotifications(): Promise<PendingAudienceInvitation[]> {
    const now = new Date();
    const retryBefore = new Date(now.getTime() - NOTIFICATION_RETRY_BACKOFF_MS);
    const pendingWhere = {
      notifiedAt: null,
      OR: [{ notificationAttemptedAt: null }, { notificationAttemptedAt: { lte: retryBefore } }],
    };

    const pending = await audienceContext.run(
      { ...ANONYMOUS_AUDIENCE, bypass: true },
      async () => {
        const [events, groups, majors] = await Promise.all([
          this.prisma.eventAudienceInvitation.findMany({
            where: {
              ...pendingWhere,
              event: {
                audience: 'INVITATION_ONLY',
                deletedAt: null,
                publicationState: 'PUBLISHED',
              },
            },
            select: {
              eventId: true,
              personId: true,
              createdAt: true,
              notifiedAt: true,
              notificationAttemptedAt: true,
              person: { select: NOTIFICATION_PERSON_SELECT },
              event: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: PENDING_NOTIFICATION_PER_TARGET,
          }),
          this.prisma.eventGroupAudienceInvitation.findMany({
            where: {
              ...pendingWhere,
              eventGroup: {
                audience: 'INVITATION_ONLY',
                deletedAt: null,
                events: { some: { deletedAt: null, publicationState: 'PUBLISHED' } },
                OR: [
                  { majorEventId: null },
                  { majorEvent: { deletedAt: null, publicationState: 'PUBLISHED' } },
                ],
              },
            },
            select: {
              eventGroupId: true,
              personId: true,
              createdAt: true,
              notifiedAt: true,
              notificationAttemptedAt: true,
              person: { select: NOTIFICATION_PERSON_SELECT },
              eventGroup: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: PENDING_NOTIFICATION_PER_TARGET,
          }),
          this.prisma.majorEventAudienceInvitation.findMany({
            where: {
              ...pendingWhere,
              majorEvent: {
                audience: 'INVITATION_ONLY',
                deletedAt: null,
                publicationState: 'PUBLISHED',
              },
            },
            select: {
              majorEventId: true,
              personId: true,
              createdAt: true,
              notifiedAt: true,
              notificationAttemptedAt: true,
              person: { select: NOTIFICATION_PERSON_SELECT },
              majorEvent: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: PENDING_NOTIFICATION_PER_TARGET,
          }),
        ]);

        return [
          ...events.map((invitation) => ({
            personId: invitation.personId,
            person: invitation.person,
            createdAt: invitation.createdAt,
            notifiedAt: invitation.notifiedAt,
            notificationAttemptedAt: invitation.notificationAttemptedAt,
            target: { targetType: 'EVENT' as const, targetId: invitation.eventId },
            targetName: invitation.event.name,
          })),
          ...groups.map((invitation) => ({
            personId: invitation.personId,
            person: invitation.person,
            createdAt: invitation.createdAt,
            notifiedAt: invitation.notifiedAt,
            notificationAttemptedAt: invitation.notificationAttemptedAt,
            target: { targetType: 'EVENT_GROUP' as const, targetId: invitation.eventGroupId },
            targetName: invitation.eventGroup.name,
          })),
          ...majors.map((invitation) => ({
            personId: invitation.personId,
            person: invitation.person,
            createdAt: invitation.createdAt,
            notifiedAt: invitation.notifiedAt,
            notificationAttemptedAt: invitation.notificationAttemptedAt,
            target: { targetType: 'MAJOR_EVENT' as const, targetId: invitation.majorEventId },
            targetName: invitation.majorEvent.name,
          })),
        ]
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .slice(0, PENDING_NOTIFICATION_LIMIT);
      },
    );
    return pending;
  }

  private async deliverInvitation(
    invitation: PendingAudienceInvitation,
    actionUrl?: string,
    principalCache?: Map<string, Promise<import('./audience-context').EventAudiencePrincipal>>,
  ): Promise<void> {
    const audiences = this.audiences;
    if (invitation.notifiedAt || !this.notifications || !audiences) {
      return;
    }

    const attemptedAt = new Date();
    if (!(await this.claimNotification(invitation.target, invitation.personId, invitation.createdAt, attemptedAt))) {
      return;
    }

    let visible = false;
    let resolvedActionUrl = actionUrl;
    try {
      const userId = invitation.person.userId;
      const principal = userId
        ? await this.cachedStoredPrincipal(userId, audiences, principalCache)
        : { ...ANONYMOUS_AUDIENCE, personIds: [invitation.personId] };
      visible = await this.isVisibleToPrincipal(invitation.target, principal);
      if (visible && invitation.target.targetType === 'EVENT_GROUP' && !resolvedActionUrl) {
        const event = await audienceContext.run(principal, async () => this.prisma.event.findFirst({
          where: { AND: [{ eventGroupId: invitation.target.targetId }, PUBLIC_EVENT_WHERE, eventAudienceWhere(principal)] },
          select: { id: true },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        }));
        visible = Boolean(event);
        if (event) resolvedActionUrl = `/event/${encodeURIComponent(event.id)}`;
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Audience invitation eligibility lookup failed target=${invitation.target.targetType}:${invitation.target.targetId} person=${invitation.personId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!visible) return;

    try {
      const delivered = await this.notifications.notifyAudienceInvitation({
        targetType: invitation.target.targetType,
        targetId: invitation.target.targetId,
        targetName: invitation.targetName,
        actionUrl: resolvedActionUrl ?? defaultAudienceActionUrl({ type: invitation.target.targetType, id: invitation.target.targetId, name: invitation.targetName }),
        recipient: this.notifications.mapPersonToRecipient(invitation.person),
        invitationCreatedAt: invitation.createdAt,
      });
      if (delivered) {
        await this.markNotificationDelivered(invitation.target, invitation.personId, invitation.createdAt, attemptedAt);
      } else {
        this.logger.warn(
          `Audience invitation notification was not acknowledged target=${invitation.target.targetType}:${invitation.target.targetId} person=${invitation.personId}.`,
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Audience invitation notification failed target=${invitation.target.targetType}:${invitation.target.targetId} person=${invitation.personId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async cachedStoredPrincipal(
    userId: string,
    audiences: EventAudienceService,
    principalCache?: Map<string, Promise<import('./audience-context').EventAudiencePrincipal>>,
  ): Promise<import('./audience-context').EventAudiencePrincipal> {
    if (!principalCache) {
      return audiences.principalForStoredUser(userId);
    }

    const cached = principalCache.get(userId);
    if (cached) {
      return cached;
    }

    const principal = audiences.principalForStoredUser(userId);
    principalCache.set(userId, principal);
    return principal;
  }

  private async claimNotification(
    target: AudienceInvitationTarget,
    personId: string,
    createdAt: Date,
    attemptedAt: Date,
  ): Promise<boolean> {
    const retryBefore = new Date(attemptedAt.getTime() - NOTIFICATION_RETRY_BACKOFF_MS);
    const where = {
      notifiedAt: null,
      OR: [{ notificationAttemptedAt: null }, { notificationAttemptedAt: { lte: retryBefore } }],
    };
    const updated = await audienceContext.run(
      { ...ANONYMOUS_AUDIENCE, bypass: true },
      async () => {
        switch (target.targetType) {
          case 'EVENT':
            return this.prisma.eventAudienceInvitation.updateMany({
              where: {
                ...where,
                eventId: target.targetId,
                personId,
                createdAt,
              },
              data: { notificationAttemptedAt: attemptedAt },
            });
          case 'EVENT_GROUP':
            return this.prisma.eventGroupAudienceInvitation.updateMany({
              where: {
                ...where,
                eventGroupId: target.targetId,
                personId,
                createdAt,
              },
              data: { notificationAttemptedAt: attemptedAt },
            });
          case 'MAJOR_EVENT':
            return this.prisma.majorEventAudienceInvitation.updateMany({
              where: {
                ...where,
                majorEventId: target.targetId,
                personId,
                createdAt,
              },
              data: { notificationAttemptedAt: attemptedAt },
            });
        }
      },
    );
    return updated.count === 1;
  }

  private async markNotificationDelivered(
    target: AudienceInvitationTarget,
    personId: string,
    createdAt: Date,
    attemptedAt: Date,
  ): Promise<void> {
    await audienceContext.run(
      { ...ANONYMOUS_AUDIENCE, bypass: true },
      async () => {
        switch (target.targetType) {
          case 'EVENT':
            await this.prisma.eventAudienceInvitation.updateMany({
              where: {
                eventId: target.targetId,
                personId,
                createdAt,
                notifiedAt: null,
                notificationAttemptedAt: attemptedAt,
              },
              data: { notifiedAt: new Date() },
            });
            return;
          case 'EVENT_GROUP':
            await this.prisma.eventGroupAudienceInvitation.updateMany({
              where: {
                eventGroupId: target.targetId,
                personId,
                createdAt,
                notifiedAt: null,
                notificationAttemptedAt: attemptedAt,
              },
              data: { notifiedAt: new Date() },
            });
            return;
          case 'MAJOR_EVENT':
            await this.prisma.majorEventAudienceInvitation.updateMany({
              where: {
                majorEventId: target.targetId,
                personId,
                createdAt,
                notifiedAt: null,
                notificationAttemptedAt: attemptedAt,
              },
              data: { notifiedAt: new Date() },
            });
            return;
        }
      },
    );
  }

  private async listInvitationDeliveryRecords(
    target: AudienceInvitationTarget,
    personIds: readonly string[],
  ): Promise<AudienceInvitationDeliveryRecord[]> {
    const wherePersonIds = [...personIds];
    switch (target.targetType) {
      case 'EVENT':
        return this.prisma.eventAudienceInvitation.findMany({
          where: { eventId: target.targetId, personId: { in: wherePersonIds } },
          select: {
            personId: true,
            createdAt: true,
            notifiedAt: true,
            notificationAttemptedAt: true,
            person: { select: NOTIFICATION_PERSON_SELECT },
          },
        });
      case 'EVENT_GROUP':
        return this.prisma.eventGroupAudienceInvitation.findMany({
          where: { eventGroupId: target.targetId, personId: { in: wherePersonIds } },
          select: {
            personId: true,
            createdAt: true,
            notifiedAt: true,
            notificationAttemptedAt: true,
            person: { select: NOTIFICATION_PERSON_SELECT },
          },
        });
      case 'MAJOR_EVENT':
        return this.prisma.majorEventAudienceInvitation.findMany({
          where: { majorEventId: target.targetId, personId: { in: wherePersonIds } },
          select: {
            personId: true,
            createdAt: true,
            notifiedAt: true,
            notificationAttemptedAt: true,
            person: { select: NOTIFICATION_PERSON_SELECT },
          },
        });
    }
  }

  private async isVisibleToPrincipal(
    target: AudienceInvitationTarget,
    principal: import('./audience-context').EventAudiencePrincipal,
  ): Promise<boolean> {
    return audienceContext.run(principal, async () => {
      switch (target.targetType) {
        case 'EVENT':
          return Boolean(
            await this.prisma.event.findFirst({
              where: {
                AND: [{ id: target.targetId }, PUBLIC_EVENT_WHERE, eventAudienceWhere(principal)],
              },
              select: { id: true },
            }),
          );
        case 'EVENT_GROUP':
          return Boolean(
            await this.prisma.eventGroup.findFirst({
              where: {
                AND: [
                  {
                    id: target.targetId,
                    deletedAt: null,
                    events: {
                      some: {
                        deletedAt: null,
                        publicationState: 'PUBLISHED',
                        AND: [PUBLIC_EVENT_WHERE, eventAudienceWhere(principal)],
                      },
                    },
                    OR: [
                      { majorEventId: null },
                      { majorEvent: { deletedAt: null, publicationState: 'PUBLISHED' } },
                    ],
                  },
                  groupAudienceWhere(principal),
                ],
              },
              select: { id: true },
            }),
          );
        case 'MAJOR_EVENT':
          return Boolean(
            await this.prisma.majorEvent.findFirst({
              where: {
                AND: [{ id: target.targetId, deletedAt: null, publicationState: 'PUBLISHED' }, majorEventAudienceWhere(principal)],
              },
              select: { id: true },
            }),
          );
      }
    });
  }

  async listInvitations(
    target: AudienceInvitationTarget,
    tx: AudienceExecutor = this.prisma,
  ): Promise<AudienceInvitationPerson[]> {
    const normalizedTarget = this.normalizeTarget(target);
    switch (normalizedTarget.targetType) {
      case 'EVENT':
        return tx.eventAudienceInvitation.findMany({
          where: { eventId: normalizedTarget.targetId },
          select: INVITATION_PERSON_SELECT,
          orderBy: { person: { name: 'asc' } },
        });
      case 'EVENT_GROUP':
        return tx.eventGroupAudienceInvitation.findMany({
          where: { eventGroupId: normalizedTarget.targetId },
          select: EVENT_GROUP_INVITATION_PERSON_SELECT,
          orderBy: { person: { name: 'asc' } },
        });
      case 'MAJOR_EVENT':
        return tx.majorEventAudienceInvitation.findMany({
          where: { majorEventId: normalizedTarget.targetId },
          select: MAJOR_EVENT_INVITATION_PERSON_SELECT,
          orderBy: { person: { name: 'asc' } },
        });
    }
  }

  async isInvited(
    target: AudienceInvitationTarget,
    personId: string,
    tx: AudienceExecutor = this.prisma,
  ): Promise<boolean> {
    const normalizedTarget = this.normalizeTarget(target);
    const normalizedPersonId = this.normalizePersonId(personId);
    if (!normalizedPersonId) {
      return false;
    }

    switch (normalizedTarget.targetType) {
      case 'EVENT':
        return Boolean(
          await tx.eventAudienceInvitation.findUnique({
            where: { eventId_personId: { eventId: normalizedTarget.targetId, personId: normalizedPersonId } },
            select: { personId: true },
          }),
        );
      case 'EVENT_GROUP':
        return Boolean(
          await tx.eventGroupAudienceInvitation.findUnique({
            where: {
              eventGroupId_personId: {
                eventGroupId: normalizedTarget.targetId,
                personId: normalizedPersonId,
              },
            },
            select: { personId: true },
          }),
        );
      case 'MAJOR_EVENT':
        return Boolean(
          await tx.majorEventAudienceInvitation.findUnique({
            where: {
              majorEventId_personId: {
                majorEventId: normalizedTarget.targetId,
                personId: normalizedPersonId,
              },
            },
            select: { personId: true },
          }),
        );
    }
  }

  /**
   * Loads all three invitation scopes in one batch. Callers decide whether a
   * policy requires one scope or all ancestor scopes; this method intentionally
   * does not collapse them into an OR result.
   */
  async getEventInvitationFacts(
    events: readonly {
      id: string;
      eventGroupId?: string | null;
      majorEventId?: string | null;
      eventGroup?: unknown;
      majorEvent?: unknown;
    }[],
    personIds: readonly string[],
    tx: AudienceExecutor = this.prisma,
  ): Promise<Map<string, EventInvitationFacts>> {
    const normalizedEvents = events.filter((event) => Boolean(event.id));
    const normalizedPersonIds = this.normalizePersonIds(personIds);
    if (normalizedEvents.length === 0 || normalizedPersonIds.length === 0) {
      return new Map();
    }

    const eventIds = [...new Set(normalizedEvents.map((event) => event.id))];
    const groupIds = [
      ...new Set(
        normalizedEvents.flatMap((event) =>
          event.eventGroupId && hasActiveRelation(event.eventGroup)
            ? [event.eventGroupId]
            : [],
        ),
      ),
    ];
    const majorEventIds = [
      ...new Set(
        normalizedEvents.flatMap((event) =>
          event.majorEventId && hasActiveRelation(event.majorEvent)
            ? [event.majorEventId]
            : [],
        ),
      ),
    ];
    const [eventInvitations, groupInvitations, majorEventInvitations] = await Promise.all([
      tx.eventAudienceInvitation.findMany({
        where: { eventId: { in: eventIds }, personId: { in: normalizedPersonIds } },
        select: { eventId: true, personId: true },
      }),
      groupIds.length
        ? tx.eventGroupAudienceInvitation.findMany({
            where: { eventGroupId: { in: groupIds }, personId: { in: normalizedPersonIds } },
            select: { eventGroupId: true, personId: true },
          })
        : Promise.resolve([] as Array<{ eventGroupId: string; personId: string }>),
      majorEventIds.length
        ? tx.majorEventAudienceInvitation.findMany({
            where: { majorEventId: { in: majorEventIds }, personId: { in: normalizedPersonIds } },
            select: { majorEventId: true, personId: true },
          })
        : Promise.resolve([] as Array<{ majorEventId: string; personId: string }>),
    ]);

    const eventKeys = new Set(eventInvitations.map((invitation) => `${invitation.eventId}:${invitation.personId}`));
    const groupKeys = new Set(groupInvitations.map((invitation) => `${invitation.eventGroupId}:${invitation.personId}`));
    const majorEventKeys = new Set(
      majorEventInvitations.map((invitation) => `${invitation.majorEventId}:${invitation.personId}`),
    );
    const facts = new Map<string, EventInvitationFacts>();
    for (const event of normalizedEvents) {
      for (const personId of normalizedPersonIds) {
        facts.set(`${personId}:${event.id}`, {
          event: eventKeys.has(`${event.id}:${personId}`),
          eventGroup: Boolean(
            event.eventGroupId && hasActiveRelation(event.eventGroup) &&
              groupKeys.has(`${event.eventGroupId}:${personId}`),
          ),
          majorEvent: Boolean(
            event.majorEventId && hasActiveRelation(event.majorEvent) &&
              majorEventKeys.has(`${event.majorEventId}:${personId}`),
          ),
        });
      }
    }
    return facts;
  }

  async isInvitedForAttendance(
    event: {
      id: string;
      eventGroupId?: string | null;
      majorEventId?: string | null;
      attendanceEligibility?: AttendanceEligibility | null;
      eventGroup?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
      majorEvent?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
    },
    personId: string,
    tx: AudienceExecutor = this.prisma,
  ): Promise<boolean | undefined> {
    const facts = await this.getEventInvitationFacts([event], [personId], tx);
    return invitationFactForAttendance(event, facts.get(`${personId}:${event.id}`));
  }

  async listInvitedPeopleForAttendance(
    event: {
      id: string;
      eventGroupId?: string | null;
      majorEventId?: string | null;
      attendanceEligibility?: AttendanceEligibility | null;
      eventGroup?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
      majorEvent?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
    },
    tx: AudienceExecutor = this.prisma,
  ): Promise<AudienceInvitationPerson[]> {
    if (!attendanceInvitationTarget(event)) {
      return [];
    }

    const targets = [
      { targetType: 'EVENT' as const, targetId: event.id },
      ...(event.eventGroupId && event.eventGroup != null && event.eventGroup.deletedAt == null
        ? [{ targetType: 'EVENT_GROUP' as const, targetId: event.eventGroupId }]
        : []),
      ...(event.majorEventId && event.majorEvent != null && event.majorEvent.deletedAt == null
        ? [{ targetType: 'MAJOR_EVENT' as const, targetId: event.majorEventId }]
        : []),
    ];
    const invitations = await Promise.all(
      targets.map((target) => this.listNotificationInvitations(target, tx)),
    );
    const unique = new Map<string, AudienceInvitationPerson>();
    for (const invitation of invitations.flat()) {
      unique.set(invitation.personId, invitation);
    }
    return [...unique.values()];
  }

  private async listNotificationInvitations(
    target: AudienceInvitationTarget,
    tx: AudienceExecutor,
  ): Promise<AudienceInvitationPerson[]> {
    switch (target.targetType) {
      case 'EVENT':
        return tx.eventAudienceInvitation.findMany({
          where: { eventId: target.targetId },
          select: { personId: true, person: { select: NOTIFICATION_PERSON_SELECT } },
        });
      case 'EVENT_GROUP':
        return tx.eventGroupAudienceInvitation.findMany({
          where: { eventGroupId: target.targetId },
          select: { personId: true, person: { select: NOTIFICATION_PERSON_SELECT } },
        });
      case 'MAJOR_EVENT':
        return tx.majorEventAudienceInvitation.findMany({
          where: { majorEventId: target.targetId },
          select: { personId: true, person: { select: NOTIFICATION_PERSON_SELECT } },
        });
    }
  }

  private async assertTargetExists(target: AudienceInvitationTarget, tx: AudienceExecutor): Promise<void> {
    const found = await (() => {
      switch (target.targetType) {
        case 'EVENT':
          return tx.event.findFirst({ where: { id: target.targetId, deletedAt: null }, select: { id: true } });
        case 'EVENT_GROUP':
          return tx.eventGroup.findFirst({ where: { id: target.targetId, deletedAt: null }, select: { id: true } });
        case 'MAJOR_EVENT':
          return tx.majorEvent.findFirst({ where: { id: target.targetId, deletedAt: null }, select: { id: true } });
      }
    })();
    if (!found) {
      throw new BadRequestException(`${target.targetType} ${target.targetId} was not found.`);
    }
  }

  private async deleteInvitations(
    target: AudienceInvitationTarget,
    personIds: readonly string[],
    tx: AudienceExecutor,
  ): Promise<void> {
    switch (target.targetType) {
      case 'EVENT':
        await tx.eventAudienceInvitation.deleteMany({
          where: { eventId: target.targetId, personId: { in: [...personIds] } },
        });
        return;
      case 'EVENT_GROUP':
        await tx.eventGroupAudienceInvitation.deleteMany({
          where: { eventGroupId: target.targetId, personId: { in: [...personIds] } },
        });
        return;
      case 'MAJOR_EVENT':
        await tx.majorEventAudienceInvitation.deleteMany({
          where: { majorEventId: target.targetId, personId: { in: [...personIds] } },
        });
        return;
    }
  }

  private async createInvitations(
    target: AudienceInvitationTarget,
    personIds: readonly string[],
    createdById: string | null | undefined,
    tx: AudienceExecutor,
  ): Promise<void> {
    const createdBy = createdById ?? null;
    switch (target.targetType) {
      case 'EVENT':
        await tx.eventAudienceInvitation.createMany({
          data: personIds.map((personId) => ({ eventId: target.targetId, personId, createdById: createdBy })),
        });
        return;
      case 'EVENT_GROUP':
        await tx.eventGroupAudienceInvitation.createMany({
          data: personIds.map((personId) => ({ eventGroupId: target.targetId, personId, createdById: createdBy })),
        });
        return;
      case 'MAJOR_EVENT':
        await tx.majorEventAudienceInvitation.createMany({
          data: personIds.map((personId) => ({ majorEventId: target.targetId, personId, createdById: createdBy })),
        });
        return;
    }
  }

  private normalizeTarget(target: AudienceInvitationTarget): AudienceInvitationTarget {
    const targetId = target.targetId?.trim();
    if (!targetId || !['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'].includes(target.targetType)) {
      throw new BadRequestException('A valid audience invitation target is required.');
    }
    return { targetType: target.targetType, targetId };
  }

  private normalizeNotificationTarget(target: AudienceInvitationNotificationTarget): AudienceInvitationNotificationTarget {
    const id = target.id?.trim();
    const name = target.name?.trim();
    if (!id || !name || !['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'].includes(target.type)) {
      throw new BadRequestException('A valid audience invitation notification target is required.');
    }
    return { type: target.type, id, name, actionUrl: target.actionUrl?.trim() || undefined };
  }

  private normalizePersonIds(personIds: readonly string[]): string[] {
    if (personIds.length > MAX_INVITATION_PERSONS) {
      throw new BadRequestException(`At most ${MAX_INVITATION_PERSONS} invitation people are allowed.`);
    }

    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const personId of personIds) {
      const normalizedPersonId = this.normalizePersonId(personId);
      if (!normalizedPersonId) {
        throw new BadRequestException('Invitation person IDs must be non-empty.');
      }
      if (!seen.has(normalizedPersonId)) {
        seen.add(normalizedPersonId);
        normalized.push(normalizedPersonId);
      }
    }
    return normalized;
  }

  private normalizePersonId(personId: string): string {
    return typeof personId === 'string' ? personId.trim() : '';
  }
}

function defaultAudienceActionUrl(target: AudienceInvitationNotificationTarget): string {
  switch (target.type) {
    case 'EVENT':
      return `/event/${encodeURIComponent(target.id)}`;
    case 'EVENT_GROUP':
      return '/calendar';
    case 'MAJOR_EVENT':
      return `/major-event/${encodeURIComponent(target.id)}/subscription`;
  }
}

export function invitationFactForAttendance(
  event: {
    id: string;
    eventGroupId?: string | null;
    majorEventId?: string | null;
    attendanceEligibility?: AttendanceEligibility | null;
    eventGroup?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
    majorEvent?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
  },
  facts?: EventInvitationFacts,
): boolean | undefined {
  if (!attendanceInvitationTarget(event)) {
    return undefined;
  }
  return facts?.event === true || facts?.eventGroup === true || facts?.majorEvent === true;
}

export function attendanceInvitationTarget(event: {
  id: string;
  eventGroupId?: string | null;
  majorEventId?: string | null;
  attendanceEligibility?: AttendanceEligibility | null;
  eventGroup?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
  majorEvent?: { attendanceEligibility?: AttendanceEligibility | null; deletedAt?: Date | null } | null;
}): AudienceInvitationTarget | null {
  if (eventAttendanceEligibility(event) !== AttendanceEligibility.INVITED_ONLY) {
    return null;
  }

  if (event.attendanceEligibility === AttendanceEligibility.INVITED_ONLY) {
    return { targetType: 'EVENT', targetId: event.id };
  }
  if (
    event.eventGroupId &&
    event.eventGroup != null &&
    !event.eventGroup.deletedAt &&
    event.eventGroup?.attendanceEligibility === AttendanceEligibility.INVITED_ONLY
  ) {
    return { targetType: 'EVENT_GROUP', targetId: event.eventGroupId };
  }
  if (
    event.majorEventId &&
    event.majorEvent != null &&
    !event.majorEvent.deletedAt &&
    event.majorEvent?.attendanceEligibility === AttendanceEligibility.INVITED_ONLY
  ) {
    return { targetType: 'MAJOR_EVENT', targetId: event.majorEventId };
  }
  return null;
}

function hasActiveRelation(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const deletedAt = (value as { deletedAt?: Date | null }).deletedAt;
  return deletedAt == null;
}
