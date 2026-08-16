import type { EventRecord } from '../selects';
import { buildConflictAlerts, dayBounds, formatSaoPauloDate } from './service';

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
});

function event(id: string, name: string, startDate: string, endDate: string): EventRecord {
  return { id, name, startDate: new Date(startDate), endDate: new Date(endDate) } as EventRecord;
}
