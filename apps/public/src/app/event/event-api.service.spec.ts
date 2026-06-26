import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from './event-api.service';

describe('EventApiService', () => {
  let httpTesting: HttpTestingController;
  let service: EventApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EventApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads event page data without querying optional slot counters from PublicEvent', async () => {
    const responsePromise = firstValueFrom(service.getEventPageData('event-1', true));
    const request = httpTesting.expectOne('/api/graphql');
    const query = String(request.request.body.query);

    expect(query).toContain('query PublicEventPage');
    expect(query).toContain('publicEventSubscriptionSummary');
    expect(query).toContain('hasAvailableSlots');
    expect(query).toContain('currentUserEventSubscription');
    expect(query).not.toContain('slotsAvailable');
    expect(request.request.body.variables).toEqual({ eventId: 'event-1' });

    request.flush({
      data: {
        publicEvent: eventFixture(),
        publicEventSubscriptionSummary: {
          eventId: 'event-1',
          hasAvailableSlots: true,
        },
        publicEventWeather: null,
        currentUserEventSubscription: null,
        currentUserEventAttendance: null,
      },
    });

    await expect(responsePromise).resolves.toEqual({
      event: eventFixture(),
      subscriptionSummary: {
        eventId: 'event-1',
        hasAvailableSlots: true,
      },
      weather: null,
      currentUserSubscription: null,
      currentUserAttendance: null,
    });
  });

  it('loads preview event page data without querying optional slot counters from PublicEvent', async () => {
    const responsePromise = firstValueFrom(service.getPreviewEventPageData('preview-token'));
    const request = httpTesting.expectOne('/api/graphql');
    const query = String(request.request.body.query);

    expect(query).toContain('query PublicContentPreviewEvent');
    expect(query).not.toContain('slotsAvailable');
    expect(request.request.body.variables).toEqual({ previewToken: 'preview-token' });

    request.flush({
      data: {
        publicContentPreview: {
          previewAt: '2026-06-26T12:00:00.000Z',
          expiresAt: '2026-06-26T13:00:00.000Z',
          event: eventFixture(),
        },
      },
    });

    await expect(responsePromise).resolves.toEqual({
      event: eventFixture(),
      subscriptionSummary: {
        eventId: 'event-1',
        hasAvailableSlots: true,
      },
      weather: null,
      currentUserSubscription: null,
      currentUserAttendance: null,
      preview: {
        previewAt: '2026-06-26T12:00:00.000Z',
        expiresAt: '2026-06-26T13:00:00.000Z',
      },
    });
  });

  it('throws GraphQL errors from event page queries', async () => {
    const responsePromise = firstValueFrom(service.getEventPageData('event-1', false));

    httpTesting.expectOne('/api/graphql').flush({
      errors: [{ message: 'Cannot query field "slotsAvailable" on type "PublicEvent".' }],
    });

    await expect(responsePromise).rejects.toThrow('Cannot query field "slotsAvailable" on type "PublicEvent".');
  });
});

function eventFixture(): PublicEvent {
  return {
    id: 'event-1',
    name: 'Evento teste',
    creditMinutes: 60,
    startDate: '2026-06-26T14:00:00.000Z',
    endDate: '2026-06-26T15:00:00.000Z',
    emoji: 'E',
    type: 'OTHER',
    description: 'Descricao do evento.',
    shortDescription: 'Resumo do evento.',
    latitude: null,
    longitude: null,
    locationDescription: 'Auditorio',
    majorEventId: null,
    eventGroupId: null,
    allowSubscription: true,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: 40,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    majorEvent: null,
    eventGroup: null,
    lecturers: [],
  };
}
