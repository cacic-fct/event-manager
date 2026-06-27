import { ICalEventClass } from 'ical-generator';
import {
  buildCalendar,
  buildPublicEventUrl,
  mapEventToCalendarEntry,
  mapPublicEventGroupToCalendarEntry,
  slugifyFileName,
} from './calendar-ical.builder';

describe('calendar iCal builder', () => {
  const event = {
    id: 'event 1',
    name: 'Oficina de TypeScript',
    startDate: new Date('2026-07-01T13:00:00.000Z'),
    endDate: new Date('2026-07-01T15:00:00.000Z'),
    description: 'Descrição completa.',
    shortDescription: 'Resumo.',
    latitude: -22.121,
    longitude: -51.409,
    locationDescription: 'FCT Unesp',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
    majorEvent: {
      name: 'Congresso CACiC',
    },
    eventGroup: {
      name: 'Trilha Web',
    },
  };

  it('maps event metadata into a calendar entry with URL-safe public links', () => {
    const entry = mapEventToCalendarEntry(event, buildPublicEventUrl('https://eventos.cacic.dev.br', event.id));

    expect(entry).toEqual(
      expect.objectContaining({
        id: 'event-event 1@eventos.cacic.dev.br',
        summary: 'Oficina de TypeScript',
        description: 'Descrição completa.\n\nGrande evento: Congresso CACiC\n\nGrupo de eventos: Trilha Web',
        url: 'https://eventos.cacic.dev.br/app/event/event%201',
      }),
    );
    expect(entry.location).toEqual({
      title: 'FCT Unesp',
      geo: {
        lat: -22.121,
        lon: -51.409,
      },
    });
  });

  it('summarizes bounded public event groups as a single calendar entry', () => {
    const group = {
      id: 'group-1',
      name: 'Trilha de oficinas',
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-20T10:00:00.000Z'),
      events: [
        {
          startDate: new Date('2026-07-01T13:00:00.000Z'),
          endDate: new Date('2026-07-01T15:00:00.000Z'),
        },
        {
          startDate: new Date('2026-07-02T13:00:00.000Z'),
          endDate: new Date('2026-07-02T16:00:00.000Z'),
        },
      ],
    };

    expect(mapPublicEventGroupToCalendarEntry(group, 'https://eventos.cacic.dev.br/app/event/event-1')).toEqual(
      expect.objectContaining({
        id: 'event-group-group-1@eventos.cacic.dev.br',
        summary: 'Trilha de oficinas',
        start: new Date('2026-07-01T13:00:00.000Z'),
        end: new Date('2026-07-02T16:00:00.000Z'),
        description: 'Grupo de eventos com 2 evento(s).',
      }),
    );
  });

  it('renders calendar content and slugifies download names', () => {
    const content = buildCalendar({
      name: 'Calendário CACiC',
      description: 'Eventos públicos.',
      entries: [mapEventToCalendarEntry(event, 'https://eventos.cacic.dev.br/app/event/event-1')],
      eventClass: ICalEventClass.PUBLIC,
      ttlSeconds: 3600,
    });

    expect(content).toContain('X-WR-CALNAME:Calendário CACiC');
    expect(content).toContain('SUMMARY:Oficina de TypeScript');
    expect(content).toContain('CLASS:PUBLIC');
    expect(slugifyFileName('Calendário CACiC: Oficina nº 1')).toBe('calendario-cacic-oficina-n-1');
  });
});
