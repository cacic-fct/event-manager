import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from './event-api.service';

describe('EventApiService uncovered operations', () => {
  let service: EventApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists public events within an event group using the expected scope variable', async () => {
    const result = firstValueFrom(service.listPublicEventGroupEvents('group / 1'));
    const request = http.expectOne('/api/graphql');
    const events = [createPublicEvent({ id: 'event-1', name: 'Atividade' })];

    expect(request.request.body.query).toContain('query PublicEventGroupEvents');
    expect(request.request.body.query).toContain('publicEvents(eventGroupId: $eventGroupId, take: 100)');
    expect(request.request.body.variables).toEqual({ eventGroupId: 'group / 1' });
    request.flush({ data: { publicEvents: events } });

    await expect(result).resolves.toEqual(events);
  });

  it('lists required image-license interruptions without variables', async () => {
    const result = firstValueFrom(service.listRequiredImageLicenseAgreementInterruptions());
    const request = http.expectOne('/api/graphql');
    const interruptions = [
      {
        targetType: 'EVENT',
        eventId: 'event-1',
        majorEventId: null,
        rankedSubscriptionEnabled: false,
        displayOrder: 1,
      },
    ];

    expect(request.request.body.query).toContain('query CurrentUserRequiredImageLicenseAgreementInterruptions');
    expect(request.request.body.variables).toBeUndefined();
    request.flush({ data: { currentUserRequiredImageLicenseAgreementInterruptions: interruptions } });

    await expect(result).resolves.toEqual(interruptions);
  });

  it('unsubscribes from a standalone event with the exact event variable', async () => {
    const result = firstValueFrom(service.unsubscribeFromEvent('event-1'));
    const request = http.expectOne('/api/graphql');
    const event = createPublicEvent({ id: 'event-1' });

    expect(request.request.body.query).toContain('mutation UnsubscribeCurrentUserStandaloneEvent');
    expect(request.request.body.variables).toEqual({ eventId: 'event-1' });
    request.flush({ data: { unsubscribeCurrentUserStandaloneEvent: event } });

    await expect(result).resolves.toEqual(event);
  });

  it('confirms online attendance with the event and code variables', async () => {
    const result = firstValueFrom(service.confirmAttendance('event-1', 'one-time-code'));
    const request = http.expectOne('/api/graphql');
    const attendance = { eventId: 'event-1', attendedAt: publicFixtureDateFromNow(0, 12) };

    expect(request.request.body.query).toContain('mutation ConfirmCurrentUserOnlineAttendance');
    expect(request.request.body.query).toContain(
      'confirmCurrentUserOnlineAttendance(input: { eventId: $eventId, code: $code })',
    );
    expect(request.request.body.variables).toEqual({ eventId: 'event-1', code: 'one-time-code' });
    request.flush({ data: { confirmCurrentUserOnlineAttendance: attendance } });

    await expect(result).resolves.toEqual(attendance);
  });

  it('rejects unsubscribe responses with no GraphQL data', async () => {
    const result = firstValueFrom(service.unsubscribeFromEvent('event-1'));
    http.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});
