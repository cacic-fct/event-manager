import type { EventRecord } from '../selects';
import { currentUserAssociatedEventWhere } from '../events/map-event-ids';
import {
  CurrentUserMyDayService,
  buildConflictAlerts,
  dayBounds,
  formatSaoPauloDate,
  resolveMyDayTimeline,
} from './service';

describe('CurrentUserMyDayService helpers', () => {
  it('includes an interested-only event in My Day without requiring a subscription', () => {
    const association = currentUserAssociatedEventWhere('person-1', 'user-1', new Date('2026-08-16T15:00:00.000Z'));

    expect(association).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([{ interests: { some: { personId: 'person-1', deletedAt: null } } }]),
      }),
    );
  });

  it('does not expand a major-event interest into every child activity', () => {
    const association = currentUserAssociatedEventWhere('person-1', undefined, new Date());
    expect(association.OR).not.toContainEqual({
      majorEvent: { interests: { some: { personId: 'person-1', deletedAt: null } } },
    });
    expect(association.OR).toContainEqual({
      eventGroup: { interests: { some: { personId: 'person-1', deletedAt: null } } },
    });
  });

  it('opens existing lecturer preparation for lectures and retains ordinary event information for other roles', () => {
    const service = Object.create(CurrentUserMyDayService.prototype) as CurrentUserMyDayService;
    const mapEvent = Reflect.get(service, 'mapEvent').bind(service);
    const record = {
      ...event('lecture', 'Minha palestra', new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()),
      majorEventId: 'major',
    };
    const roles = {
      lecturerEventIds: new Set(['lecture']),
      collectorEventIds: new Set(),
      managerGrants: [],
      sportsMatches: [],
    };
    const lecture = mapEvent(record, roles, new Set(), new Set(), null);
    expect(lecture.infoAction).toMatchObject({
      label: 'Preparar minha participação',
      route: '/profile/attendances/major-event/major/organizer',
      offlineCapable: false,
    });
    const participant = mapEvent(record, { ...roles, lecturerEventIds: new Set() }, new Set(), new Set(), null);
    expect(participant.infoAction).toMatchObject({ label: 'Informações', route: '/event/lecture' });
  });

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
