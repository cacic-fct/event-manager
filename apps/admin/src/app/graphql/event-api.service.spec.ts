import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { EventApiService } from './event-api.service';

describe('EventApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: EventApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListEventsSummary')) {
          return of({ events: [eventFixture({ id: 'summary-event' })] });
        }
        if (query.includes('ListEvents(')) {
          return of({ events: [eventFixture()] });
        }
        if (query.includes('GetEvent')) {
          return of({ event: eventFixture({ id: 'event-detail' }) });
        }
        if (query.includes('CreateEvent(')) {
          return of({ createEvent: { id: 'created-event' } });
        }
        if (query.includes('UpdateEvent(')) {
          return of({ updateEvent: { id: 'updated-event' } });
        }
        if (query.includes('ListEventDrafts')) {
          return of({ eventDrafts: [eventDraftFixture()] });
        }
        if (query.includes('SaveEventDraft')) {
          return of({ saveEventDraft: eventDraftFixture({ id: 'saved-draft' }) });
        }
        if (query.includes('ApplyEventDraft')) {
          return of({ applyEventDraft: { id: 'applied-event' } });
        }
        if (query.includes('DeleteEventDraftsForEvent')) {
          return of({ deleteEventDraftsForEvent: { deleted: true, id: null, eventId: 'event-1' } });
        }
        if (query.includes('DeleteEventDraft')) {
          return of({ deleteEventDraft: { deleted: true, id: 'draft-1', eventId: 'event-1' } });
        }
        if (query.includes('CloneEvent')) {
          return of({ cloneEvent: { id: 'cloned-event' } });
        }
        if (query.includes('DeleteEvent(')) {
          return of({ deleteEvent: { deleted: true, id: 'event-1' } });
        }
        if (query.includes('ListEventLecturers')) {
          return of({ eventLecturers: [personLinkFixture()] });
        }
        if (query.includes('CreateEventLecturer')) {
          return of({ createEventLecturer: personLinkFixture({ personId: 'lecturer-2' }) });
        }
        if (query.includes('DeleteEventLecturer')) {
          return of({ deleteEventLecturer: { deleted: true, eventId: 'event-1', personId: 'lecturer-1' } });
        }
        if (query.includes('ListEventAttendanceCollectors')) {
          return of({ eventAttendanceCollectors: [personLinkFixture({ personId: 'collector-1' })] });
        }
        if (query.includes('CreateEventAttendanceCollector')) {
          return of({ createEventAttendanceCollector: personLinkFixture({ personId: 'collector-2' }) });
        }
        return of({
          deleteEventAttendanceCollector: { deleted: true, eventId: 'event-1', personId: 'collector-1' },
        });
      }),
    };

    TestBed.configureTestingModule({
      providers: [EventApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(EventApiService);
  });

  it('maps event list, summary, detail, and write operations', async () => {
    await expect(firstValueFrom(service.listEvents({ query: 'Angular', take: 20 }))).resolves.toEqual([eventFixture()]);
    await expect(firstValueFrom(service.listEventsSummary({ isInGroup: false }))).resolves.toEqual([
      eventFixture({ id: 'summary-event' }),
    ]);
    await expect(firstValueFrom(service.getEvent('event-detail'))).resolves.toEqual(
      eventFixture({ id: 'event-detail' }),
    );
    await expect(firstValueFrom(service.createEvent({ name: 'Novo evento' } as never))).resolves.toEqual({
      id: 'created-event',
    });
    await expect(firstValueFrom(service.updateEvent('event-1', { name: 'Evento editado' } as never))).resolves.toEqual({
      id: 'updated-event',
    });
    await expect(firstValueFrom(service.cloneEvent('event-1', { name: 'Clone' } as never))).resolves.toEqual({
      id: 'cloned-event',
    });
    await expect(firstValueFrom(service.deleteEvent('event-1'))).resolves.toEqual({ deleted: true, id: 'event-1' });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('ListEvents'), {
      query: 'Angular',
      take: 20,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('CreateEvent'), {
      input: { name: 'Novo evento' },
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('UpdateEvent'), {
      id: 'event-1',
      input: { name: 'Evento editado' },
    });
  });

  it('maps event draft operations', async () => {
    await expect(firstValueFrom(service.listEventDrafts({ sourceEventId: 'event-1' }))).resolves.toEqual([
      eventDraftFixture(),
    ]);
    await expect(
      firstValueFrom(service.saveEventDraft({ sourceEventId: 'event-1', input: { name: 'Rascunho' } as never })),
    ).resolves.toEqual(eventDraftFixture({ id: 'saved-draft' }));
    await expect(firstValueFrom(service.applyEventDraft('draft-1'))).resolves.toEqual({ id: 'applied-event' });
    await expect(firstValueFrom(service.deleteEventDraft('draft-1'))).resolves.toEqual({
      deleted: true,
      id: 'draft-1',
      eventId: 'event-1',
    });
    await expect(firstValueFrom(service.deleteEventDraftsForEvent('event-1'))).resolves.toEqual({
      deleted: true,
      id: null,
      eventId: 'event-1',
    });
  });

  it('maps lecturer and attendance collector operations', async () => {
    await expect(firstValueFrom(service.listEventLecturers('event-1'))).resolves.toEqual([personLinkFixture()]);
    await expect(
      firstValueFrom(service.createEventLecturer({ eventId: 'event-1', personId: 'lecturer-2' })),
    ).resolves.toEqual(personLinkFixture({ personId: 'lecturer-2' }));
    await expect(firstValueFrom(service.deleteEventLecturer('event-1', 'lecturer-1'))).resolves.toEqual({
      deleted: true,
      eventId: 'event-1',
      personId: 'lecturer-1',
    });
    await expect(firstValueFrom(service.listEventAttendanceCollectors('event-1'))).resolves.toEqual([
      personLinkFixture({ personId: 'collector-1' }),
    ]);
    await expect(
      firstValueFrom(service.createEventAttendanceCollector({ eventId: 'event-1', personId: 'collector-2' })),
    ).resolves.toEqual(personLinkFixture({ personId: 'collector-2' }));
    await expect(firstValueFrom(service.deleteEventAttendanceCollector('event-1', 'collector-1'))).resolves.toEqual({
      deleted: true,
      eventId: 'event-1',
      personId: 'collector-1',
    });
  });
});

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'Oficina de Angular',
    startDate: '2026-07-01T09:00:00.000Z',
    endDate: '2026-07-01T11:00:00.000Z',
    createdAt: '2026-06-01T12:00:00.000Z',
    eventGroupId: null,
    majorEventId: null,
    majorEvent: null,
    ...overrides,
  };
}

function eventDraftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    sourceEventId: 'event-1',
    name: 'Rascunho',
    payloadJson: '{}',
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

function personLinkFixture(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    personId: 'lecturer-1',
    createdAt: '2026-06-01T12:00:00.000Z',
    person: {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: 'ada@example.edu',
    },
    ...overrides,
  };
}
