export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type CertificateScope =
  | 'MAJOR_EVENT'
  | 'EVENT_GROUP'
  | 'EVENT'
  | 'OTHER';
export type CertificateIssuedTo = 'ATTENDEE' | 'LECTURER' | 'OTHER';

export interface PaymentInfo {
  id: string;
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  majorEventId: string;
}

export interface MajorEvent {
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
  isPaymentRequired: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfo | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventGroup {
  id: string;
  name: string;
  emoji: string;
  shouldIssueCertificate: boolean;
  shouldIssueCertificateForEachEvent: boolean;
  shouldIssuePartialCertificate: boolean;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  isActive: boolean;
  certificateFieldsJson?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  deletedAt?: string | null;
}

export interface CertificateConfig {
  id: string;
  name: string;
  scope: CertificateScope;
  majorEventId?: string | null;
  majorEvent?: MajorEvent | null;
  eventGroupId?: string | null;
  eventGroup?: EventGroup | null;
  eventId?: string | null;
  event?: Event | null;
  certificateTemplateId: string;
  certificateTemplate: CertificateTemplate;
  certificateText?: string | null;
  isActive: boolean;
  issuedTo: CertificateIssuedTo;
  certificateFieldsJson?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  deletedAt?: string | null;
}

export interface Certificate {
  id: string;
  personId: string;
  person: Person;
  configId: string;
  config: CertificateConfig;
  renderedDataJson: string;
  issuedAt: string;
  issuedById?: string | null;
  certificateTemplateId: string;
  certificateTemplate: CertificateTemplate;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CertificateDownload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface Event {
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
  majorEvent?: MajorEvent | null;
  eventGroupId?: string | null;
  eventGroup?: EventGroup | null;
  allowSubscription: boolean;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  slots?: number | null;
  autoSubscribe: boolean;
  shouldIssueCertificate: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible: boolean;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

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
  emoji?: string | null;
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

export interface User {
  id: string;
  email: string;
  name: string;
  identityDocument?: string | null;
  academicId?: string | null;
  role: string;
}

export interface Person {
  id: string;
  name: string;
  email?: string | null;
  secondaryEmails?: string[] | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
  user?: User | null;
  mergedIntoId?: string | null;
  externalRef?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventAttendance {
  personId: string;
  eventId: string;
  person?: Person | null;
  event?: Event | null;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
}

export interface AuthenticatedUser {
  sub?: string;
  preferredUsername?: string;
  email?: string;
  token: string;
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
