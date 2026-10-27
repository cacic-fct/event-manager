import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { MajorEventInfoApiService } from './major-event-info-api.service';

describe('MajorEventInfoApiService', () => {
  let service: MajorEventInfoApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MajorEventInfoApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reuses publicMajorEvent for the overview without requesting payment account details', async () => {
    const event = createPublicMajorEvent();
    const result = firstValueFrom(service.getMajorEvent(event.id));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('publicMajorEvent(id: $majorEventId)');
    expect(request.request.body.query).not.toContain('paymentInfo {');
    expect(request.request.body.variables).toEqual({ majorEventId: event.id });
    request.flush({ data: { publicMajorEvent: event } });
    await expect(result).resolves.toEqual(event);
  });

  it('reuses the public catalog with chronological pagination rather than registration eligibility', async () => {
    const events = [createPublicEvent({ allowSubscription: false })];
    const result = firstValueFrom(service.getProgram('major-1', 100));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('publicEvents(majorEventId: $majorEventId');
    expect(request.request.body.query).toContain('oldestFirst: true');
    expect(request.request.body.variables).toEqual({ majorEventId: 'major-1', skip: 100, take: 100 });
    request.flush({ data: { publicEvents: events } });
    await expect(result).resolves.toEqual(events);
  });

  it('propagates GraphQL failures instead of rendering a successful empty program', async () => {
    const result = firstValueFrom(service.getProgram('major-1'));
    http
      .expectOne('/api/graphql')
      .flush({ errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    await expect(result).rejects.toThrow();
  });
});
