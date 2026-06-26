import { buildInconsistencies } from './inconsistencies';
import { insightEvent } from './insights-service.fixtures';

describe('buildInconsistencies', () => {
  const now = new Date('2026-05-22T11:00:00.000Z');

  it('reports all dashboard inconsistency categories and limits the result list', () => {
    const result = buildInconsistencies({
      now,
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
      pastCertificateEventsWithoutAttendanceCollection: [{ id: 'no-attendance', name: 'No attendance' }],
      majorEventsWithSubscriptionDates: [
        {
          id: 'major-subscription-mismatch',
          name: 'Major subscription mismatch',
          startDate: new Date('2026-05-23T12:00:00.000Z'),
          endDate: new Date('2026-05-25T12:00:00.000Z'),
          subscriptionStartDate: new Date('2026-05-26T12:00:00.000Z'),
          subscriptionEndDate: new Date('2026-05-26T13:00:00.000Z'),
        },
      ],
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
          id: 'first-overlap-event',
          name: 'First overlap event',
          startDate: new Date('2026-05-22T12:00:00.000Z'),
          endDate: new Date('2026-05-22T14:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
        }) as never,
        insightEvent({
          id: 'second-overlap-event',
          name: 'Second overlap event',
          startDate: new Date('2026-05-22T13:00:00.000Z'),
          endDate: new Date('2026-05-22T15:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
        }) as never,
        insightEvent({
          id: 'subscription-mismatch-event',
          name: 'Subscription mismatch event',
          startDate: new Date('2026-05-24T12:00:00.000Z'),
          endDate: new Date('2026-05-24T13:00:00.000Z'),
          subscriptionStartDate: new Date('2026-05-24T14:00:00.000Z'),
          subscriptionEndDate: new Date('2026-05-24T15:00:00.000Z'),
          lecturers: [{ personId: 'person-2', person: { id: 'person-2', name: 'Grace' } }],
        }) as never,
        insightEvent({
          id: 'first-place-event',
          name: 'First place event',
          startDate: new Date('2026-05-23T12:00:00.000Z'),
          endDate: new Date('2026-05-23T14:00:00.000Z'),
          locationDescription: 'Auditório 1',
          lecturers: [{ personId: 'person-3', person: { id: 'person-3', name: 'Katherine' } }],
        }) as never,
        insightEvent({
          id: 'second-place-event',
          name: 'Second place event',
          startDate: new Date('2026-05-23T13:00:00.000Z'),
          endDate: new Date('2026-05-23T15:00:00.000Z'),
          locationDescription: 'Auditório 1',
          lecturers: [{ personId: 'person-4', person: { id: 'person-4', name: 'Dorothy' } }],
        }) as never,
        insightEvent({
          id: 'empty-event',
          name: 'Empty event',
          description: 'Curta',
          shortDescription: null,
          locationDescription: null,
          lecturers: [],
        }) as never,
      ],
    });

    expect(result.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'EVENT_GROUP_WITH_SINGLE_EVENT',
        'EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH',
        'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
        'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION',
        'MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH',
        'SUSPICIOUS_DURATION',
        'SUSPICIOUS_DATE',
        'PLACEHOLDER_EMOJI',
        'LECTURER_SELF_SUBSCRIBED',
        'LECTURER_SELF_ATTENDED',
        'LECTURER_DOUBLE_BOOKED',
        'EVENT_WITHOUT_LECTURER',
        'EVENT_WITHOUT_PLACE',
        'WEAK_EVENT_DESCRIPTION',
        'EVENT_SUBSCRIPTION_DATE_MISMATCH',
        'PLACE_DOUBLE_BOOKED',
      ]),
    );
    expect(result.filter((item) => item.eventId === 'no-attendance').map((item) => item.type)).toEqual([
      'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
      'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION',
    ]);
  });

  it('limits the result list to thirty entries', () => {
    const result = buildInconsistencies({
      now,
      singleEventGroups: [],
      mismatchingCertificateGroupEvents: [],
      pastCertificateEventsWithoutAttendance: [],
      pastCertificateEventsWithoutAttendanceCollection: [],
      majorEventsWithSubscriptionDates: [],
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

  it('caps same-place conflict generation before allocating every overlapping pair', () => {
    const result = buildInconsistencies({
      now,
      singleEventGroups: [],
      mismatchingCertificateGroupEvents: [],
      pastCertificateEventsWithoutAttendance: [],
      pastCertificateEventsWithoutAttendanceCollection: [],
      majorEventsWithSubscriptionDates: [],
      events: Array.from({ length: 5000 }, (_, index) =>
        insightEvent({
          id: `same-place-event-${index}`,
          name: `Same place event ${index}`,
          startDate: new Date('2026-05-23T12:00:00.000Z'),
          endDate: new Date('2026-05-23T14:00:00.000Z'),
          locationDescription: 'Auditório principal',
          lecturers: [
            { personId: `lecturer-${index}`, person: { id: `lecturer-${index}`, name: `Lecturer ${index}` } },
          ],
        }),
      ) as never[],
    });

    expect(result).toHaveLength(30);
    expect(result.every((item) => item.type === 'PLACE_DOUBLE_BOOKED')).toBe(true);
  });

  it('skips categories that are not inconsistent', () => {
    const result = buildInconsistencies({
      now,
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
      pastCertificateEventsWithoutAttendanceCollection: [],
      majorEventsWithSubscriptionDates: [
        {
          id: 'clean-major-event',
          name: 'Clean major event',
          startDate: new Date('2026-05-22T12:00:00.000Z'),
          endDate: new Date('2026-05-22T16:00:00.000Z'),
          subscriptionStartDate: new Date('2026-05-22T10:00:00.000Z'),
          subscriptionEndDate: new Date('2026-05-22T14:00:00.000Z'),
        },
      ],
      events: [
        insightEvent({
          id: 'clean-event',
          name: 'Clean event',
          startDate: new Date('2026-05-22T12:00:00.000Z'),
          endDate: new Date('2026-05-22T13:00:00.000Z'),
          subscriptionStartDate: new Date('2026-05-22T10:00:00.000Z'),
          subscriptionEndDate: new Date('2026-05-22T12:30:00.000Z'),
          lecturers: [{ personId: 'lecturer-1', person: { id: 'lecturer-1', name: 'Grace' } }],
          subscriptions: [{ personId: 'attendee-1' }],
          attendances: [{ personId: 'attendee-1' }],
        }) as never,
      ],
    });

    expect(result).toEqual([]);
  });
});
