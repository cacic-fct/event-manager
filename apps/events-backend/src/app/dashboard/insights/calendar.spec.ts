import { insightEvent } from './insights-service.fixtures';
import { mapCalendarEvent } from './calendar';

describe('mapCalendarEvent', () => {
  it('maps event details and enables attendance collection inside the two-hour window', () => {
    const result = mapCalendarEvent(
      insightEvent({
        id: 'event-1',
        name: 'Opening',
        emoji: '🎤',
        type: 'TALK',
        startDate: new Date('2026-05-21T13:00:00.000Z'),
        endDate: new Date('2026-05-21T15:00:00.000Z'),
        locationDescription: 'Main room',
        majorEvent: { id: 'major-1', name: 'Conference', certificateConfigs: [] },
        eventGroup: { id: 'group-1', name: 'Track A', shouldIssueCertificate: true, certificateConfigs: [] },
        _count: {
          attendances: 3,
          subscriptions: 8,
        },
      }) as never,
      new Date('2026-05-21T12:00:00.000Z'),
    );

    expect(result).toEqual({
      id: 'event-1',
      name: 'Opening',
      emoji: '🎤',
      type: 'TALK',
      startDate: new Date('2026-05-21T13:00:00.000Z'),
      endDate: new Date('2026-05-21T15:00:00.000Z'),
      locationDescription: 'Main room',
      majorEventName: 'Conference',
      eventGroupName: 'Track A',
      attendancesCount: 3,
      subscriptionsCount: 8,
      shouldCollectAttendance: true,
      canCollectAttendanceNow: true,
    });
  });

  it('keeps nullable names and disables attendance collection when collection is off', () => {
    const result = mapCalendarEvent(
      insightEvent({
        shouldCollectAttendance: false,
        majorEvent: null,
        eventGroup: null,
      }) as never,
      new Date('2026-05-21T12:00:00.000Z'),
    );

    expect(result.majorEventName).toBeNull();
    expect(result.eventGroupName).toBeNull();
    expect(result.canCollectAttendanceNow).toBe(false);
  });
});
