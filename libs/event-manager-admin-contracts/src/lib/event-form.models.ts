import type { FormElement } from '@cacic-fct/form-contracts';
import type { PublicationState } from './event.models';

export type EventFormSigilo = 'PUBLIC' | 'PARTIALLY_SECRET' | 'SECRET' | 'ANONYMOUS';
export type EventFormAudience = 'SUBSCRIBERS' | 'ATTENDEES' | 'SUBSCRIBERS_OR_ATTENDEES';
export type EventFormTargetType = 'EVENT' | 'MAJOR_EVENT';
export type EventFormResponseSource = 'PUBLIC_FORM' | 'SUBSCRIPTION_FLOW' | 'LECTURER_PUBLISH';
export type EventFormResponseMode = 'ONE_PER_TARGET' | 'MULTIPLE_PER_TARGET' | 'SINGLE_PER_FORM';

export interface EventFormTargetSummary {
  type: EventFormTargetType;
  id: string;
  name: string;
  emoji?: string | null;
}

export interface EventFormLink {
  id: string;
  formId: string;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  target?: EventFormTargetSummary | null;
  audience: EventFormAudience;
  insertInSubscriptionFlow: boolean;
  requiredInSubscriptionFlow: boolean;
  enforceRequiredAnswers: boolean;
  displayOrder: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish: boolean;
  allowLecturerManualPublish: boolean;
  lastNotifiedAt?: string | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventForm {
  id: string;
  name: string;
  description?: string | null;
  ownerEventId?: string | null;
  ownerMajorEventId?: string | null;
  owner?: EventFormTargetSummary | null;
  elementsJson: string;
  sigilo: EventFormSigilo;
  responseMode: EventFormResponseMode;
  resultsPublic: boolean;
  resultsLive: boolean;
  allowResponseEdits: boolean;
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  links: EventFormLink[];
  responseCount: number;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventFormDraft {
  id: string;
  sourceFormId: string;
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

export interface EventFormResponse {
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
  submittedAt?: string | null;
  updatedAt: string;
}

export interface EventFormResults {
  form: EventForm;
  responseCount: number;
  anonymous: boolean;
  answersReleased: boolean;
  summaryJson: string;
  responses: EventFormResponse[];
}

interface EventFormLinkInputBase {
  id?: string | null;
  audience?: EventFormAudience | null;
  insertInSubscriptionFlow?: boolean | null;
  requiredInSubscriptionFlow?: boolean | null;
  enforceRequiredAnswers?: boolean | null;
  displayOrder?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish?: boolean | null;
  allowLecturerManualPublish?: boolean | null;
}

export type EventFormLinkInput =
  | (EventFormLinkInputBase & { targetType: 'EVENT'; eventId: string; majorEventId?: null })
  | (EventFormLinkInputBase & { targetType: 'MAJOR_EVENT'; eventId?: null; majorEventId: string });

interface EventFormInputBase {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  elementsJson?: string | null;
  sigilo?: EventFormSigilo | null;
  responseMode?: EventFormResponseMode | null;
  resultsPublic?: boolean | null;
  resultsLive?: boolean | null;
  allowResponseEdits?: boolean | null;
  links?: EventFormLinkInput[] | null;
}

export type EventFormInput =
  | (EventFormInputBase & { ownerEventId: string; ownerMajorEventId?: null })
  | (EventFormInputBase & { ownerEventId?: null; ownerMajorEventId: string });

interface SubmitEventFormResponseBaseInput {
  formId: string;
  linkId?: string | null;
  answersJson: string;
}

export type SubmitEventFormResponseInput =
  | (SubmitEventFormResponseBaseInput & { targetType: 'EVENT'; eventId: string; majorEventId?: null })
  | (SubmitEventFormResponseBaseInput & { targetType: 'MAJOR_EVENT'; eventId?: null; majorEventId: string });

export function parseFormElementsJson(value: string | null | undefined): FormElement[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as FormElement[]) : [];
  } catch {
    return [];
  }
}

export function serializeFormElements(elements: readonly FormElement[]): string {
  return JSON.stringify(elements);
}
