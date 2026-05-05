export type EventTargetType = 'event' | 'event-group' | 'major-event';
export type CertificateScope =
  | 'EVENT'
  | 'EVENT_GROUP'
  | 'MAJOR_EVENT'
  | 'OTHER';
export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';

export interface PublicMajorEvent {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  description?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  maxCoursesPerAttendee?: number | null;
  maxLecturesPerAttendee?: number | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired?: boolean | null;
  additionalPaymentInfo?: string | null;
  shouldIssueCertificate?: boolean | null;
}

export interface PublicEventGroup {
  id: string;
  name: string;
  emoji: string;
  shouldIssueCertificateForEachEvent?: boolean | null;
  shouldIssuePartialCertificate?: boolean | null;
  shouldIssueCertificate?: boolean | null;
}

export interface PublicEvent {
  id: string;
  name: string;
  creditMinutes?: number | null;
  startDate: string;
  endDate: string;
  emoji: string;
  type: EventType;
  description?: string | null;
  shortDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
  majorEventId?: string | null;
  majorEvent?: PublicMajorEvent | null;
  eventGroupId?: string | null;
  eventGroup?: PublicEventGroup | null;
  allowSubscription?: boolean | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  slots?: number | null;
  shouldIssueCertificate?: boolean | null;
  shouldCollectAttendance?: boolean | null;
  isOnlineAttendanceAllowed?: boolean | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible?: boolean | null;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
}

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

export type SubscribedItem =
  | SubscribedSingleEventItem
  | SubscribedEventGroupItem;

export interface SubscriptionsFeed {
  majorEventItems: CurrentUserMajorEventFeedItem[];
  eventItems: SubscribedItem[];
  attendances: CurrentUserEventAttendance[];
}

export interface MajorEventDetails {
  subscription: CurrentUserMajorEventSubscription | null;
  majorEvent?: PublicMajorEvent | null;
  hasIssuedCertificate?: boolean;
  attendances: CurrentUserEventAttendance[];
}

export interface EventDetails {
  subscription: CurrentUserEventSubscription | null;
  event?: PublicEvent | null;
  hasIssuedCertificate?: boolean;
  attendance: CurrentUserEventAttendance | null;
}

export interface EventGroupDetails {
  subscription: CurrentUserEventGroupSubscription | null;
  eventGroup?: PublicEventGroup | null;
  events?: PublicEvent[];
  hasIssuedCertificate?: boolean;
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

export interface CertificateDownload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface PublicCertificateValidationEvent {
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  creditMinutes?: number | null;
}

export interface PublicCertificateValidationEventSection {
  title: string;
  type?: EventType | null;
  creditMinutes: number;
  events: PublicCertificateValidationEvent[];
}

export interface PublicCertificateValidation {
  id: string;
  issuedAt: string;
  personName: string;
  maskedIdentityDocument?: string | null;
  scope: CertificateScope;
  certificateName: string;
  targetName?: string | null;
  targetEmoji?: string | null;
  sections: PublicCertificateValidationEventSection[];
  totalCreditMinutes: number;
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
  typeLabel: string;
  title: string;
  emoji: string;
  dateLine: string;
  description?: string | null;
  location?: string | null;
  statusLabel?: string;
  infoRows: InfoRow[];
  events: DetailEventItem[];
  notSubscribedEvents: DetailEventItem[];
  certificateTargets: CertificateTarget[];
  shouldIssueCertificate: boolean;
  buttonText?: string | null;
  buttonLink?: string | null;
}
