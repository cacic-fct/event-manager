import { Prisma } from '@prisma/client';
import type { EventSearchDocument } from './typesense-search.types';
import { toOptionalString, toUnixTimestamp } from './typesense-search.shared';

type EventSearchSource = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  description?: string | null;
  shortDescription?: string | null;
  locationDescription?: string | null;
  majorEventId?: string | null;
  majorEvent?: { name: string; deletedAt: Date | null; publicationState: string } | null;
  majorEventName?: string;
  majorEventPublicationState?: string;
  eventGroupId?: string | null;
  eventGroup?: EventGroupCertificateContext | null;
  eventGroupName?: string;
  startDate: Date;
  endDate: Date;
  shouldIssueCertificate?: boolean | null;
  publiclyVisible?: boolean | null;
  publicationState?: string | null;
};

type EventGroupCertificateContext = {
  name?: string;
  deletedAt?: Date | string | null;
  shouldIssueCertificate?: boolean | null;
  shouldIssueCertificateForEachEvent?: boolean | null;
};

export const EVENT_SEARCH_SELECT = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  description: true,
  shortDescription: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: {
      name: true,
      deletedAt: true,
      publicationState: true,
    },
  },
  eventGroupId: true,
  eventGroup: {
    select: {
      name: true,
      deletedAt: true,
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: true,
    },
  },
  startDate: true,
  endDate: true,
  shouldIssueCertificate: true,
  publiclyVisible: true,
  publicationState: true,
} satisfies Prisma.EventSelect;

export function toEventSearchDocument(event: EventSearchSource): EventSearchDocument {
  return {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    type: event.type,
    description: toOptionalString(event.description),
    shortDescription: toOptionalString(event.shortDescription),
    locationDescription: toOptionalString(event.locationDescription),
    majorEventId: toOptionalString(event.majorEventId),
    majorEventName:
      event.majorEventName ??
      (event.majorEvent?.deletedAt ? undefined : toOptionalString(event.majorEvent?.name)),
    majorEventPublicationState:
      event.majorEventPublicationState ?? materializeMajorEventPublicationState(event.majorEvent),
    eventGroupId: toOptionalString(event.eventGroupId),
    eventGroupName:
      event.eventGroupName ??
      (event.eventGroup?.deletedAt ? undefined : toOptionalString(event.eventGroup?.name)),
    startDate: toUnixTimestamp(event.startDate),
    endDate: toUnixTimestamp(event.endDate),
    publiclyVisible: Boolean(event.publiclyVisible),
    publicationState: event.publicationState ?? 'DRAFT',
    isIssuableCertificateEvent: isIssuableCertificateEvent(event),
  };
}

export function materializeMajorEventPublicationState(
  majorEvent?: { deletedAt: Date | null; publicationState: string } | null,
): string {
  if (!majorEvent) {
    return 'PUBLISHED';
  }

  if (majorEvent.deletedAt) {
    return 'UNPUBLISHED';
  }

  return majorEvent.publicationState;
}

export function isIssuableCertificateEvent(input: {
  eventGroup?: EventGroupCertificateContext | null;
  eventGroupId?: string | null;
  majorEventId?: string | null;
  shouldIssueCertificate?: boolean | null;
}): boolean {
  if (input.majorEventId || !input.shouldIssueCertificate) {
    return false;
  }

  if (!input.eventGroupId) {
    return true;
  }

  return Boolean(
    input.eventGroup &&
      !input.eventGroup.deletedAt &&
      input.eventGroup.shouldIssueCertificate &&
      input.eventGroup.shouldIssueCertificateForEachEvent,
  );
}
