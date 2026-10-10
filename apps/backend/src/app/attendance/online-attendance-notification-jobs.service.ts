import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PublicationState } from '@prisma/client';
import { AttendanceEligibility, isAttendanceEligible } from '@cacic-fct/shared-event-participation';
import { Queue } from 'bullmq';
import { BackendFeatureFlagService } from '../feature-flags/backend-feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { buildBullMqJobId } from '../queues/bullmq-job-id';
import { ANONYMOUS_AUDIENCE, audienceContext, eventAudienceWhere, type EventAudiencePrincipal } from '../audiences/audience-context';
import { EventAudienceService } from '../audiences/event-audience.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import {
  ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES,
  eventAttendanceEligibility,
  isApprovedAttendance,
  isRegisteredAttendanceEvidence,
} from '../events/attendance-eligibility';
import { AudienceInvitationService } from '../audiences/audience-invitation.service';

export const ONLINE_ATTENDANCE_NOTIFICATION_QUEUE = 'online-attendance-notifications';
export const ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB = 'notify-online-attendance-available';

const PENDING_EVENT_PAGE_SIZE = 100;
const SCHEDULING_CONCURRENCY = 10;

export interface OnlineAttendanceAvailableNotificationJob {
  eventId: string;
  onlineAttendanceStartDate: string;
}

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userId: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const;

@Injectable()
export class OnlineAttendanceNotificationJobsService {
  private readonly logger = new Logger(OnlineAttendanceNotificationJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
    @InjectQueue(ONLINE_ATTENDANCE_NOTIFICATION_QUEUE)
    private readonly queue: Queue<OnlineAttendanceAvailableNotificationJob>,
    private readonly featureFlags: BackendFeatureFlagService,
    @Optional() private readonly audienceInvitations?: AudienceInvitationService,
    @Optional() private readonly audiences?: EventAudienceService,
  ) {}

