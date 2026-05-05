import { Person, User } from '@cacic-eventos/shared-data-types';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CurrentUserEventParticipation,
  CurrentUserEventAttendance,
  CurrentUserEventGroupSubscription,
  CurrentUserEventSubscription,
  CurrentUserSubscriptionFeedEventGroup,
  CurrentUserSubscriptionFeedItem,
  CurrentUserSubscriptionFeedSingleEvent,
} from './models';
import {
  CURRENT_USER_EVENT_ATTENDANCE_SELECT,
  CURRENT_USER_EVENT_SUBSCRIPTION_SELECT,
  EventGroupSubscriptionRecord,
  EventRecord,
  PersonRecord,
  PublicEventGroupRecord,
  PublicEventRecord,
  PublicMajorEventRecord,
  SubscriptionFeedSingleEventRecord,
  UserRecord,
} from './selects';
import {
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
} from '../public-events/models';

@Injectable()
export class CurrentUserEventMapperService {
  mapPublicMajorEvent(majorEvent: PublicMajorEventRecord): PublicMajorEvent {
    return {
      id: majorEvent.id,
      name: majorEvent.name,
      emoji: majorEvent.emoji,
      startDate: majorEvent.startDate,
      endDate: majorEvent.endDate,
      description: majorEvent.description ?? undefined,
      subscriptionStartDate: majorEvent.subscriptionStartDate ?? undefined,
      subscriptionEndDate: majorEvent.subscriptionEndDate ?? undefined,
      maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee ?? undefined,
      maxLecturesPerAttendee: majorEvent.maxLecturesPerAttendee ?? undefined,
      buttonText: majorEvent.buttonText ?? undefined,
      buttonLink: majorEvent.buttonLink ?? undefined,
      contactInfo: majorEvent.contactInfo ?? undefined,
      contactType: majorEvent.contactType ?? undefined,
      isPaymentRequired: majorEvent.isPaymentRequired,
      additionalPaymentInfo: majorEvent.additionalPaymentInfo ?? undefined,
      shouldIssueCertificate: majorEvent.certificateConfigs.length > 0,
    };
  }

  mapPublicEventGroup(eventGroup: PublicEventGroupRecord): PublicEventGroup {
    return {
      id: eventGroup.id,
      name: eventGroup.name,
      emoji: eventGroup.emoji,
      shouldIssueCertificateForEachEvent:
        eventGroup.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: eventGroup.shouldIssuePartialCertificate,
      shouldIssueCertificate:
        eventGroup.shouldIssueCertificateForEachEvent ||
        eventGroup.shouldIssuePartialCertificate,
    };
  }

  mapPublicEvent(event: PublicEventRecord | EventRecord): PublicEvent {
    return {
      id: event.id,
      name: event.name,
      creditMinutes: event.creditMinutes ?? undefined,
      startDate: event.startDate,
      endDate: event.endDate,
      emoji: event.emoji,
      type: event.type,
      description: event.description ?? undefined,
      shortDescription: event.shortDescription ?? undefined,
      latitude: event.latitude ?? undefined,
      longitude: event.longitude ?? undefined,
      locationDescription: event.locationDescription ?? undefined,
      majorEventId: event.majorEventId ?? undefined,
      majorEvent: event.majorEvent
        ? this.mapPublicMajorEvent(event.majorEvent as PublicMajorEventRecord)
        : undefined,
      eventGroupId: event.eventGroupId ?? undefined,
      eventGroup: event.eventGroup
        ? this.mapPublicEventGroup(event.eventGroup)
        : undefined,
      allowSubscription: event.allowSubscription,
      subscriptionStartDate: event.subscriptionStartDate ?? undefined,
      subscriptionEndDate: event.subscriptionEndDate ?? undefined,
      slots: event.slots ?? undefined,
      shouldIssueCertificate: event.shouldIssueCertificate,
      shouldCollectAttendance: event.shouldCollectAttendance,
      isOnlineAttendanceAllowed: event.isOnlineAttendanceAllowed,
      onlineAttendanceStartDate: event.onlineAttendanceStartDate ?? undefined,
      onlineAttendanceEndDate: event.onlineAttendanceEndDate ?? undefined,
      publiclyVisible: event.publiclyVisible,
      youtubeCode: event.youtubeCode ?? undefined,
      buttonText: event.buttonText ?? undefined,
      buttonLink: event.buttonLink ?? undefined,
    };
  }

