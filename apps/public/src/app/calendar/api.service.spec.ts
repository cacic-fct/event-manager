import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CalendarApiService } from './api.service';

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
        currentUserSubscribedItems: [
          { event: { id: 'standalone-event' } },
          { events: [{ id: 'group-event' }] },
        ],
        currentUserMajorEventSubscriptions: [{ selectedEvents: [{ id: 'major-event' }] }],
      },
    });

    await expect(responsePromise).resolves.toEqual(new Set(['standalone-event', 'group-event', 'major-event']));
  });
});
