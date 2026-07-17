import type { Event, MajorEvent, Person, User } from './frontend-types';
import type { PublicEvent, PublicEventGroup, PublicMajorEvent } from './frontend-public-event.types';

export interface AuthenticatedUser {
  sub?: string;
  preferredUsername?: string;
  email?: string;
  roles: string[];
  permissions: string[];
  oidcScopes: string[];
  scopes: string[];
}

export interface CurrentUserProfileContext {
  sub?: string;
  email?: string;
  preferredUsername?: string;
  authenticatedUser: AuthenticatedUser;
  user?: User | null;
  person?: Person | null;
}

export interface CurrentUserMajorEventSubscription {
  id: string;
  majorEventId: string;
  majorEvent: MajorEvent;
  personId: string;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  selectedEvents: Event[];
}

export interface CurrentUserMajorEventSubscriptionRecord {
  id: string;
  majorEventId: string;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  majorEvent: PublicMajorEvent;
  selectedEvents: PublicEvent[];
}

export interface CurrentUserEventSubscription {
  eventId: string;
  event: PublicEvent;
  eventGroupSubscriptionId?: string | null;
  createdAt: string;
}

export interface CurrentUserEventGroupSubscriptionRecord {
  id: string;
  eventGroupId: string;
  eventGroup: PublicEventGroup;
  events: PublicEvent[];
  createdAt: string;
}

export interface CurrentUserSubscriptionFeedSingleEvent {
  type: 'SINGLE_EVENT';
  subscriptionId: string;
  eventId: string;
  event: PublicEvent;
  date: string;
  createdAt: string;
}

export interface CurrentUserSubscriptionFeedEventGroup {
  type: 'EVENT_GROUP';
  subscriptionId: string;
  eventGroupId: string;
  eventGroup: PublicEventGroup;
  date: string;
  createdAt: string;
}

export type CurrentUserSubscriptionFeedItem =
  | CurrentUserSubscriptionFeedSingleEvent
  | CurrentUserSubscriptionFeedEventGroup;

export interface CurrentUserSubscriptionFeed {
  items: CurrentUserSubscriptionFeedItem[];
}

export interface CurrentUserEventAttendance {
  eventId: string;
  event: PublicEvent;
  attendedAt: string;
  createdAt: string;
}
