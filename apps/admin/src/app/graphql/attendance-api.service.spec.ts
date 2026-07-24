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
    source.emitMessage({ type: 'event-attendance-scanner-feed', attendances: [{ eventId: 'event-1', personId: 'person-1' }] });

    await expect(feed).resolves.toEqual([{ eventId: 'event-1', personId: 'person-1' }]);
    expect(source.close).toHaveBeenCalledOnce();
  });
});
