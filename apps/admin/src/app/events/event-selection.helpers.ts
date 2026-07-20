import { Event, EventGroup, MajorEvent, PlacePreset } from '@cacic-fct/event-manager-admin-contracts';

export const CUSTOM_PLACE_PRESET_ID = 'PERSONALIZADO';

export type EventGroupResolution =
  | { status: 'none' }
  | { status: 'found'; group: EventGroup }
  | { status: 'unresolved' };

export type MajorEventResolution =
  | { status: 'none' }
  | { status: 'found'; majorEvent: MajorEvent }
  | { status: 'unresolved' };

export function resolveMajorEventSelection(
  eventItem: Event,
  searchResults: readonly MajorEvent[],
  majorEvents: readonly MajorEvent[] = [],
): MajorEventResolution {
  if (!eventItem.majorEventId) {
    return { status: 'none' };
  }
  if (eventItem.majorEvent?.id === eventItem.majorEventId) {
    return { status: 'found', majorEvent: eventItem.majorEvent as MajorEvent };
  }
  const majorEvent = [...searchResults, ...majorEvents].find((item) => item.id === eventItem.majorEventId);
  return majorEvent ? { status: 'found', majorEvent } : { status: 'unresolved' };
}

export function resolveMajorEventSelectionInput(
  majorEvent: MajorEvent | null,
  hasMajorEvent: boolean,
): MajorEventResolution {
  if (majorEvent) {
    return { status: 'found', majorEvent };
  }
  return hasMajorEvent ? { status: 'unresolved' } : { status: 'none' };
}

export function resolveEventGroupSelectionInput(group: EventGroup | null, hasEventGroup: boolean): EventGroupResolution {
  if (group) {
    return { status: 'found', group };
  }
  return hasEventGroup ? { status: 'unresolved' } : { status: 'none' };
}

export function getEventGroupCertificatePermissions(resolution: EventGroupResolution): {
  allowsCertificates: boolean | null;
  allowsNonPayingCertificates: boolean | null;
  allowsNonSubscribedCertificates: boolean | null;
} {
  if (resolution.status === 'unresolved') {
    return { allowsCertificates: null, allowsNonPayingCertificates: null, allowsNonSubscribedCertificates: null };
  }
  const allowsCertificates = resolution.status === 'found' ? resolution.group.shouldIssueCertificate ?? true : true;
  return {
    allowsCertificates,
    allowsNonPayingCertificates:
      resolution.status === 'found'
        ? resolution.group.shouldIssueCertificateForNonPayingAttendees ?? allowsCertificates
        : allowsCertificates,
    allowsNonSubscribedCertificates:
      resolution.status === 'found'
        ? resolution.group.shouldIssueCertificateForNonSubscribedAttendees ?? allowsCertificates
        : allowsCertificates,
  };
}

export function findMatchingPlacePreset(
  input: Pick<PlacePreset, 'latitude' | 'longitude' | 'locationDescription'>,
  placePresets: readonly PlacePreset[],
): PlacePreset | null {
  const description = normalizePlaceText(input.locationDescription);
  if (!description) {
    return null;
  }
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  return (
    placePresets.find(
      (place) =>
        normalizePlaceText(place.locationDescription ?? place.name) === description &&
        (place.latitude ?? null) === latitude &&
        (place.longitude ?? null) === longitude,
    ) ?? null
  );
}

export function uniquePlacePresets(...collections: readonly PlacePreset[][]): PlacePreset[] {
  const places = new Map<string, PlacePreset>();
  for (const collection of collections) {
    for (const place of collection) {
      places.set(place.id, place);
    }
  }
  return [...places.values()];
}

function normalizePlaceText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
