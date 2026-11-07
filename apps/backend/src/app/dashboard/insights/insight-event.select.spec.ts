import { CALENDAR_EVENT_SELECT, CONSISTENCY_EVENT_SELECT, EVENT_INSIGHT_SELECT } from './insight-event.select';

describe('EVENT_INSIGHT_SELECT', () => {
  it('keeps calendar counts without hydrating audience evidence and omits counts from consistency reads', () => {
    expect(CALENDAR_EVENT_SELECT._count).toEqual(EVENT_INSIGHT_SELECT._count);
    expect(CALENDAR_EVENT_SELECT).not.toHaveProperty('subscriptions');
    expect(CALENDAR_EVENT_SELECT).not.toHaveProperty('attendances');
    expect(CALENDAR_EVENT_SELECT).not.toHaveProperty('lecturers');
    expect(CONSISTENCY_EVENT_SELECT).toMatchObject({ subscriptions: false, attendances: false, _count: false });
  });
  it('selects the event fields and relations required by dashboard insights', () => {
    expect(EVENT_INSIGHT_SELECT).toMatchObject({
      id: true,
      name: true,
      emoji: true,
      type: true,
      startDate: true,
      endDate: true,
      description: true,
      shortDescription: true,
      locationName: true,
      locationDescription: true,
      isVirtual: true,
      latitude: true,
      longitude: true,
      majorEventId: true,
      eventGroupId: true,
      shouldCollectAttendance: true,
      shouldIssueCertificate: true,
      majorEvent: {
        select: {
          id: true,
          name: true,
          certificateConfigs: {
            where: { deletedAt: null, isActive: true },
            select: { id: true },
          },
        },
      },
      eventGroup: {
        select: {
          id: true,
          name: true,
          shouldIssueCertificate: true,
          certificateConfigs: {
            where: { deletedAt: null, isActive: true },
            select: { id: true },
          },
        },
      },
      certificateConfigs: {
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      },
      allowSubscription: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      slots: true,
      lecturers: {
        select: {
          personId: true,
          person: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      subscriptions: {
        where: { deletedAt: null },
        select: { personId: true },
      },
      attendances: {
        select: { personId: true },
      },
      _count: {
        select: {
          attendances: { where: { status: 'PRESENT' } },
          subscriptions: { where: { deletedAt: null } },
        },
      },
    });
  });
});
