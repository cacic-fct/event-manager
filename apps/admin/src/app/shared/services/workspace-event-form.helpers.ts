import type { Event, EventDraft, EventInput } from '@cacic-fct/event-manager-admin-contracts';
import { addHours, differenceInMinutes, format, isAfter, isValid, parseISO, subHours } from 'date-fns';

const NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS = '2345689ABCDEFGHKMNPQRSTWXYZ';
const BANNED_ATTENDANCE_CODES = new Set([
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  'AAAA',
  'BBBB',
  'CCCC',
  'DDDD',
  'EEEE',
  'FFFF',
  'GGGG',
  'HHHH',
  'KKKK',
  'MMMM',
  'NNNN',
  'PPPP',
  'QQQQ',
  'RRRR',
  'SSSS',
  'TTTT',
  'WWWW',
  'XXXX',
  'YYYY',
  'ZZZZ',
  'PENS',
  'ANWS',
]);

const DEFAULT_EVENT_DURATION_HOURS = 1;

export const DEFAULT_DRAFT_EVENT_NAME = 'Evento sem título';
export const DEFAULT_DRAFT_EVENT_EMOJI = '❔';

export function createOnlineAttendanceCode(): string {
  let code = '';
  do {
    code = Array.from(
      { length: 4 },
      () => NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS[getRandomIndex(NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS.length)],
    ).join('');
  } while (BANNED_ATTENDANCE_CODES.has(code));

  return code;
}

export function eventFromDraft(eventItem: Event, draft: EventDraft): Event {
  const payload = parseEventDraftPayload(draft);
  return {
    ...eventItem,
    name: stringValue(payload.name, eventItem.name),
    creditMinutes: numberOrNullValue(payload.creditMinutes, eventItem.creditMinutes ?? null),
    startDate: stringValue(payload.startDate, eventItem.startDate),
    endDate: stringValue(payload.endDate, eventItem.endDate),
    emoji: stringValue(payload.emoji, eventItem.emoji),
    type: stringValue(payload.type, eventItem.type) as Event['type'],
    description: nullableStringValue(payload.description, eventItem.description ?? null),
    shortDescription: nullableStringValue(payload.shortDescription, eventItem.shortDescription ?? null),
    latitude: numberOrNullValue(payload.latitude, eventItem.latitude ?? null),
    longitude: numberOrNullValue(payload.longitude, eventItem.longitude ?? null),
    locationDescription: nullableStringValue(payload.locationDescription, eventItem.locationDescription ?? null),
    majorEventId: nullableStringValue(payload.majorEventId, eventItem.majorEventId ?? null),
    eventGroupId: nullableStringValue(payload.eventGroupId, eventItem.eventGroupId ?? null),
    allowSubscription: booleanValue(payload.allowSubscription, eventItem.allowSubscription),
    subscriptionStartDate: nullableStringValue(payload.subscriptionStartDate, eventItem.subscriptionStartDate ?? null),
    subscriptionEndDate: nullableStringValue(payload.subscriptionEndDate, eventItem.subscriptionEndDate ?? null),
    slots: numberOrNullValue(payload.slots, eventItem.slots ?? null),
    autoSubscribe: booleanValue(payload.autoSubscribe, eventItem.autoSubscribe),
    shouldIssueCertificate: booleanValue(payload.shouldIssueCertificate, eventItem.shouldIssueCertificate),
    shouldIssueCertificateForNonPayingAttendees: booleanValue(
      payload.shouldIssueCertificateForNonPayingAttendees,
      eventItem.shouldIssueCertificateForNonPayingAttendees,
    ),
    shouldIssueCertificateForNonSubscribedAttendees: booleanValue(
      payload.shouldIssueCertificateForNonSubscribedAttendees,
      eventItem.shouldIssueCertificateForNonSubscribedAttendees,
    ),
    shouldCollectAttendance: booleanValue(payload.shouldCollectAttendance, eventItem.shouldCollectAttendance),
    isOnlineAttendanceAllowed: booleanValue(payload.isOnlineAttendanceAllowed, eventItem.isOnlineAttendanceAllowed),
    shouldProvideSubscriberListToLecturer: booleanValue(
      payload.shouldProvideSubscriberListToLecturer,
      eventItem.shouldProvideSubscriberListToLecturer ?? false,
    ),
    onlineAttendanceCode: nullableStringValue(payload.onlineAttendanceCode, eventItem.onlineAttendanceCode ?? null),
    onlineAttendanceStartDate: nullableStringValue(
      payload.onlineAttendanceStartDate,
      eventItem.onlineAttendanceStartDate ?? null,
    ),
    onlineAttendanceEndDate: nullableStringValue(
      payload.onlineAttendanceEndDate,
      eventItem.onlineAttendanceEndDate ?? null,
    ),
    publiclyVisible: booleanValue(payload.publiclyVisible, eventItem.publiclyVisible),
    youtubeCode: nullableStringValue(payload.youtubeCode, eventItem.youtubeCode ?? null),
    buttonText: nullableStringValue(payload.buttonText, eventItem.buttonText ?? null),
    buttonLink: nullableStringValue(payload.buttonLink, eventItem.buttonLink ?? null),
  };
}

export function parseEventDraftPayload(draft: EventDraft): EventInput {
  try {
    const parsed: unknown = JSON.parse(draft.payloadJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as EventInput) : {};
  } catch {
    return {};
  }
}

export function resolveEventDates(
  rawStartDate: string,
  rawEndDate: string,
  allowIncompleteDraft: boolean,
): { startDate: string; endDate: string } {
  if (!allowIncompleteDraft || (rawStartDate && rawEndDate)) {
    return {
      startDate: toIsoDateTime(rawStartDate),
      endDate: toIsoDateTime(rawEndDate),
    };
  }

  if (rawStartDate) {
    const startDate = parseISO(rawStartDate);
    return {
      startDate: startDate.toISOString(),
      endDate: addHours(startDate, DEFAULT_EVENT_DURATION_HOURS).toISOString(),
    };
  }

  if (rawEndDate) {
    const endDate = parseISO(rawEndDate);
    return {
      startDate: subHours(endDate, DEFAULT_EVENT_DURATION_HOURS).toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  const startDate = new Date();
  return {
    startDate: startDate.toISOString(),
    endDate: addHours(startDate, DEFAULT_EVENT_DURATION_HOURS).toISOString(),
  };
}

export function toOptionalIsoDateTime(rawValue: string): string | null {
  return rawValue.trim() ? toIsoDateTime(rawValue) : null;
}

export function toOptionalNumber(rawValue: number | string | null): number | null {
  if (rawValue == null || rawValue === '') {
    return null;
  }

  return Number(rawValue);
}

export function fromIsoToLocalInput(rawValue: string): string {
  return format(parseISO(rawValue), "yyyy-MM-dd'T'HH:mm");
}

export function calculateDurationMinutes(startDate: string, endDate: string): number | null {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (!isValid(start) || !isValid(end) || !isAfter(end, start)) {
    return null;
  }

  return differenceInMinutes(end, start);
}

function toIsoDateTime(rawValue: string): string {
  return parseISO(rawValue).toISOString();
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' || value === null ? value : fallback;
}

function numberOrNullValue(value: unknown, fallback: number | null): number | null {
  return typeof value === 'number' || value === null ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getRandomIndex(maxExclusive: number): number {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return randomValue[0] % maxExclusive;
}
