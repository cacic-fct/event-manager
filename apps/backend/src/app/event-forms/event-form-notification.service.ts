import { Injectable, Logger } from '@nestjs/common';
import { EventFormResponseMode, EventFormTargetType, Prisma, SubscriptionStatus } from '@prisma/client';
import { EventFormAudience, matchesEventFormAudience } from '@cacic-fct/shared-event-participation';
import { isPast } from 'date-fns';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from '../events/attendance-eligibility';
import { BackendFeatureFlagService } from '../feature-flags/backend-feature-flags';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type EventFormNotificationPerson = Parameters<NovuNotificationsService['mapPersonToRecipient']>[0];

type EventFormNotificationLink = {
  id: string;
  targetType: EventFormTargetType;
  eventId: string | null;
  majorEventId: string | null;
  audiences: readonly EventFormAudience[];
  insertInSubscriptionFlow: boolean;
  requiredInSubscriptionFlow: boolean;
  notifyOnPublish: boolean;
  lastNotifiedAt: Date | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  event: { name: string; endDate: Date | null } | null;
  majorEvent: { name: string; endDate: Date | null } | null;
  priceTiers?: readonly { priceTier: { name: string } }[];
};

type EventFormNotificationRecord = {
  id: string;
  name: string;
  responseMode: EventFormResponseMode;
  links: readonly EventFormNotificationLink[];
};

@Injectable()
export class EventFormNotificationService {
  private readonly logger = new Logger(EventFormNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
    private readonly featureFlags: BackendFeatureFlagService,
  ) {}

