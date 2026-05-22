import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AttendanceCollectionAccessService } from './attendance-collection-access.service';

describe('AttendanceCollectionAccessService', () => {
  const now = new Date('2026-05-21T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('opens collection from three hours before start until six hours after end', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    const service = TestBed.inject(AttendanceCollectionAccessService);

    expect(service.isCollectionOpen(collectionEvent('2026-05-21T15:00:00.000Z', '2026-05-21T16:00:00.000Z'))).toBe(
      true,
    );
    expect(service.isCollectionOpen(collectionEvent('2026-05-21T16:00:01.000Z', '2026-05-21T17:00:00.000Z'))).toBe(
      false,
    );
    expect(service.isCollectionOpen(collectionEvent('2026-05-21T01:00:00.000Z', '2026-05-21T06:00:00.000Z'))).toBe(
      true,
    );
  });

  it('resolves precise browser locations', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: {
              latitude: -22.12,
              longitude: -51.4,
              accuracy: 25,
            },
          } as GeolocationPosition),
        ),
      },
    });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    await expect(TestBed.inject(AttendanceCollectionAccessService).getPreciseLocation()).resolves.toEqual({
      latitude: -22.12,
      longitude: -51.4,
      accuracyMeters: 25,
    });
  });

  it('rejects missing, imprecise, and denied browser locations', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    await expect(TestBed.inject(AttendanceCollectionAccessService).getPreciseLocation()).rejects.toThrow(
      "Browser didn't provide location.",
    );

    TestBed.resetTestingModule();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: {
              latitude: -22.12,
              longitude: -51.4,
              accuracy: 150,
            },
          } as GeolocationPosition),
        ),
      },
    });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    await expect(TestBed.inject(AttendanceCollectionAccessService).getPreciseLocation()).rejects.toThrow(
      'Ative a localização precisa.',
    );
  });
});

function collectionEvent(startDate: string, endDate: string) {
  return {
    eventId: 'event-1',
    event: {
      id: 'event-1',
      name: 'Evento',
      startDate,
      endDate,
      emoji: '🎓',
      type: 'OTHER' as const,
      queueCount: 0,
    },
  };
}