  async scheduleEvent(event: {
    id: string;
    endDate: Date;
    shouldCollectAttendance: boolean;
    isOnlineAttendanceAllowed: boolean;
    onlineAttendanceCode: string | null;
    onlineAttendanceStartDate: Date | null;
    onlineAttendanceEndDate: Date | null;
  }): Promise<void> {
    if (!this.featureFlags.isEnabled('onlineAttendanceNotificationsEnabled')) {
      return;
    }

    const startDate = event.onlineAttendanceStartDate;
    const endDate = event.onlineAttendanceEndDate;
    if (
      !event.shouldCollectAttendance ||
      !event.isOnlineAttendanceAllowed ||
      !event.onlineAttendanceCode?.trim() ||
      !startDate ||
      !endDate ||
      startDate >= endDate ||
      startDate > event.endDate ||
      endDate <= new Date()
    ) {
      return;
    }

    try {
      await this.queue.add(
        ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
        {
          eventId: event.id,
          onlineAttendanceStartDate: startDate.toISOString(),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          delay: Math.max(startDate.getTime() - Date.now(), 0),
          jobId: buildBullMqJobId('online-attendance-available', event.id, startDate.getTime()),
          removeOnFail: true,
        },
      );
    } catch (error) {
      this.logger.error(
        `Could not schedule the online attendance notification for event ${event.id}.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async schedulePendingEvents(): Promise<void> {
    let cursor: string | undefined;
    do {
      const events = await this.prisma.event.findMany({
        where: {
          deletedAt: null,
          shouldCollectAttendance: true,
          isOnlineAttendanceAllowed: true,
          onlineAttendanceCode: { not: null },
          onlineAttendanceStartDate: { not: null },
          onlineAttendanceEndDate: { gte: new Date() },
        },
        select: {
          id: true,
          endDate: true,
          shouldCollectAttendance: true,
          isOnlineAttendanceAllowed: true,
          onlineAttendanceCode: true,
          onlineAttendanceStartDate: true,
          onlineAttendanceEndDate: true,
        },
        orderBy: { id: 'asc' },
        take: PENDING_EVENT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (let index = 0; index < events.length; index += SCHEDULING_CONCURRENCY) {
        await Promise.all(
          events.slice(index, index + SCHEDULING_CONCURRENCY).map((event) => this.scheduleEvent(event)),
        );
      }

      cursor = events.length === PENDING_EVENT_PAGE_SIZE ? events.at(-1)?.id : undefined;
    } while (cursor);
  }

  async deliver(input: OnlineAttendanceAvailableNotificationJob): Promise<void> {
    if (!this.featureFlags.isEnabled('onlineAttendanceNotificationsEnabled')) {
      return;
    }

    const startDate = new Date(input.onlineAttendanceStartDate);
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        ...PUBLIC_EVENT_WHERE,
        id: input.eventId,
        deletedAt: null,
        endDate: { gte: now },
        isPubliclyListed: true,
        publicationState: PublicationState.PUBLISHED,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        onlineAttendanceCode: { not: null },
        onlineAttendanceStartDate: startDate,
        onlineAttendanceEndDate: { gte: now },
      },
      select: {
        id: true,
        name: true,
        audience: true,
        audienceCourseCodes: true,
        eventGroupId: true,
        majorEventId: true,
        autoSubscribe: true,
        attendanceEligibility: true,
        endDate: true,
        onlineAttendanceStartDate: true,
        onlineAttendanceCode: true,
        onlineAttendanceEndDate: true,
        subscriptions: {
          where: {
            deletedAt: null,
          },
          select: { person: { select: PERSON_SELECT } },
        },
        majorEvent: {
          select: {
            audience: true,
            audienceCourseCodes: true,
            attendanceEligibility: true,
            deletedAt: true,
            subscriptions: {
              where: {
                deletedAt: null,
                subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
              },
              select: {
                subscriptionStatus: true,
                person: { select: PERSON_SELECT },
                selectedEvents: {
                  where: { eventId: input.eventId, deletedAt: null },
                  select: { eventId: true },
                },
              },
            },
          },
        },
        eventGroup: {
          select: {
            audience: true,
            audienceCourseCodes: true,
            attendanceEligibility: true,
            deletedAt: true,
            majorEvent: {
              select: {
                audience: true,
                audienceCourseCodes: true,
              },
            },
          },
        },
      },
    });

    if (
      !event?.onlineAttendanceCode?.trim() ||
      !event.onlineAttendanceStartDate ||
      !event.onlineAttendanceEndDate ||
      event.onlineAttendanceStartDate > event.endDate
    ) {
      return;
    }

    const eligibility = eventAttendanceEligibility(event);
    const directPeople = new Set(event.subscriptions.map(({ person }) => person.id));
    const majorSubscriptions = new Map(
      (event.majorEvent?.subscriptions ?? []).map((subscription) => [subscription.person.id, subscription]),
    );
    const candidates = new Map<string, Parameters<NovuNotificationsService['mapPersonToRecipient']>[0]>();
    const invitedPersonIds = new Set<string>();
    if (eligibility === AttendanceEligibility.INVITED_ONLY) {
      const invitedPeople = this.audienceInvitations
        ? await this.audienceInvitations.listInvitedPeopleForAttendance(event, this.prisma)
        : [];
      for (const invitation of invitedPeople) {
        candidates.set(invitation.person.id, invitation.person);
        invitedPersonIds.add(invitation.person.id);
      }
    } else {
      for (const { person } of event.subscriptions) {
        candidates.set(person.id, person);
      }
      for (const subscription of majorSubscriptions.values()) {
        if (event.autoSubscribe || subscription.selectedEvents.length) {
          candidates.set(subscription.person.id, subscription.person);
        }
      }
    }
    if (eligibility === AttendanceEligibility.ANYONE) {
      const interests = await this.prisma.eventInterest.findMany({
        where: {
          deletedAt: null,
          OR: [
            { eventId: event.id },
            ...(event.eventGroupId ? [{ eventGroupId: event.eventGroupId }] : []),
            ...(event.majorEventId ? [{ majorEventId: event.majorEventId }] : []),
          ],
        },
        select: {
          person: { select: PERSON_SELECT },
        },
      });
      for (const { person } of interests) {
        candidates.set(person.id, person);
      }
    }

    const attendanceEligiblePeople = [...candidates.values()].filter((person) => {
      const subscription = majorSubscriptions.get(person.id);
      const evidence = {
        hasEventSubscription: directPeople.has(person.id),
        majorEventSubscriptionStatus: subscription?.subscriptionStatus,
        hasSelectedEvent: Boolean(subscription?.selectedEvents.length),
        autoSubscribe: event.autoSubscribe,
      };
      return isAttendanceEligible(eligibility, {
        registered: isRegisteredAttendanceEvidence(event, evidence),
        approved: isApprovedAttendance(event, evidence),
        invited:
          eligibility === AttendanceEligibility.INVITED_ONLY ? invitedPersonIds.has(person.id) : undefined,
      });
    });
    const visiblePeople = await this.filterAudienceCandidates(event, attendanceEligiblePeople);
    const recipients = visiblePeople.map((person) => this.notifications.mapPersonToRecipient(person));
    const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.subscriberId, recipient])).values()];
    if (uniqueRecipients.length === 0) {
      return;
    }

    const delivered = await this.notifications.notifyOnlineAttendanceAvailable({
      eventId: event.id,
      eventName: event.name,
      endsAt: event.onlineAttendanceEndDate,
      recipients: uniqueRecipients,
    });
    if (!delivered) {
      throw new Error(`Online attendance notification for event ${event.id} was not acknowledged.`);
    }
  }

  private async filterAudienceCandidates(
    event: {
      id: string;
      audience?: string | null;
      eventGroup?: { audience?: string | null; majorEvent?: { audience?: string | null } | null } | null;
      majorEvent?: { audience?: string | null } | null;
    },
    people: readonly Parameters<NovuNotificationsService['mapPersonToRecipient']>[0][],
  ): Promise<Parameters<NovuNotificationsService['mapPersonToRecipient']>[0][]> {
    if (people.length === 0 || !this.hasRestrictedAudience(event)) {
      return [...people];
    }

    // Keep optional for attendance-only unit fixtures; production wiring provides it.
    const audiences = this.audiences;
    if (!audiences) {
      return [...people];
    }

    const principalCache = new Map<string, Promise<EventAudiencePrincipal>>();
    const visiblePeople: Parameters<NovuNotificationsService['mapPersonToRecipient']>[0][] = [];
    for (let offset = 0; offset < people.length; offset += SCHEDULING_CONCURRENCY) {
      const batch = people.slice(offset, offset + SCHEDULING_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (person) => ({
          person,
          visible: await this.isAudienceVisibleForCandidate(event.id, person, principalCache, audiences),
        })),
      );
      visiblePeople.push(...results.filter(({ visible }) => visible).map(({ person }) => person));
    }
    return visiblePeople;
  }

  private async isAudienceVisibleForCandidate(
    eventId: string,
    person: Parameters<NovuNotificationsService['mapPersonToRecipient']>[0],
    principalCache: Map<string, Promise<EventAudiencePrincipal>>,
    audiences: EventAudienceService,
  ): Promise<boolean> {
    try {
      const personId = person.id;
      const userId = person.userId ?? person.user?.id;
      const principal = userId
        ? await this.getCachedStoredPrincipal(userId, principalCache, audiences)
        : { ...ANONYMOUS_AUDIENCE, personIds: [personId] };
      const visible = await audienceContext.run(principal, () =>
        this.prisma.event.findFirst({
          where: { AND: [PUBLIC_EVENT_WHERE, { id: eventId }, eventAudienceWhere(principal)] },
          select: { id: true },
        }),
      );
      return Boolean(visible);
    } catch {
      return false;
    }
  }

  private async getCachedStoredPrincipal(
    userId: string,
    principalCache: Map<string, Promise<EventAudiencePrincipal>>,
    audiences: EventAudienceService,
  ): Promise<EventAudiencePrincipal> {
    const cached = principalCache.get(userId);
    if (cached) {
      return cached;
    }
    const principal = audiences.principalForStoredUser(userId);
    principalCache.set(userId, principal);
    return principal;
  }

  private hasRestrictedAudience(event: {
    audience?: string | null;
    eventGroup?: { audience?: string | null; majorEvent?: { audience?: string | null } | null } | null;
    majorEvent?: { audience?: string | null } | null;
  }): boolean {
    return [
      event.audience,
      event.eventGroup?.audience,
      event.eventGroup?.majorEvent?.audience,
      event.majorEvent?.audience,
    ].some(
      (audience) => audience != null && audience !== 'PUBLIC',
    );
  }
}
