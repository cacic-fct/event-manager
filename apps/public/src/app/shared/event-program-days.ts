import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

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
    const start = parseISO(event.startDate);
    const id = format(start, 'yyyy-MM-dd');
    let day = days.get(id);
    if (!day) {
      day = {
        id,
        label: format(start, "EEEE, d 'de' MMMM", { locale: ptBR }),
        weekday: format(start, 'EEE', { locale: ptBR }).replace('.', ''),
        shortDate: format(start, 'dd/MM'),
        events: [],
      };
      days.set(id, day);
    }
    day.events.push(event);
  }
  return [...days.values()];
}
