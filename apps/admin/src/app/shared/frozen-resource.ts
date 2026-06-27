import { Event, EventGroup, EventSummary, MajorEvent } from '@cacic-fct/event-manager-admin-contracts';

export type FreezeDates = {
  createdAt?: string | Date | null;
  endDate?: string | Date | null;
};

export function getFrozenCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 2);
  return cutoff;
}

export function isFrozenFromDates(dates: Array<string | Date | null | undefined>, now = new Date()): boolean {
  const latestTimestamp = dates
    .map((date) => toTimestamp(date))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .reduce<number | null>((latest, timestamp) => (latest === null ? timestamp : Math.max(latest, timestamp)), null);

  return latestTimestamp !== null && latestTimestamp < getFrozenCutoffDate(now).getTime();
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

function toTimestamp(date: string | Date | null | undefined): number | null {
  if (date instanceof Date) {
    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof date !== 'string') {
    return null;
  }

  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