  async notifyEligiblePeople(form: EventFormNotificationRecord): Promise<number> {
    let notifiedLinks = 0;
    for (const link of form.links) {
      if (!link.notifyOnPublish || link.lastNotifiedAt) {
        continue;
      }

      if (!this.isLinkAvailable(link)) {
        continue;
      }

      const targetEndDate = link.event?.endDate ?? link.majorEvent?.endDate;
      if (!targetEndDate || isPast(targetEndDate)) {
        continue;
      }

      const requiresExistingSubscriberResponse = this.isRequiredSubscriptionForm(link);
      const requiredNotificationsEnabled = this.featureFlags.isEnabled('requiredSubscriptionFormNotificationsEnabled');
      const otherAudiences = (link.audiences ?? [EventFormAudience.SUBSCRIBERS, EventFormAudience.ATTENDEES]).filter(
        (audience) => audience !== EventFormAudience.SUBSCRIBERS,
      );
      if (requiresExistingSubscriberResponse && !requiredNotificationsEnabled && otherAudiences.length === 0) {
        continue;
      }

      const requiredRecipients = requiresExistingSubscriberResponse && requiredNotificationsEnabled
        ? await this.findRequiredSubscriptionRecipients(form, link)
        : [];
      const audienceRecipients = requiresExistingSubscriberResponse
        ? otherAudiences.length > 0
          ? await this.findNotificationRecipients({ ...link, audiences: otherAudiences })
          : []
        : await this.findNotificationRecipients(link);
      const recipients = [...new Map(
        [...requiredRecipients, ...audienceRecipients].map((recipient) => [recipient.subscriberId, recipient]),
      ).values()];
      if (recipients.length === 0) {
        await this.prisma.eventFormLink.updateMany({
          where: {
            id: link.id,
            deletedAt: null,
            lastNotifiedAt: null,
          },
          data: {
            lastNotifiedAt: new Date(),
          },
        });
        continue;
      }

      let notified = false;
      try {
        notified = await this.notifications.notifyEventFormAvailable({
          formId: form.id,
          linkId: link.id,
          formName: form.name,
          targetType: link.targetType,
          targetId: link.eventId ?? link.majorEventId ?? '',
          targetName: link.event?.name ?? link.majorEvent?.name ?? form.name,
          recipients,
          requiredSubscriptionForm: requiresExistingSubscriberResponse && requiredNotificationsEnabled,
          ...(link.audiences?.includes(EventFormAudience.INTERESTED)
            ? { audienceVersion: [...link.audiences].sort().join(',') }
            : {}),
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Event-form notification failed form=${form.id} link=${link.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        notified = false;
      }
      if (!notified) {
        continue;
      }

      // Mark delivery only after the provider acknowledges it. The provider
      // receives a deterministic transaction id, so a retry after a process
      // crash is idempotent and cannot strand the link in a claimed state.
      const marked = await this.prisma.eventFormLink.updateMany({
        where: {
          id: link.id,
          deletedAt: null,
          lastNotifiedAt: null,
        },
        data: {
          lastNotifiedAt: new Date(),
        },
      });
      notifiedLinks += marked.count === 1 ? 1 : 0;
    }
    return notifiedLinks;
  }

  private async findNotificationRecipients(link: EventFormNotificationLink) {
    const people = new Map<string, EventFormNotificationPerson>();
    const audiences = link.audiences ?? [EventFormAudience.SUBSCRIBERS, EventFormAudience.ATTENDEES];

    if (link.eventId) {
      const subscribedPeople = await this.findEventSubscriberPeople(link.eventId);
      const subscribedIds = new Set(subscribedPeople.map(({ person }) => person.id));
      if (audiences.includes(EventFormAudience.SUBSCRIBERS)) {
        for (const subscription of subscribedPeople) {
          if (matchesEventFormAudience(audiences, { interested: false, subscribed: true, attended: false })) {
            people.set(subscription.person.id, subscription.person);
          }
        }
      }
      if (audiences.includes(EventFormAudience.INTERESTED)) {
        const event = await this.prisma.event.findUnique({ where: { id: link.eventId }, select: { eventGroupId: true } });
        const interests = await this.prisma.eventInterest.findMany({
          where: {
            deletedAt: null,
            OR: [
              { eventId: link.eventId },
              ...(event?.eventGroupId ? [{ eventGroupId: event.eventGroupId }] : []),
            ],
          },
          select: { person: this.notificationPersonSelect() },
        });
        for (const interest of interests) {
          if (
            matchesEventFormAudience(audiences, {
              interested: true,
              subscribed: subscribedIds.has(interest.person.id),
              attended: false,
            })
          ) {
            people.set(interest.person.id, interest.person);
          }
        }
      }
      if (audiences.includes(EventFormAudience.ATTENDEES)) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: { eventId: link.eventId, status: 'PRESENT' },
          select: { person: this.notificationPersonSelect() },
        });
        for (const attendance of attendances) {
          if (matchesEventFormAudience(audiences, { interested: false, subscribed: false, attended: true })) {
            people.set(attendance.person.id, attendance.person);
          }
        }
      }
    }

    if (link.majorEventId) {
      const subscribedPeople = await this.prisma.majorEventSubscription.findMany({
        where: {
          majorEventId: link.majorEventId,
          deletedAt: null,
          subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
        },
        select: { paymentTier: true, person: this.notificationPersonSelect() },
      });
      const subscribedIds = new Set(subscribedPeople.map(({ person }) => person.id));
      const allowedPaymentTiers = new Set(
        (link.priceTiers ?? []).map(({ priceTier }) => priceTier.name.trim().toLocaleLowerCase('pt-BR')),
      );
      const eligibleSubscribedPeople =
        allowedPaymentTiers.size > 0
          ? subscribedPeople.filter(({ paymentTier }) =>
              paymentTier ? allowedPaymentTiers.has(paymentTier.trim().toLocaleLowerCase('pt-BR')) : false,
            )
          : subscribedPeople;
      const eligibleSubscribedIds = new Set(eligibleSubscribedPeople.map(({ person }) => person.id));
      const canAccessPriceTier = (personId: string) => allowedPaymentTiers.size === 0 || eligibleSubscribedIds.has(personId);
      if (audiences.includes(EventFormAudience.SUBSCRIBERS)) {
        for (const subscription of eligibleSubscribedPeople) {
          if (matchesEventFormAudience(audiences, { interested: false, subscribed: true, attended: false })) {
            people.set(subscription.person.id, subscription.person);
          }
        }
      }
      if (audiences.includes(EventFormAudience.INTERESTED)) {
        const interests = await this.prisma.eventInterest.findMany({
          where: { majorEventId: link.majorEventId, deletedAt: null },
          select: { person: this.notificationPersonSelect() },
        });
        for (const interest of interests) {
          if (
            canAccessPriceTier(interest.person.id) &&
            matchesEventFormAudience(audiences, {
              interested: true,
              subscribed: subscribedIds.has(interest.person.id),
              attended: false,
            })
          ) {
            people.set(interest.person.id, interest.person);
          }
        }
      }
      if (audiences.includes(EventFormAudience.ATTENDEES)) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: { status: 'PRESENT', event: { majorEventId: link.majorEventId } },
          select: { person: this.notificationPersonSelect() },
        });
        for (const attendance of attendances) {
          if (
            canAccessPriceTier(attendance.person.id) &&
            matchesEventFormAudience(audiences, { interested: false, subscribed: false, attended: true })
          ) {
            people.set(attendance.person.id, attendance.person);
          }
        }
      }
    }

    return [...people.values()].map((person) => this.notifications.mapPersonToRecipient(person));
  }

  private async findRequiredSubscriptionRecipients(form: EventFormNotificationRecord, link: EventFormNotificationLink) {
    const subscriptions = link.eventId
      ? await this.findEventSubscriberPeople(link.eventId)
      : link.majorEventId
        ? await this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId: link.majorEventId,
              deletedAt: null,
              subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
              ...((link.priceTiers?.length ?? 0) > 0
                ? { paymentTier: { in: link.priceTiers?.map(({ priceTier }) => priceTier.name) } }
                : {}),
            },
            select: {
              person: this.notificationPersonSelect(),
            },
          })
        : [];
    const people = [...new Map(subscriptions.map((subscription) => [subscription.person.id, subscription.person])).values()];
    if (people.length === 0) {
      return [];
    }

    const answered = await this.prisma.eventFormResponse.findMany({
      where: {
        formId: form.id,
        personId: {
          in: people.map((person) => person.id),
        },
        deletedAt: null,
        ...this.responseScopeForRequiredSubscriptionLink(form.responseMode, link),
      },
      select: {
        personId: true,
      },
    });
    const answeredPeople = new Set(answered.map((response) => response.personId));
    return people
      .filter((person) => !answeredPeople.has(person.id))
      .map((person) => this.notifications.mapPersonToRecipient(person));
  }

  private responseScopeForRequiredSubscriptionLink(
    responseMode: EventFormResponseMode,
    link: EventFormNotificationLink,
  ): Prisma.EventFormResponseWhereInput {
    if (responseMode === EventFormResponseMode.SINGLE_PER_FORM) {
      return {};
    }
    if (responseMode === EventFormResponseMode.MULTIPLE_PER_TARGET) {
      return { linkId: link.id };
    }
    return {
      targetType: link.targetType,
      eventId: link.eventId,
      majorEventId: link.majorEventId,
    };
  }

  private async findEventSubscriberPeople(eventId: string) {
    const directSubscriptions = await this.prisma.eventSubscription.findMany({
      where: { eventId, deletedAt: null },
      select: { person: this.notificationPersonSelect() },
    });
    const people = new Map(directSubscriptions.map(({ person }) => [person.id, person]));
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { majorEventId: true, autoSubscribe: true },
    });
    if (!event?.majorEventId) {
      return [...people.values()].map((person) => ({ person }));
    }

    const selections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
      where: {
        eventId,
        deletedAt: null,
        subscription: {
          majorEventId: event.majorEventId,
          deletedAt: null,
          subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
        },
      },
      select: { subscription: { select: { person: this.notificationPersonSelect() } } },
    });
    for (const { subscription } of selections) {
      people.set(subscription.person.id, subscription.person);
    }

    if (event.autoSubscribe) {
      const autoSubscriptions = await this.prisma.majorEventSubscription.findMany({
        where: {
          majorEventId: event.majorEventId,
          deletedAt: null,
          subscriptionStatus: { notIn: this.inactiveMajorSubscriptionStatuses() },
        },
        select: { person: this.notificationPersonSelect() },
      });
      for (const { person } of autoSubscriptions) {
        people.set(person.id, person);
      }
    }

    return [...people.values()].map((person) => ({ person }));
  }

  private isRequiredSubscriptionForm(link: EventFormNotificationLink): boolean {
    const audiences = link.audiences ?? [EventFormAudience.SUBSCRIBERS, EventFormAudience.ATTENDEES];
    return (
      link.insertInSubscriptionFlow && link.requiredInSubscriptionFlow && audiences.includes(EventFormAudience.SUBSCRIBERS)
    );
  }

  private inactiveMajorSubscriptionStatuses(): SubscriptionStatus[] {
    return Object.values(SubscriptionStatus).filter(
      (status) =>
        !ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES.includes(
          status as (typeof ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES)[number],
        ),
    );
  }

  private notificationPersonSelect() {
    return {
      select: {
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
      },
    } satisfies Prisma.PeopleDefaultArgs;
  }

  private isLinkAvailable(link: Pick<EventFormNotificationLink, 'availableFrom' | 'availableUntil'>): boolean {
    const now = new Date();
    return (!link.availableFrom || link.availableFrom <= now) && (!link.availableUntil || link.availableUntil > now);
  }
}
