import { buildInconsistencies } from './inconsistencies';
import { insightEvent } from './insights-service.fixtures';

describe('buildInconsistencies', () => {
  it('reports all dashboard inconsistency categories and limits the result list', () => {
    const result = buildInconsistencies({
      singleEventGroups: [{ id: 'single-group', name: 'Single group', events: [{ id: 'group-event' }] }],
      mismatchingCertificateGroupEvents: [
        {
          id: 'mismatch-event',
          name: 'Mismatch event',
          shouldIssueCertificate: true,
          eventGroup: {
            id: 'group-1',
            name: 'Group',
            shouldIssueCertificate: false,
          },
        },
      ],
      pastCertificateEventsWithoutAttendance: [{ id: 'no-attendance', name: 'No attendance' }],
      events: [
        insightEvent({
          id: 'bad-event',
          name: 'Bad event',
          emoji: '❔',
          startDate: new Date('2009-12-31T12:00:00.000Z'),
          endDate: new Date('2010-01-01T22:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
          subscriptions: [{ personId: 'person-1' }],
          attendances: [{ personId: 'person-1' }],
        }) as never,
        insightEvent({
          id: 'overlap-event',
          name: 'Overlap event',
          startDate: new Date('2009-12-31T13:00:00.000Z'),
          endDate: new Date('2009-12-31T14:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
        }) as never,
        insightEvent({
          id: 'empty-event',
          name: 'Empty event',
          lecturers: [],
        }) as never,
      ],
    });

    expect(result.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'EVENT_GROUP_WITH_SINGLE_EVENT',
        'EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH',
        'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
        'SUSPICIOUS_DURATION',
        'SUSPICIOUS_DATE',
        'PLACEHOLDER_EMOJI',
        'LECTURER_SELF_SUBSCRIBED',
        'LECTURER_SELF_ATTENDED',
        'LECTURER_DOUBLE_BOOKED',
        'EVENT_WITHOUT_LECTURER',
      ]),
    );
  });

  it('limits the result list to thirty entries', () => {
    const result = buildInconsistencies({
      singleEventGroups: [],
      mismatchingCertificateGroupEvents: [],
      pastCertificateEventsWithoutAttendance: [],
      events: Array.from({ length: 35 }, (_, index) =>
        insightEvent({
          id: `empty-event-${index}`,
          name: `Empty event ${index}`,
          lecturers: [],
        }),
      ) as never[],
    });

    expect(result).toHaveLength(30);
  });

  it('skips categories that are not inconsistent', () => {
    const result = buildInconsistencies({
      singleEventGroups: [{ id: 'multi-group', name: 'Multi group', events: [{ id: 'event-1' }, { id: 'event-2' }] }],
      mismatchingCertificateGroupEvents: [
        {
          id: 'matching-event',
          name: 'Matching event',
          shouldIssueCertificate: true,
          eventGroup: {
            id: 'group-1',
            name: 'Group',
            shouldIssueCertificate: true,
          },
        },
        {
          id: 'ungrouped-event',
          name: 'Ungrouped event',
          shouldIssueCertificate: true,
          eventGroup: null,
        },
      ],
      pastCertificateEventsWithoutAttendance: [],
      events: [
        insightEvent({
          id: 'clean-event',
          name: 'Clean event',
          startDate: new Date('2026-05-22T12:00:00.000Z'),
          endDate: new Date('2026-05-22T13:00:00.000Z'),
          lecturers: [{ personId: 'lecturer-1', person: { id: 'lecturer-1', name: 'Grace' } }],
          subscriptions: [{ personId: 'attendee-1' }],
          attendances: [{ personId: 'attendee-1' }],
        }) as never,
      ],
    });

    expect(result).toEqual([]);
  });
});
