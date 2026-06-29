import { Event, EventGroup, EventSummary, MajorEvent } from '@cacic-fct/event-manager-admin-contracts';
import { isBefore, isValid, max, parseISO, subMonths } from 'date-fns';

export type FreezeDates = {
  createdAt?: string | Date | null;
  endDate?: string | Date | null;
};

export function getFrozenCutoffDate(now = new Date()): Date {
  return subMonths(now, 2);
}

export function isFrozenFromDates(dates: Array<string | Date | null | undefined>, now = new Date()): boolean {
  const validDates = dates
    .map((date) => toDate(date))
    .filter((date): date is Date => date !== null);

  return validDates.length > 0 && isBefore(max(validDates), getFrozenCutoffDate(now));
}

export function isFrozenEvent(event: Pick<Event, 'createdAt' | 'endDate'> | null | undefined): boolean {
  return Boolean(event && isFrozenFromDates([event.createdAt, event.endDate]));
}

export function isFrozenMajorEvent(
  majorEvent: Pick<MajorEvent, 'createdAt' | 'endDate'> | null | undefined,
): boolean {
  return Boolean(majorEvent && isFrozenFromDates([majorEvent.createdAt, majorEvent.endDate]));
}

export function isFrozenEventGroup(
  eventGroup: Pick<EventGroup, 'createdAt'> | null | undefined,
  events: Array<Pick<Event | EventSummary, 'eventGroupId'> & FreezeDates>,
): boolean {
  if (!eventGroup) {
    return false;
  }

  return isFrozenFromDates([
    eventGroup.createdAt,
    ...events.flatMap((event) => [event.createdAt, event.endDate]),
  ]);
}

function toDate(date: string | Date | null | undefined): Date | null {
  if (typeof date !== 'string') {
    return date instanceof Date && isValid(date) ? date : null;
  }

  const parsedDate = parseISO(date);
  return isValid(parsedDate) ? parsedDate : null;
}
