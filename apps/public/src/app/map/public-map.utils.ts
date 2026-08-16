import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { endOfDay, startOfDay } from 'date-fns';
import { PublicMapFilters } from './public-map.models';

export const PUBLIC_MAP_EVENT_QUERY_PARAM = 'evento';

export function publicMapEventDeepLink(eventId: string): string {
  const parameters = new URLSearchParams({ [PUBLIC_MAP_EVENT_QUERY_PARAM]: eventId });
  return `/map?${parameters.toString()}`;
}

export function filterPublicMapEvents(
  events: readonly PublicMapEvent[],
  filters: PublicMapFilters,
  currentUserEventIds: ReadonlySet<string>,
  now = new Date(),
): PublicMapEvent[] {
  const todayStart = startOfDay(now).getTime();
  const todayEnd = endOfDay(now).getTime();

  return events.filter((event) => {
    if (filters.audience === 'MINE' && !currentUserEventIds.has(event.id)) {
      return false;
    }
    if (filters.date === 'TODAY') {
      return new Date(event.startDate).getTime() <= todayEnd && new Date(event.endDate).getTime() >= todayStart;
    }
    return true;
  });
}

export function averageCoordinates(events: readonly PublicMapEvent[]): [number, number] | null {
  const coordinates = events.flatMap((event) =>
    event.longitude == null || event.latitude == null ? [] : [[event.longitude, event.latitude] as const],
  );
  if (coordinates.length === 0) {
    return null;
  }

  const totals = coordinates.reduce(
    (sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]] as [number, number],
    [0, 0],
  );
  return [totals[0] / coordinates.length, totals[1] / coordinates.length];
}
