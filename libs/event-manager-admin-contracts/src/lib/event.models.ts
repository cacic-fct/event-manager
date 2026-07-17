export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type PublicationState = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'UNPUBLISHED';
export type PublicationTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type PriceType = 'SINGLE' | 'TIERED';

export interface EventSummary {
  id: string;
  eventGroupId: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  name: string;
  majorEvent?: Pick<MajorEvent, 'id' | 'name'> | null;
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
  maxUncategorizedPerAttendee?: number | null;
  rankedSubscriptionEnabled?: boolean | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired: boolean;
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfo | null;
  majorEventPrices: MajorEventPrice[];
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface PaymentInfo {
  id: string;
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  pixKey?: string | null;
  pixCity?: string | null;
  majorEventId: string;
}

export interface MajorEventPriceTier {
  id: string;
  name: string;
  value: number;
}

export interface MajorEventPrice {
  id: string;
  type: PriceType;
  tiers: MajorEventPriceTier[];
}

export interface EventGroup {
  id: string;
  name: string;
  emoji: string;
  shouldIssueCertificate: boolean;
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
  shouldIssueCertificateForEachEvent: boolean;
  shouldIssuePartialCertificate: boolean;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
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
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  shouldProvideSubscriberListToLecturer?: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible: boolean;
  displayLecturerProfile: boolean;
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventDraft {
  id: string;
  sourceEventId: string;
  name: string;
  payloadJson: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface PlacePreset {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface MajorEventInput {
  publishAfterUpdate?: boolean;
  id?: string;
  name?: string;
  emoji?: string;
  startDate?: string;
  endDate?: string;
  description?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  maxCoursesPerAttendee?: number | null;
  maxLecturesPerAttendee?: number | null;
  maxUncategorizedPerAttendee?: number | null;
  rankedSubscriptionEnabled?: boolean | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfoInput | null;
  price?: MajorEventPriceInput | null;
}

export interface MajorEventClonePartsInput {
  certificateConfig?: boolean;
  subscriptionSettings?: boolean;
  paymentSettings?: boolean;
}

export interface MajorEventCloneInput {
  name?: string;
  parts?: MajorEventClonePartsInput;
}

export interface PaymentInfoInput {
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  pixKey?: string;
  pixCity?: string;
}

export interface PriceTierInput {
  id?: string;
  name: string;
  value: number;
}

export interface MajorEventPriceInput {
  type: PriceType;
  tiers: PriceTierInput[];
}

export interface EventGroupInput {
  id?: string;
  name?: string;
  emoji?: string;
  shouldIssueCertificate?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  shouldIssueCertificateForEachEvent?: boolean;
  shouldIssuePartialCertificate?: boolean;
}

export interface EventGroupClonePartsInput {
  certificateConfig?: boolean;
}

export interface EventGroupCloneInput {
  name?: string;
  parts?: EventGroupClonePartsInput;
}

export interface EventInput {
  publishAfterUpdate?: boolean;
  id?: string;
  name?: string;
  creditMinutes?: number | null;
  startDate?: string;
  endDate?: string;
  emoji?: string;
  type?: EventType;
  description?: string | null;
  shortDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  allowSubscription?: boolean;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  slots?: number | null;
  autoSubscribe?: boolean;
  shouldIssueCertificate?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  shouldCollectAttendance?: boolean;
  isOnlineAttendanceAllowed?: boolean;
  shouldProvideSubscriberListToLecturer?: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible?: boolean;
  displayLecturerProfile?: boolean;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  lecturerPersonIds?: string[] | null;
  attendanceCollectorPersonIds?: string[] | null;
}

export interface EventClonePartsInput {
  lecturers?: boolean;
  certificateConfig?: boolean;
  subscriptionSettings?: boolean;
  attendanceSettings?: boolean;
  place?: boolean;
  visibility?: boolean;
}

export interface EventCloneInput {
  name?: string;
  parts?: EventClonePartsInput;
}

export interface PlacePresetInput {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
}
