import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CalendarApiService } from './calendar-api.service';

describe('CalendarApiService', () => {
  let httpTesting: HttpTestingController;
  let service: CalendarApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CalendarApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('collects event ids from standalone, group, and major-event subscriptions', async () => {
    const responsePromise = firstValueFrom(service.getCurrentUserSubscribedEventIds());
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('currentUserSubscribedItems');
    expect(request.request.body.query).toContain('currentUserMajorEventSubscriptions');

    request.flush({
      data: {
        currentUserSubscribedItems: [{ event: { id: 'standalone-event' } }, { events: [{ id: 'group-event' }] }],
        currentUserMajorEventSubscriptions: [{ selectedEvents: [{ id: 'major-event' }] }],
      },
    });

    await expect(responsePromise).resolves.toEqual(new Set(['standalone-event', 'group-event', 'major-event']));
  });

  it('marks anonymous calendar catalog requests explicitly', async () => {
    const responsePromise = firstValueFrom(
      service.getCalendarEvents({ query: '', eventType: 'ALL', startDateFrom: '2026-07-17T00:00:00.000Z' }, true),
    );
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.headers.get('X-Event-Audience')).toBe('public');
    request.flush({ data: { publicCalendarEvents: [] } });

    await expect(responsePromise).resolves.toEqual([]);
  });

  it('leaves audience context enabled for authenticated calendar catalog requests', async () => {
    const responsePromise = firstValueFrom(
      service.getCalendarEvents({ query: '', eventType: 'ALL', startDateFrom: '2026-07-17T00:00:00.000Z' }),
    );
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.headers.has('X-Event-Audience')).toBe(false);
    request.flush({ data: { publicCalendarEvents: [] } });

    await expect(responsePromise).resolves.toEqual([]);
  });
});
