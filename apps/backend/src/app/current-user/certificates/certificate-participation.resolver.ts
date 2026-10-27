import type { CertificateParticipationSummary } from '@cacic-fct/event-manager-public-contracts';
import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Field, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { IncludePastParticipation } from '../../audiences/past-participation.decorator';
import { ANONYMOUS_AUDIENCE, audienceContext, pastEventParticipationWhere } from '../../audiences/audience-context';
import {
  CertificateEligibilityService,
  type EligibleCertificateRecipient,
} from '../../certificate/certificate-eligibility.service';
import { CERTIFICATE_CONFIG_SELECT, EVENT_SELECT } from '../../certificate/certificate.constants';
import { isManualCertificateIssuedTo } from '../../certificate/certificate-sports-roles';
import { isRegisteredAttendanceEvidence } from '../../events/attendance-eligibility';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserPublicEventService } from '../public-event.service';
import type { GraphqlContext } from '../selects';

@ObjectType()
export class CurrentUserCertificateParticipation implements CertificateParticipationSummary {
  @Field(() => String)
  status!: CertificateParticipationSummary['status'];

  @Field(() => String, { nullable: true, description: 'Major event whose payment needs attention.' })
  actionTargetId?: string | null;
}

@Resolver()
export class CurrentUserCertificateParticipationResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly publicEvents: CurrentUserPublicEventService,
    private readonly eligibility: CertificateEligibilityService,
  ) {}

  @Query(() => CurrentUserCertificateParticipation, {
    description:
      'Explain the current person’s certificate requirements using the issuance rules. Does not issue a certificate.',
  })
  @IncludePastParticipation()
  async currentUserCertificateParticipation(
    @Context() context: GraphqlContext,
    @Args('scope', { type: () => CertificateScope }) scope: CertificateScope,
    @Args('targetId', { type: () => String }) targetId: string,
  ): Promise<CertificateParticipationSummary> {
    if (!targetId.trim() || scope === CertificateScope.OTHER) {
      throw new BadRequestException('Choose an event, event group, or major event.');
    }
    const person = await this.currentUser.requireCurrentPerson(context);
    const id = targetId.trim();
    // Check visibility before reading configuration or personal requirements.
    const target = await this.requireTarget(scope, id, person.id);
    const eventWhere: Prisma.EventWhereInput =
      scope === CertificateScope.EVENT
        ? { id }
        : scope === CertificateScope.EVENT_GROUP
          ? { eventGroupId: id }
          : { majorEventId: id };
    const events = await this.prisma.event.findMany({
      where: { ...eventWhere, deletedAt: null },
      select: EVENT_SELECT,
    });
    const eventIds = events.map((event) => event.id);
    const groupIds = [...new Set(events.flatMap((event) => (event.eventGroupId ? [event.eventGroupId] : [])))];
    const majorIds = [...new Set(events.flatMap((event) => (event.majorEventId ? [event.majorEventId] : [])))];
    const configs = await this.prisma.certificateConfig.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        certificateTemplate: { isActive: true, deletedAt: null },
        OR: [
          { scope: CertificateScope.EVENT, eventId: { in: eventIds } },
          {
            scope: CertificateScope.EVENT_GROUP,
            eventGroupId: { in: scope === CertificateScope.EVENT_GROUP ? [id] : groupIds },
          },
          {
            scope: CertificateScope.MAJOR_EVENT,
            majorEventId: { in: scope === CertificateScope.MAJOR_EVENT ? [id] : majorIds },
          },
        ],
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });
    for (const config of configs) {
      // Manual recipient selection is an organizer decision, never proof of eligibility.
      if (isManualCertificateIssuedTo(config.issuedTo)) continue;
      let recipients: EligibleCertificateRecipient[];
      try {
        // Visibility must not remove required sibling activities from the issuance
        // calculation. Evaluate this person's facts in full; expose only a status.
        recipients = await audienceContext.run(
          { ...(audienceContext.getStore() ?? ANONYMOUS_AUDIENCE), bypass: true },
          () => this.eligibility.resolveEligibleRecipients(config, person.id),
        );
      } catch (error) {
        // A stale configuration must not hide another valid certificate path.
        if (error instanceof BadRequestException || error instanceof NotFoundException) continue;
        throw error;
      }
      if (recipients.some((recipient) => recipient.events.some((event) => eventIds.includes(event.id)))) {
        return {
          status: config.issuedTo === CertificateIssuedTo.ATTENDEE ? 'ATTENDANCE_CONFIRMED' : 'AWAITING_RELEASE',
        };
      }
    }
    const offered =
      target.shouldIssueCertificate ||
      configs.length > 0 ||
      events.some(
        (event) => event.shouldIssueCertificate && (!event.eventGroupId || event.eventGroup?.shouldIssueCertificate),
      );
    if (!offered) return { status: 'NOT_OFFERED' };

    const [attendances, pending, subscriptions, eventSubscriptions] = await Promise.all([
      this.prisma.eventAttendance.findMany({
        where: { personId: person.id, eventId: { in: eventIds }, status: 'PRESENT' },
        select: { eventId: true },
      }),
      this.prisma.offlineEventAttendanceSubmission.count({
        where: { personId: person.id, eventId: { in: eventIds }, status: 'PENDING' },
      }),
      this.prisma.majorEventSubscription.findMany({
        where: { personId: person.id, majorEventId: { in: majorIds }, deletedAt: null },
        select: {
          majorEventId: true,
          subscriptionStatus: true,
          selectedEvents: { where: { deletedAt: null }, select: { eventId: true } },
        },
      }),
      this.prisma.eventSubscription.findMany({
        where: { personId: person.id, eventId: { in: eventIds }, deletedAt: null },
        select: { eventId: true },
      }),
    ]);
    if (pending > 0) return { status: 'ATTENDANCE_UNDER_REVIEW' };
    // Only prescribe payment when an attendee configuration actually requires it.
    // Other restrictions (tier, invitation, manual selection) stay an honest review state.
    const attendeeConfigs = configs.filter((config) => config.issuedTo === CertificateIssuedTo.ATTENDEE);
    const certificateEvents = events.filter((event) => event.shouldIssueCertificate);
    const paymentEvents = certificateEvents.filter(
      (event) =>
        event.majorEvent?.isPaymentRequired &&
        subscriptions.find((subscription) => subscription.majorEventId === event.majorEventId)?.subscriptionStatus !==
          'CONFIRMED' &&
        attendeeConfigs.length > 0 &&
        attendeeConfigs.every(
          (config) =>
            !event.shouldIssueCertificateForNonPayingAttendees ||
            (event.eventGroupId && !event.eventGroup?.shouldIssueCertificateForNonPayingAttendees) ||
            (config.scope === CertificateScope.MAJOR_EVENT &&
              !config.majorEvent?.shouldIssueCertificateForNonPayingAttendees),
        ),
    );
    // With mixed free/paid activities there is no single payment prerequisite.
    const paymentEvent = paymentEvents.length === certificateEvents.length ? paymentEvents[0] : undefined;
    if (paymentEvent?.majorEventId) {
      const status = subscriptions.find(
        (subscription) => subscription.majorEventId === paymentEvent.majorEventId,
      )?.subscriptionStatus;
      if (!status) return { status: 'REGISTRATION_PENDING' };
      if (status === 'CANCELED' || (status.startsWith('REJECTED_') && status !== 'REJECTED_INVALID_RECEIPT')) {
        return { status: 'REGISTRATION_PENDING' };
      }
      return {
        status: status === 'RECEIPT_UNDER_REVIEW' ? 'PAYMENT_UNDER_REVIEW' : 'PAYMENT_PENDING',
        actionTargetId: paymentEvent.majorEventId,
      };
    }
    const registrationMissing = events.some((event) => {
      if (!attendances.some((attendance) => attendance.eventId === event.id)) return false;
      const majorSubscription = subscriptions.find((subscription) => subscription.majorEventId === event.majorEventId);
      const hasEventSubscription = eventSubscriptions.some((subscription) => subscription.eventId === event.id);
      const registered = isRegisteredAttendanceEvidence(event, {
        hasEventSubscription,
        majorEventSubscriptionStatus: majorSubscription?.subscriptionStatus,
        hasSelectedEvent: majorSubscription?.selectedEvents.some((selected) => selected.eventId === event.id),
        autoSubscribe: event.autoSubscribe,
      });
      return (
        attendeeConfigs.length > 0 &&
        attendeeConfigs.every(
          (config) =>
            (!registered &&
              (config.attendeeEligibility === 'REGISTERED_ONLY' ||
                config.attendeeEligibility === 'APPROVED_REGISTRATIONS_ONLY')) ||
            (event.allowSubscription &&
              !hasEventSubscription &&
              (!event.shouldIssueCertificateForNonSubscribedAttendees ||
                (event.eventGroupId && !event.eventGroup?.shouldIssueCertificateForNonSubscribedAttendees) ||
                (config.scope === CertificateScope.MAJOR_EVENT &&
                  !config.majorEvent?.shouldIssueCertificateForNonSubscribedAttendees))),
        )
      );
    });
    if (registrationMissing) return { status: 'REGISTRATION_PENDING' };
    if (
      scope === CertificateScope.EVENT_GROUP &&
      attendances.length > 0 &&
      attendeeConfigs.length > 0 &&
      configs.every(
        (config) =>
          config.issuedTo === CertificateIssuedTo.ATTENDEE &&
          config.scope === CertificateScope.EVENT_GROUP &&
          !config.eventGroup?.shouldIssuePartialCertificate,
      ) &&
      events.some(
        (event) => event.shouldIssueCertificate && !attendances.some((attendance) => attendance.eventId === event.id),
      )
    ) {
      return { status: 'GROUP_ATTENDANCE_INCOMPLETE' };
    }
    if (
      attendances.length === 0 &&
      attendeeConfigs.length > 0 &&
      configs.every((config) => config.issuedTo === CertificateIssuedTo.ATTENDEE)
    ) {
      return {
        status: events.some((event) => event.endDate.getTime() >= Date.now())
          ? 'PARTICIPATION_PENDING'
          : 'ATTENDANCE_UNCONFIRMED',
      };
    }
    return { status: 'RULES_UNDER_REVIEW' };
  }

  private async requireTarget(
    scope: CertificateScope,
    id: string,
    personId: string,
  ): Promise<{ shouldIssueCertificate?: boolean | null }> {
    try {
      if (scope === CertificateScope.EVENT) return await this.publicEvents.requirePublicEvent(id);
      if (scope === CertificateScope.EVENT_GROUP) return await this.publicEvents.requirePublicEventGroup(id);
      return await this.publicEvents.requirePublicMajorEvent(id);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      // A personal history can outlive publication. Only the participant's own
      // ended records unlock this fallback; draft or unrelated targets stay private.
      const now = new Date();
      const ownEvents = pastEventParticipationWhere({
        ...ANONYMOUS_AUDIENCE,
        personIds: [personId],
        pastParticipationBefore: now,
      });
      const ownCertificates = { some: { certificates: { some: { personId, deletedAt: null } } } };
      const ownSubscriptions = { some: { personId, deletedAt: null } };
      if (scope === CertificateScope.EVENT) {
        const event = await this.prisma.event.findFirst({
          where: { id, deletedAt: null, AND: [ownEvents] },
          select: { shouldIssueCertificate: true },
        });
        if (event) return event;
      } else if (scope === CertificateScope.EVENT_GROUP) {
        const group = await this.prisma.eventGroup.findFirst({
          where: {
            id,
            deletedAt: null,
            OR: [
              { events: { some: ownEvents } },
              {
                events: { some: { endDate: { lte: now } } },
                OR: [{ subscriptions: ownSubscriptions }, { certificateConfigs: ownCertificates }],
              },
            ],
          },
          select: { shouldIssueCertificate: true },
        });
        if (group) return group;
      } else {
        const major = await this.prisma.majorEvent.findFirst({
          where: {
            id,
            deletedAt: null,
            OR: [
              { events: { some: ownEvents } },
              {
                endDate: { lte: now },
                OR: [{ subscriptions: ownSubscriptions }, { certificateConfigs: ownCertificates }],
              },
            ],
          },
          select: { certificateConfigs: { where: { isActive: true, deletedAt: null }, select: { id: true }, take: 1 } },
        });
        if (major) return { shouldIssueCertificate: major.certificateConfigs.length > 0 };
      }
      throw error;
    }
  }
}
