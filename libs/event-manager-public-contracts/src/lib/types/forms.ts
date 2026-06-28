import type { DateTimeString } from './common';

export type EventFormSigilo = 'PUBLIC' | 'PARTIALLY_SECRET' | 'SECRET' | 'ANONYMOUS';
export type EventFormAudience = 'SUBSCRIBERS' | 'ATTENDEES' | 'SUBSCRIBERS_OR_ATTENDEES';
export type EventFormTargetType = 'EVENT' | 'MAJOR_EVENT';
export type EventFormResponseSource = 'PUBLIC_FORM' | 'SUBSCRIPTION_FLOW' | 'LECTURER_PUBLISH';

export interface PublicEventFormTargetSummary {
  type: EventFormTargetType;
  id: string;
  name: string;
  emoji?: string | null;
}

export interface PublicEventFormLink {
  id: string;
  formId: string;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  target?: PublicEventFormTargetSummary | null;
  audience: EventFormAudience;
  insertInSubscriptionFlow: boolean;
  requiredInSubscriptionFlow: boolean;
  enforceRequiredAnswers: boolean;
  displayOrder: number;
  availableFrom?: DateTimeString | null;
  availableUntil?: DateTimeString | null;
  notifyOnPublish: boolean;
  allowLecturerManualPublish: boolean;
  lastNotifiedAt?: DateTimeString | null;
  responseCount: number;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface PublicEventForm {
  id: string;
  name: string;
  description?: string | null;
  elementsJson: string;
  sigilo: EventFormSigilo;
  resultsPublic: boolean;
  resultsLive: boolean;
  publicationState: string;
  links: PublicEventFormLink[];
  responseCount: number;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface PublicEventFormResponse {
  id: string;
  formId: string;
  linkId?: string | null;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  personId?: string | null;
  respondentName?: string | null;
  respondentEmail?: string | null;
  answersJson: string;
  source: EventFormResponseSource;
  submittedAt?: DateTimeString | null;
  updatedAt: DateTimeString;
}

export interface PublicEventFormResults {
  form: PublicEventForm;
  responseCount: number;
  anonymous: boolean;
  answersReleased: boolean;
  summaryJson: string;
  responses: PublicEventFormResponse[];
}

export interface SubmitPublicEventFormResponseInput {
  formId: string;
  linkId?: string | null;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  answersJson: string;
  source?: EventFormResponseSource | null;
}
