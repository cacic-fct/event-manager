import type {
  CertificateScope,
  EventTargetType,
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
} from '@cacic-fct/event-manager-public-contracts';

export interface CurrentUserEventAttendance {
  eventId: string;
  attendedAt: string;
  createdAt?: string;
}

export interface CurrentUserMajorEventSubscription {
  id: string;
  majorEventId: string;
  majorEvent: PublicMajorEvent;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  selectedEvents?: PublicEvent[];
  notSubscribedEvents?: PublicEvent[];
}

export interface CurrentUserEventParticipation {
  isSubscribed: boolean;
  isLecturer: boolean;
  hasIssuedCertificate: boolean;
}

export interface CurrentUserMajorEventFeedItem {
  id: string;
  majorEventId: string;
  majorEvent: PublicMajorEvent;
  subscriptionStatus?: string | null;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  selectedEvents?: PublicEvent[];
  notSubscribedEvents?: PublicEvent[];
  participation: CurrentUserEventParticipation;
}

export interface CurrentUserEventSubscription {
  eventId: string;
  event: PublicEvent;
  eventGroupSubscriptionId?: string | null;
  createdAt: string;
}

export interface CurrentUserEventGroupSubscription {
  id: string;
  eventGroupId: string;
  eventGroup: PublicEventGroup;
  events: PublicEvent[];
  createdAt: string;
}

export interface SubscribedSingleEventItem {
  __typename: 'SubscribedSingleEventItem';
  id: string;
  type: 'single';
  startDate: string;
  event: PublicEvent;
  participation: CurrentUserEventParticipation;
}

export interface SubscribedEventGroupItem {
  __typename: 'SubscribedEventGroupItem';
  id: string;
  type: 'group';
  startDate: string;
  eventGroup: PublicEventGroup;
  events: PublicEvent[];
  participation: CurrentUserEventParticipation;
}

export type SubscribedItem = SubscribedSingleEventItem | SubscribedEventGroupItem;

export interface SubscriptionsFeed {
  majorEventItems: CurrentUserMajorEventFeedItem[];
  eventItems: SubscribedItem[];
  attendances: CurrentUserEventAttendance[];
}

export interface MajorEventDetails {
  subscription: CurrentUserMajorEventSubscription | null;
  majorEvent?: PublicMajorEvent | null;
  hasIssuedCertificate?: boolean;
  isLecturer?: boolean;
  attendances: CurrentUserEventAttendance[];
}

export interface EventDetails {
  subscription: CurrentUserEventSubscription | null;
  event?: PublicEvent | null;
  hasIssuedCertificate?: boolean;
  isLecturer?: boolean;
  attendance: CurrentUserEventAttendance | null;
}

export interface EventGroupDetails {
  subscription: CurrentUserEventGroupSubscription | null;
  eventGroup?: PublicEventGroup | null;
  events?: PublicEvent[];
  hasIssuedCertificate?: boolean;
  isLecturer?: boolean;
  attendances: CurrentUserEventAttendance[];
}

export interface CertificateTemplate {
  id: string;
  name: string;
  version?: number | null;
}

export interface CertificateConfig {
  id: string;
  name: string;
  scope: CertificateScope;
  certificateText?: string | null;
  certificateTemplate: CertificateTemplate;
}

export interface Certificate {
  id: string;
  configId: string;
  config: CertificateConfig;
  issuedAt: string;
  certificateTemplate: CertificateTemplate;
}

export interface CertificateTarget {
  scope: CertificateScope;
  targetId: string;
}

export interface InfoRow {
  label: string;
  value: string;
}

export interface DetailEventItem {
  event: PublicEvent;
  dateLine: string;
  statusLine: string;
  canRegisterAttendance: boolean;
}

export interface DetailViewModel {
  targetType: EventTargetType;
  targetId: string;
  typeLabel: string;
  title: string;
  emoji: string;
  dateLine: string;
  description?: string | null;
  location?: string | null;
  statusLabel?: string;
  isSubscribed: boolean;
  subscriptionStatus?: string | null;
  infoRows: InfoRow[];
  events: DetailEventItem[];
  notSubscribedEvents: DetailEventItem[];
  certificateTargets: CertificateTarget[];
  shouldIssueCertificate: boolean;
  canViewOrganizerInfo?: boolean;
  buttonText?: string | null;
  buttonLink?: string | null;
}
