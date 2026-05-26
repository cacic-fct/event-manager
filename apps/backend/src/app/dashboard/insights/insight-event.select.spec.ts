import { EVENT_INSIGHT_SELECT } from './insight-event.select';

describe('EVENT_INSIGHT_SELECT', () => {
  it('selects the event fields and relations required by dashboard insights', () => {
    expect(EVENT_INSIGHT_SELECT).toMatchObject({
      id: true,
      name: true,
      emoji: true,
      type: true,
      startDate: true,
      endDate: true,
      locationDescription: true,
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
          attendances: true,
          subscriptions: { where: { deletedAt: null } },
        },
      },
    });
  });
});
