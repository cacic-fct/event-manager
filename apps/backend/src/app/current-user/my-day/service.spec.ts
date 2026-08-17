import type { EventRecord } from '../selects';
import { buildConflictAlerts, dayBounds, formatSaoPauloDate, resolveMyDayTimeline } from './service';

describe('CurrentUserMyDayService helpers', () => {
  it('uses stable São Paulo calendar-day bounds', () => {
    const bounds = dayBounds('2026-08-16');

    expect(bounds.start.toISOString()).toBe('2026-08-16T03:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-17T02:59:59.999Z');
    expect(formatSaoPauloDate(bounds.start)).toBe('2026-08-16');
  });

  it('reports each overlapping pair once and ignores adjacent events', () => {
    const events = [
      event('a', 'A', '2026-08-16T12:00:00.000Z', '2026-08-16T14:00:00.000Z'),
      event('b', 'B', '2026-08-16T13:00:00.000Z', '2026-08-16T15:00:00.000Z'),
      event('c', 'C', '2026-08-16T15:00:00.000Z', '2026-08-16T16:00:00.000Z'),
    ];

    expect(buildConflictAlerts(events)).toEqual([
      expect.objectContaining({
        id: 'conflict:a:b',
        title: 'Conflito de horário',
        route: '/event/b',
      }),
    ]);
  });

  it('keeps the first event on a selected non-current day even when it starts at midnight', () => {
    const events = [
      event('midnight', 'Midnight', '2026-08-17T03:00:00.000Z', '2026-08-17T04:00:00.000Z'),
      event('later', 'Later', '2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z'),
    ];

    expect(resolveMyDayTimeline(events, false, new Date('2026-08-16T15:00:00.000Z'))).toEqual({
      currentIndex: -1,
      nextIndex: 0,
      laterIndexes: [1],
    });
  });

  it('does not return already-finished events as later events for today', () => {
    const events = [
      event('past-a', 'Past A', '2026-08-16T10:00:00.000Z', '2026-08-16T11:00:00.000Z'),
      event('past-b', 'Past B', '2026-08-16T12:00:00.000Z', '2026-08-16T13:00:00.000Z'),
    ];

    expect(resolveMyDayTimeline(events, true, new Date('2026-08-16T15:00:00.000Z'))).toEqual({
      currentIndex: -1,
      nextIndex: -1,
      laterIndexes: [],
    });
  });

  it('partitions the current, next, and later events without retaining earlier events', () => {
    const events = [
      event('past', 'Past', '2026-08-16T10:00:00.000Z', '2026-08-16T11:00:00.000Z'),
      event('current', 'Current', '2026-08-16T14:00:00.000Z', '2026-08-16T16:00:00.000Z'),
      event('next', 'Next', '2026-08-16T17:00:00.000Z', '2026-08-16T18:00:00.000Z'),
      event('later', 'Later', '2026-08-16T19:00:00.000Z', '2026-08-16T20:00:00.000Z'),
    ];

    expect(resolveMyDayTimeline(events, true, new Date('2026-08-16T15:00:00.000Z'))).toEqual({
      currentIndex: 1,
      nextIndex: 2,
      laterIndexes: [3],
    });
  });
});

function event(id: string, name: string, startDate: string, endDate: string): EventRecord {
  return { id, name, startDate: new Date(startDate), endDate: new Date(endDate) } as EventRecord;
}
