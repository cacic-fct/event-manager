import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { averageCoordinates, filterPublicMapEvents, publicMapEventDeepLink } from './public-map.utils';

describe('public map utilities', () => {
  const now = new Date('2026-08-16T15:00:00-03:00');
  const events = [
    eventFixture('before', '2026-08-15T10:00:00-03:00', '2026-08-15T12:00:00-03:00', -51.4, -22.12),
    eventFixture('overlap-start', '2026-08-15T23:00:00-03:00', '2026-08-16T01:00:00-03:00', -51.2, -22.02),
    eventFixture('today', '2026-08-16T10:00:00-03:00', '2026-08-16T12:00:00-03:00', -51.6, -22.22),
    eventFixture('overlap-end', '2026-08-16T23:00:00-03:00', '2026-08-17T01:00:00-03:00', -51.8, -22.32),
    eventFixture('future', '2026-08-17T10:00:00-03:00', '2026-08-17T12:00:00-03:00', -52, -22.42),
  ];

  it('returns every event when both filters are disabled without mutating the input', () => {
    const result = filterPublicMapEvents(events, { audience: 'ALL', date: 'ALL' }, new Set(), now);

    expect(result).toEqual(events);
    expect(result).not.toBe(events);
  });

  it('keeps events that overlap any part of the current local day', () => {
    const result = filterPublicMapEvents(events, { audience: 'ALL', date: 'TODAY' }, new Set(), now);

    expect(result.map(({ id }) => id)).toEqual(['overlap-start', 'today', 'overlap-end']);
  });

  it('combines my-events and today filters', () => {
    const result = filterPublicMapEvents(
      events,
      { audience: 'MINE', date: 'TODAY' },
      new Set(['before', 'today', 'future']),
      now,
    );

    expect(result.map(({ id }) => id)).toEqual(['today']);
  });

  it('averages only complete coordinate pairs and returns null when none exist', () => {
    const incomplete = eventFixture('incomplete', now.toISOString(), now.toISOString(), null, -22) as PublicMapEvent;

    expect(averageCoordinates([events[0], events[2], incomplete])).toEqual([-51.5, -22.17]);
    expect(averageCoordinates([incomplete])).toBeNull();
    expect(averageCoordinates([])).toBeNull();
  });

  it('builds reusable event deep links without exposing coordinates', () => {
    expect(publicMapEventDeepLink('event/with spaces')).toBe('/map?evento=event%2Fwith+spaces');
  });
});

function eventFixture(
  id: string,
  startDate: string,
  endDate: string,
  longitude: number | null,
  latitude: number | null,
): PublicMapEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate,
    emoji: '📍',
    longitude,
    latitude,
  } as PublicMapEvent;
}
