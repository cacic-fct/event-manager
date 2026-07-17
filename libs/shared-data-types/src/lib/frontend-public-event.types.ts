import type { ContactType, EventType } from './frontend-types';

export interface PublicPaymentInfo {
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

export interface PublicMajorEventPriceTier {
  id: string;
  name: string;
  value: number;
}

export interface PublicMajorEventPrice {
  id: string;
  type: 'SINGLE' | 'TIERED';
  tiers: PublicMajorEventPriceTier[];
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
  maxUncategorizedPerAttendee?: number | null;
  rankedSubscriptionEnabled?: boolean | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired?: boolean | null;
  shouldIssueCertificateForNonPayingAttendees?: boolean | null;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean | null;
  additionalPaymentInfo?: string | null;
  shouldIssueCertificate?: boolean | null;
  paymentInfo?: PublicPaymentInfo | null;
  majorEventPrices?: PublicMajorEventPrice[];
}

export interface PublicEventGroup {
  id: string;
  name: string;
  emoji?: string | null;
  shouldIssueCertificateForEachEvent?: boolean | null;
  shouldIssuePartialCertificate?: boolean | null;
  shouldIssueCertificate?: boolean | null;
  shouldIssueCertificateForNonPayingAttendees?: boolean | null;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean | null;
}

export interface PublicLecturerProfile {
  id: string;
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture: boolean;
  googleUserPicture?: string | null;
  email?: string | null;
  whatsapp?: string | null;
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
  shouldIssueCertificateForNonPayingAttendees?: boolean | null;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean | null;
  shouldCollectAttendance?: boolean | null;
  isOnlineAttendanceAllowed?: boolean | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible?: boolean | null;
  displayLecturerProfile?: boolean | null;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  lecturers?: PublicLecturerProfile[];
}
