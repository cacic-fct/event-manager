import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { PUBLIC_TIME_ZONE, publicLocalDateKey } from './public-local-date';

const labelFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PUBLIC_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: PUBLIC_TIME_ZONE, weekday: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PUBLIC_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});

export interface EventProgramDay {
  id: string;
  label: string;
  weekday: string;
  shortDate: string;
  events: PublicEvent[];
}

export function eventProgramDays(events: readonly PublicEvent[]): EventProgramDay[] {
  const days = new Map<string, EventProgramDay>();
  const ordered = [...events].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
  for (const event of ordered) {
    const start = new Date(event.startDate);
    const id = publicLocalDateKey(start);
    let day = days.get(id);
    if (!day) {
      day = {
        id,
        label: labelFormatter.format(start),
        weekday: weekdayFormatter.format(start).replace('.', ''),
        shortDate: shortDateFormatter.format(start),
        events: [],
      };
      days.set(id, day);
    }
    day.events.push(event);
  }
  return [...days.values()];
}
