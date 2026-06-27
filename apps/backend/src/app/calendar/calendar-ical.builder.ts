import ical, { ICalCalendarMethod, ICalEventClass, ICalEventStatus } from 'ical-generator';
import type { ICalLocation } from 'ical-generator';
import { PUBLIC_EVENT_GROUP_RANGE_EVENT_TAKE } from './calendar-feed.constants';
import {
  AdminEventGroupRecord,
  AdminMajorEventRecord,
  CalendarEntry,
  CalendarEventRecord,
  PublicEventCalendarRecord,
} from './calendar-records';

export function buildCalendar(input: {
  name: string;
  description: string | null;
  entries: CalendarEntry[];
  eventClass: ICalEventClass;
  ttlSeconds: number;
}): string {
  const calendar = ical({
    name: input.name,
    description: input.description,
    method: ICalCalendarMethod.PUBLISH,
    prodId: {
      company: 'CACiC FCT',
      product: 'CACiC Eventos',
      language: 'PT-BR',
    },
    ttl: input.ttlSeconds,
  });

  for (const entry of input.entries) {
    calendar.createEvent({
      id: entry.id,
      summary: entry.summary,
      start: entry.start,
      end: entry.end,
      description: entry.description,
      location: entry.location,
      created: entry.created,
      lastModified: entry.lastModified,
      status: ICalEventStatus.CONFIRMED,
      class: input.eventClass,
      url: entry.url ?? undefined,
    });
  }

  return calendar.toString();
}

export function mapEventToCalendarEntry(event: CalendarEventRecord, url: string): CalendarEntry {
  return {
    id: `event-${event.id}@eventos.cacic.dev.br`,
    summary: event.name,
    start: event.startDate,
    end: event.endDate,
    description: buildEventDescription(event),
    location: buildEventLocation(event),
    created: event.createdAt,
    lastModified: event.updatedAt,
    url,
  };
}

export function mapPublicEventGroupToCalendarEntry(
  eventGroup: NonNullable<PublicEventCalendarRecord['eventGroup']>,
  url: string,
): CalendarEntry | null {
  const events = eventGroup.events.slice(0, PUBLIC_EVENT_GROUP_RANGE_EVENT_TAKE);
  if (events.length === 0) {
    return null;
  }

  const isTruncated = eventGroup.events.length > PUBLIC_EVENT_GROUP_RANGE_EVENT_TAKE;
  const start = events[0].startDate;
  const end = events.reduce((latest, event) => (event.endDate > latest ? event.endDate : latest), events[0].endDate);

  return {
    id: `event-group-${eventGroup.id}@eventos.cacic.dev.br`,
    summary: eventGroup.name,
    start,
    end,
    description: `Grupo de eventos com ${events.length}${isTruncated ? '+' : ''} evento(s).`,
    location: null,
    created: eventGroup.createdAt,
    lastModified: eventGroup.updatedAt,
    url,
  };
}

export function mapEventGroupToCalendarEntry(
  eventGroup: AdminEventGroupRecord,
  publicAppOrigin: string,
): CalendarEntry | null {
  const events = eventGroup.events;
  if (events.length === 0) {
    return null;
  }

  const start = events[0].startDate;
  const end = events.reduce((latest, event) => (event.endDate > latest ? event.endDate : latest), events[0].endDate);

  return {
    id: `event-group-${eventGroup.id}@eventos.cacic.dev.br`,
    summary: eventGroup.name,
    start,
    end,
    description: `Grupo de eventos com ${events.length} evento(s).`,
    location: null,
    created: eventGroup.createdAt,
    lastModified: eventGroup.updatedAt,
    url: buildAdminEventGroupUrl(publicAppOrigin, eventGroup.id),
  };
}

export function mapMajorEventToCalendarEntry(
  majorEvent: AdminMajorEventRecord,
  publicAppOrigin: string,
): CalendarEntry {
  return {
    id: `major-event-${majorEvent.id}@eventos.cacic.dev.br`,
    summary: majorEvent.name,
    start: majorEvent.startDate,
    end: majorEvent.endDate,
    description: majorEvent.description?.trim() || 'Grande evento.',
    location: null,
    created: majorEvent.createdAt,
    lastModified: majorEvent.updatedAt,
    url: buildAdminMajorEventUrl(publicAppOrigin, majorEvent.id),
  };
}

export function buildEventDescription(event: CalendarEventRecord): string | null {
  const parts = [
    event.description?.trim() || event.shortDescription?.trim() || null,
    event.majorEvent?.name ? `Grande evento: ${event.majorEvent.name}` : null,
    event.eventGroup?.name ? `Grupo de eventos: ${event.eventGroup.name}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join('\n\n') : null;
}

export function buildEventLocation(event: CalendarEventRecord): ICalLocation | string | null {
  const title = event.locationDescription?.trim();
  const latitude = event.latitude;
  const longitude = event.longitude;
  const hasCoordinates = latitude != null && longitude != null;

  if (title && hasCoordinates) {
    return {
      title,
      geo: {
        lat: latitude,
        lon: longitude,
      },
    };
  }

  if (title) {
    return title;
  }

  if (hasCoordinates) {
    return {
      geo: {
        lat: latitude,
        lon: longitude,
      },
    };
  }

  return null;
}

export function buildPublicEventUrl(publicAppOrigin: string, eventId: string): string {
  return new URL(`/app/event/${encodeURIComponent(eventId)}`, publicAppOrigin).toString();
}

export function buildAdminEventUrl(publicAppOrigin: string, eventId: string): string {
  return new URL(`/admin/events/${encodeURIComponent(eventId)}`, publicAppOrigin).toString();
}

export function buildAdminEventGroupUrl(publicAppOrigin: string, eventGroupId: string): string {
  return new URL(`/admin/groups/${encodeURIComponent(eventGroupId)}`, publicAppOrigin).toString();
}

export function buildAdminMajorEventUrl(publicAppOrigin: string, majorEventId: string): string {
  return new URL(`/admin/major-events/${encodeURIComponent(majorEventId)}`, publicAppOrigin).toString();
}

export function slugifyFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}
