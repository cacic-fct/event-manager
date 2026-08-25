import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { AttendanceApiService } from './attendance-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('AttendanceApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches the encoded scanner feed through the replayable EventSource helper', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: GraphqlHttpService, useValue: {} }],
    });
    const service = TestBed.inject(AttendanceApiService);
    const feed = firstValueFrom(service.watchEventAttendanceScannerFeed('event / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/event-attendances/events/event%20%2F%201/scanner-feed/events');
    expect(source.init).toEqual({ withCredentials: true });
    source.emitMessage({
      type: 'event-attendance-scanner-feed',
      attendances: [{ eventId: 'event-1', personId: 'person-1' }],
    });

    await expect(feed).resolves.toEqual([{ eventId: 'event-1', personId: 'person-1' }]);
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('watches replayable analytics for a selected fixed interval', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: GraphqlHttpService, useValue: {} }],
    });
    const service = TestBed.inject(AttendanceApiService);
    const window = {
      start: '2026-08-16T12:00:00.000Z',
      end: '2026-08-16T13:00:00.000Z',
    };
    const analytics = firstValueFrom(service.watchEventAttendanceAnalytics('event / 1', window));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe(
      '/api/event-attendances/events/event%20%2F%201/analytics/events' +
        '?windowStart=2026-08-16T12%3A00%3A00.000Z&windowEnd=2026-08-16T13%3A00%3A00.000Z',
    );
    expect(source.init).toEqual({ withCredentials: true });
    source.emitMessage({
      type: 'event-attendance-analytics',
      snapshot: { eventId: 'event-1', eventName: 'Evento', windowStart: window.start, windowEnd: window.end },
    });

    await expect(analytics).resolves.toMatchObject({
      eventId: 'event-1',
      windowStart: window.start,
      windowEnd: window.end,
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('watches all attendance analytics without a time query by default', () => {
    installFakeEventSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: GraphqlHttpService, useValue: {} }],
    });

    const subscription = TestBed.inject(AttendanceApiService).watchEventAttendanceAnalytics('event / 1').subscribe();

    expect(FakeEventSource.instances[0]?.url).toBe('/api/event-attendances/events/event%20%2F%201/analytics/events');
    subscription.unsubscribe();
  });
});