  mapUser(user: UserRecord): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      identityDocument: user.identityDocument ?? undefined,
      academicId: user.academicId ?? undefined,
      role: user.role,
      createdAt: user.createdAt,
      createdById: user.createdById ?? undefined,
      updatedAt: user.updatedAt,
      updatedById: user.updatedById ?? undefined,
    };
  }

  mapPerson(person: PersonRecord): Person {
    return {
      id: person.id,
      name: person.name,
      email: person.email ?? undefined,
      secondaryEmails: person.secondaryEmails,
      phone: person.phone ?? undefined,
      identityDocument: person.identityDocument ?? undefined,
      academicId: person.academicId ?? undefined,
      userId: person.userId ?? undefined,
      user: person.user ? this.mapUser(person.user) : undefined,
      mergedIntoId: person.mergedIntoId ?? undefined,
      externalRef: person.externalRef ?? undefined,
      deletedAt: person.deletedAt ?? undefined,
      createdAt: person.createdAt,
      createdById: person.createdById ?? undefined,
      updatedAt: person.updatedAt,
      updatedById: person.updatedById ?? undefined,
    };
  }

  mapCurrentUserEventAttendance(
    attendance: Prisma.EventAttendanceGetPayload<{
      select: typeof CURRENT_USER_EVENT_ATTENDANCE_SELECT;
    }>,
  ): CurrentUserEventAttendance {
    return {
      eventId: attendance.eventId,
      attendedAt: attendance.attendedAt,
      createdAt: attendance.createdAt,
      event: this.mapPublicEvent(attendance.event),
    };
  }

  mapCurrentUserEventSubscription(
    subscription: Prisma.EventSubscriptionGetPayload<{
      select: typeof CURRENT_USER_EVENT_SUBSCRIPTION_SELECT;
    }>,
  ): CurrentUserEventSubscription {
    return {
      eventId: subscription.eventId,
      event: this.mapPublicEvent(subscription.event),
      eventGroupSubscriptionId:
        subscription.eventGroupSubscriptionId ?? undefined,
      createdAt: subscription.createdAt,
    };
  }

  mapCurrentUserEventGroupSubscription(
    subscription: EventGroupSubscriptionRecord,
    events: PublicEvent[],
  ): CurrentUserEventGroupSubscription {
    return {
      id: subscription.id,
      eventGroupId: subscription.eventGroupId,
      eventGroup: this.mapPublicEventGroup(subscription.eventGroup),
      events,
      createdAt: subscription.createdAt,
    };
  }

  mapSubscribedSingleEventItem(
    eventId: string,
    event: PublicEvent,
    startDate: Date,
  ) {
    return {
      id: eventId,
      type: 'single' as const,
      event,
      startDate,
    };
  }

  mapSubscribedEventGroupItem(
    subscriptionId: string,
    eventGroup: PublicEventGroup,
    events: PublicEvent[],
    startDate: Date,
  ) {
    return {
      id: subscriptionId,
      type: 'group' as const,
      eventGroup,
      events,
      startDate,
    };
  }

  mapCurrentUserSubscriptionFeedSingleEvent(
    subscription: SubscriptionFeedSingleEventRecord,
  ): CurrentUserSubscriptionFeedSingleEvent {
    return {
      type: 'SINGLE_EVENT',
      subscriptionId: subscription.id,
      eventId: subscription.eventId,
      event: subscription.event,
      date: subscription.event.startDate,
      createdAt: subscription.createdAt,
    };
  }

  mapCurrentUserSubscriptionFeedEventGroup(
    subscription: EventGroupSubscriptionRecord,
    date: Date,
  ): CurrentUserSubscriptionFeedEventGroup {
    return {
      type: 'EVENT_GROUP',
      subscriptionId: subscription.id,
      eventGroupId: subscription.eventGroupId,
      eventGroup: this.mapPublicEventGroup(subscription.eventGroup),
      date,
      createdAt: subscription.createdAt,
    };
  }

  mapCurrentUserSubscriptionFeedSingleEventItem(
    subscription: SubscriptionFeedSingleEventRecord,
    participation?: CurrentUserEventParticipation,
  ): CurrentUserSubscriptionFeedItem {
    return {
      ...this.mapCurrentUserSubscriptionFeedSingleEvent(subscription),
      participation: participation ?? this.getSubscribedParticipation(),
    };
  }

  mapCurrentUserSubscriptionFeedEventGroupItem(
    subscription: EventGroupSubscriptionRecord,
    date: Date,
    participation?: CurrentUserEventParticipation,
  ): CurrentUserSubscriptionFeedItem {
    return {
      ...this.mapCurrentUserSubscriptionFeedEventGroup(subscription, date),
      participation: participation ?? this.getSubscribedParticipation(),
    };
  }

  mapCurrentUserEventFeedItem(
    event: PublicEvent,
    participation: CurrentUserEventParticipation,
  ): CurrentUserSubscriptionFeedItem {
    return {
      type: 'SINGLE_EVENT',
      eventId: event.id,
      event,
      date: event.startDate,
      createdAt: event.startDate,
      participation,
    };
  }

  getSubscribedParticipation(): CurrentUserEventParticipation {
    return {
      isSubscribed: true,
      isLecturer: false,
      hasIssuedCertificate: false,
    };
  }

  getEarliestEventStartDate(events: PublicEvent[]): Date {
    return events.reduce(
      (earliestDate, event) =>
        event.startDate < earliestDate ? event.startDate : earliestDate,
      events[0].startDate,
    );
  }

  compareFeedDatesDescending(
    firstDate: Date,
    firstCreatedAt: Date,
    secondDate: Date,
    secondCreatedAt: Date,
  ): number {
    return (
      secondDate.getTime() - firstDate.getTime() ||
      secondCreatedAt.getTime() - firstCreatedAt.getTime()
    );
  }
}
