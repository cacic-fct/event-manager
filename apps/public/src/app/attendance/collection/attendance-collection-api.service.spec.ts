import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';

describe('AttendanceCollectionApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches the encoded collection feed through the replayable EventSource helper', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(AttendanceCollectionApiService);
    const feed = firstValueFrom(service.watchFeed('event / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/attendance-collection/events/event%20%2F%201/feed/events');
    source.emitMessage({ type: 'event-attendance-scanner-feed', attendances: [] });

    await expect(feed).resolves.toEqual([]);
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('sends an oral-call decision batch with original collection times and locations', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(AttendanceCollectionApiService);
    const http = TestBed.inject(HttpTestingController);
    const inputs = [
      {
        eventId: 'event-1',
        personId: 'person-1',
        status: 'ABSENT' as const,
        collectedAt: '2026-07-29T12:00:00.000Z',
        collectedByUserId: 'collector-1',
        location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
      },
    ];

    const result = firstValueFrom(service.registerOralBatch(inputs));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ inputs });
    expect(request.request.body.query).toContain('collectCurrentUserOralAttendances');
    request.flush({
      data: {
        collectCurrentUserOralAttendances: [
          {
            eventId: 'event-1',
            personId: 'person-1',
            attendedAt: inputs[0].collectedAt,
            category: 'REGULAR',
          },
        ],
      },
    });

    await expect(result).resolves.toEqual([
      expect.objectContaining({ eventId: 'event-1', personId: 'person-1' }),
    ]);
    http.verify();
  });
});
