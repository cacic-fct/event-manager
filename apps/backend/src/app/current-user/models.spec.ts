import { PublicEvent, PublicEventGroup, PublicMajorEvent } from '../public-events/models';
import {
  ConfirmCurrentUserOnlineAttendanceInput,
  CurrentUserAttendanceCollectionEvent,
  CurrentUserEventAttendance,
  CurrentUserEventGroupSubscription,
  CurrentUserEventParticipation,
  CurrentUserEventSubscription,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  CurrentUserOrganizerEventInfo,
  CurrentUserOrganizerInfo,
  CurrentUserPendingOnlineAttendanceEvent,
  CurrentUserProfileContext,
  CurrentUserSubscriptionFeed,
  CurrentUserSubscriptionFeedEventGroup,
  CurrentUserSubscriptionFeedItem,
  CurrentUserSubscriptionFeedSingleEvent,
  SubscribedEventGroupItem,
  SubscribedSingleEventItem,
  UpsertCurrentUserMajorEventSubscriptionInput,
} from './models';

describe('current user GraphQL models', () => {
  it('keeps profile and attendance models assignable for resolver payloads', () => {
    const event = Object.assign(new PublicEvent(), { id: 'event-1' });
    const eventGroup = Object.assign(new PublicEventGroup(), { id: 'group-1' });
    const majorEvent = Object.assign(new PublicMajorEvent(), { id: 'major-event-1' });
    const createdAt = new Date('2026-05-23T12:00:00.000Z');

    expect(Object.assign(new CurrentUserProfileContext(), { sub: 'sub-1', email: 'ada@example.com' })).toMatchObject({
      sub: 'sub-1',
      email: 'ada@example.com',
    });
    expect(Object.assign(new CurrentUserEventAttendance(), { eventId: event.id, event, attendedAt: createdAt, createdAt }))
      .toMatchObject({ eventId: 'event-1' });
    expect(Object.assign(new CurrentUserPendingOnlineAttendanceEvent(), { eventId: event.id, event })).toMatchObject({
      eventId: 'event-1',
    });
    expect(Object.assign(new CurrentUserAttendanceCollectionEvent(), { eventId: event.id, event })).toMatchObject({
      eventId: 'event-1',
    });
    expect(
      Object.assign(new CurrentUserOrganizerEventInfo(), {
        event,
        subscriberCount: 3,
        attendanceCount: 2,
        onlineAttendanceCode: '123456',
        canDownloadSubscriberList: true,
      }),
    ).toMatchObject({ subscriberCount: 3, canDownloadSubscriberList: true });
    expect(
      Object.assign(new CurrentUserOrganizerInfo(), {
        targetType: 'event',
        targetId: event.id,
        title: 'Organizer',
        events: [new CurrentUserOrganizerEventInfo()],
      }),
    ).toMatchObject({ targetId: 'event-1', events: [{}] });
    expect(Object.assign(new CurrentUserEventSubscription(), { eventId: event.id, event, createdAt })).toMatchObject({
      eventId: 'event-1',
    });
    expect(
      Object.assign(new CurrentUserEventGroupSubscription(), {
        id: 'subscription-1',
        eventGroupId: eventGroup.id,
        eventGroup,
        events: [event],
        createdAt,
      }),
    ).toMatchObject({ eventGroupId: 'group-1', events: [event] });
    expect(
      Object.assign(new CurrentUserMajorEventSubscription(), {
        id: 'major-subscription-1',
        majorEventId: majorEvent.id,
        majorEvent,
        subscriptionStatus: 'CONFIRMED',
        amountPaid: 1000,
        paymentDate: createdAt,
        paymentTier: 'student',
        selectedEvents: [event],
        notSubscribedEvents: [],
      }),
    ).toMatchObject({ majorEventId: 'major-event-1', selectedEvents: [event] });
  });

  it('keeps feed models and input defaults stable', () => {
    const event = Object.assign(new PublicEvent(), { id: 'event-1' });
    const eventGroup = Object.assign(new PublicEventGroup(), { id: 'group-1' });
    const majorEvent = Object.assign(new PublicMajorEvent(), { id: 'major-event-1' });
    const createdAt = new Date('2026-05-23T12:00:00.000Z');
    const participation = Object.assign(new CurrentUserEventParticipation(), {
      isSubscribed: true,
      isLecturer: false,
      hasIssuedCertificate: false,
    });

    expect(
      Object.assign(new CurrentUserSubscriptionFeedSingleEvent(), {
        subscriptionId: 'subscription-1',
        eventId: event.id,
        event,
        date: createdAt,
        createdAt,
      }),
    ).toMatchObject({ type: 'SINGLE_EVENT', eventId: 'event-1' });
    expect(
      Object.assign(new CurrentUserSubscriptionFeedEventGroup(), {
        subscriptionId: 'subscription-2',
        eventGroupId: eventGroup.id,
        eventGroup,
        date: createdAt,
        createdAt,
      }),
    ).toMatchObject({ type: 'EVENT_GROUP', eventGroupId: 'group-1' });
    expect(
      Object.assign(new CurrentUserSubscriptionFeedItem(), {
        type: 'SINGLE_EVENT',
        subscriptionId: 'subscription-1',
        date: createdAt,
        createdAt,
        eventId: event.id,
        event,
        participation,
      }),
    ).toMatchObject({ type: 'SINGLE_EVENT', participation });
    expect(Object.assign(new CurrentUserSubscriptionFeed(), { items: [new CurrentUserSubscriptionFeedItem()] }))
      .toMatchObject({ items: [{}] });
    expect(Object.assign(new SubscribedSingleEventItem(), { id: 'item-1', event, startDate: createdAt })).toMatchObject({
      type: 'single',
      event,
    });
    expect(
      Object.assign(new SubscribedEventGroupItem(), {
        id: 'item-2',
        eventGroup,
        events: [event],
        startDate: createdAt,
      }),
    ).toMatchObject({ type: 'group', eventGroup });
    expect(
      Object.assign(new CurrentUserMajorEventFeedItem(), {
        id: 'feed-1',
        majorEventId: majorEvent.id,
        majorEvent,
        selectedEvents: [event],
        notSubscribedEvents: [],
        participation,
      }),
    ).toMatchObject({ majorEventId: 'major-event-1', participation });
    expect(
      Object.assign(new UpsertCurrentUserMajorEventSubscriptionInput(), {
        majorEventId: majorEvent.id,
        selectedEventIds: [event.id],
        amountPaid: 1000,
        paymentTier: 'student',
        desiredCourses: 1,
        desiredLectures: 2,
        desiredUncategorized: 3,
      }),
    ).toMatchObject({ majorEventId: 'major-event-1', selectedEventIds: ['event-1'] });
    expect(Object.assign(new ConfirmCurrentUserOnlineAttendanceInput(), { eventId: event.id, code: 'abc123' }))
      .toMatchObject({ eventId: 'event-1', code: 'abc123' });
  });
});
