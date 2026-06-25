import { Permission } from '@cacic-fct/shared-permissions';
import { createInsightsServiceTestContext, insightEvent } from './insights-service.fixtures';

describe('DashboardInsightsService generation', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('generates and caches permission-aware dashboard insights', async () => {
    const { authorizationPolicy, prisma, redis, service, weatherService } = createInsightsServiceTestContext();
    authorizationPolicy.evaluateGlobalPermissions.mockResolvedValue([
      'event#update',
      'major-event#update',
      'certificate#issue',
      'merge-candidate#read',
      'receipt#read',
      'person#update',
      'event-attendance#update',
    ]);
    prisma.event.count.mockResolvedValue(10);
    prisma.eventGroup.count.mockResolvedValue(3);
    prisma.majorEvent.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.mergeCandidate.count.mockResolvedValue(4);
    prisma.majorEventSubscription.count.mockResolvedValue(5);
    prisma.offlineEventAttendanceSubmission.count.mockResolvedValue(7);
    prisma.event.findMany
      .mockResolvedValueOnce([
        {
          id: 'offline-event',
          name: 'Offline event',
          emoji: '✅',
          startDate: new Date('2026-05-18T10:00:00.000Z'),
          endDate: new Date('2026-05-18T12:00:00.000Z'),
          _count: { offlineAttendanceSubmissions: 7 },
        },
      ])
      .mockResolvedValueOnce([insightEvent({ id: 'calendar-1', latitude: -22.1, longitude: -51.4 })])
      .mockResolvedValueOnce([
        insightEvent({
          id: 'bad-event',
          name: 'Bad event',
          emoji: '❔',
          startDate: new Date('2009-12-31T12:00:00.000Z'),
          endDate: new Date('2010-01-01T22:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
          subscriptions: [{ personId: 'person-1' }],
          attendances: [{ personId: 'person-1' }],
        }),
        insightEvent({
          id: 'overlap-event',
          name: 'Overlap event',
          startDate: new Date('2026-05-22T13:00:00.000Z'),
          endDate: new Date('2026-05-22T14:00:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
        }),
        insightEvent({
          id: 'overlap-event-2',
          name: 'Overlap event 2',
          startDate: new Date('2026-05-22T13:30:00.000Z'),
          endDate: new Date('2026-05-22T14:30:00.000Z'),
          lecturers: [{ personId: 'person-1', person: { id: 'person-1', name: 'Ada' } }],
        }),
      ])
      .mockResolvedValueOnce([
        {
          id: 'mismatch-event',
          name: 'Mismatch',
          shouldIssueCertificate: true,
          eventGroup: {
            id: 'group-1',
            name: 'Group',
            shouldIssueCertificate: false,
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'no-attendance-event', name: 'No attendance' }])
      .mockResolvedValueOnce([{ id: 'no-attendance-event', name: 'No attendance' }])
      .mockResolvedValueOnce([
        {
          id: 'pending-event',
          name: 'Pending event',
          endDate: new Date('2026-05-20T10:00:00.000Z'),
          eventGroup: null,
          shouldIssueCertificate: true,
          certificateConfigs: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'lecturer-event',
          name: 'Lecturer event',
          endDate: new Date('2026-05-20T09:00:00.000Z'),
          lecturers: [{ personId: 'lecturer-1' }],
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ]);
    prisma.eventGroup.findMany
      .mockResolvedValueOnce([{ id: 'single-group', name: 'Single group', events: [{ id: 'event-1' }] }])
      .mockResolvedValueOnce([
        {
          id: 'pending-group',
          name: 'Pending group',
          shouldIssueCertificate: true,
          events: [{ endDate: new Date('2026-05-19T10:00:00.000Z') }],
          certificateConfigs: [],
        },
      ]);
    prisma.majorEvent.findMany
      .mockResolvedValueOnce([
        {
          id: 'receipt-major',
          name: 'Receipt major',
          emoji: '🎓',
          startDate: new Date('2026-05-24T10:00:00.000Z'),
          endDate: new Date('2026-05-26T20:00:00.000Z'),
          _count: { subscriptions: 5 },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'major-subscription-mismatch',
          name: 'Major subscription mismatch',
          startDate: new Date('2026-05-24T10:00:00.000Z'),
          endDate: new Date('2026-05-26T20:00:00.000Z'),
          subscriptionStartDate: new Date('2026-05-27T10:00:00.000Z'),
          subscriptionEndDate: new Date('2026-05-27T11:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'published-major-without-visible-children',
          name: 'Published major without visible children',
          publicationState: 'PUBLISHED',
          scheduledPublishAt: null,
          events: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'pending-major',
          name: 'Pending major',
          endDate: new Date('2026-05-18T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'pending-major-lecturers',
          name: 'Pending major lecturers',
          endDate: new Date('2026-05-17T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [{ personId: 'lecturer-2' }] }],
          events: [{ lecturers: [{ personId: 'lecturer-1' }] }],
        },
      ]);
    weatherService.getPublicEventWeather.mockResolvedValue({
      weatherCode: 61,
      summary: 'Chuva leve',
      materialIcon: 'rainy',
      forecastTime: new Date('2026-05-22T12:00:00.000Z'),
      temperature: 22,
    });

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.summary).toEqual({
      eventsCount: 10,
      eventGroupsCount: 3,
      majorEventsCount: 2,
    });
    expect(result.suggestions).toEqual([]);
    expect(result.calendarEvents).toEqual([
      expect.objectContaining({
        id: 'calendar-1',
        canCollectAttendanceNow: false,
      }),
    ]);
    expect(result.weatherAlerts).toEqual([
      expect.objectContaining({
        eventId: 'calendar-1',
        summary: 'Chuva leve',
      }),
    ]);
    expect(result.pendingCertificates.map((item) => item.targetId)).toEqual([
      'pending-event',
      'lecturer-event',
      'pending-group',
      'pending-major',
      'pending-major-lecturers',
    ]);
    expect(result.pendingReceiptValidationsCount).toBe(5);
    expect(result.pendingReceiptMajorEvents).toEqual([
      {
        majorEventId: 'receipt-major',
        name: 'Receipt major',
        emoji: '🎓',
        startDate: new Date('2026-05-24T10:00:00.000Z'),
        endDate: new Date('2026-05-26T20:00:00.000Z'),
        pendingCount: 5,
      },
    ]);
    expect(result.pendingOfflineAttendancesCount).toBe(7);
    expect(result.pendingOfflineAttendanceEvents).toEqual([
      {
        eventId: 'offline-event',
        name: 'Offline event',
        emoji: '✅',
        startDate: new Date('2026-05-18T10:00:00.000Z'),
        endDate: new Date('2026-05-18T12:00:00.000Z'),
        pendingCount: 7,
      },
    ]);
    expect(result.duplicatePeopleCount).toBe(4);
    expect(result.inconsistencies.map((item) => item.type)).toEqual(
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
      ]),
    );
    expect(prisma.event.findMany.mock.calls[3]?.[0].where).not.toHaveProperty('shouldCollectAttendance');
    expect(result.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'event',
          label: 'Evento',
          resourceIcon: 'event',
          actions: [expect.objectContaining({ scope: 'update', label: 'Atualizar', icon: 'edit' })],
        }),
        expect.objectContaining({
          type: 'person',
          label: 'Pessoa',
          resourceIcon: 'person',
          actions: [expect.objectContaining({ scope: 'update', label: 'Atualizar', icon: 'edit' })],
        }),
      ]),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'dashboard:workspace:v5:certificate#issue,event#update,event-attendance#update,major-event#update,merge-candidate#read,person#update,receipt#read',
      expect.stringContaining('"eventsCount":10'),
      'EX',
      300,
    );
  });

  it('rejects dashboard insights for authenticated users without administrative permissions', async () => {
    const { prisma, service } = createInsightsServiceTestContext();

    await expect(service.getWorkspaceDashboardInsights({} as never)).rejects.toThrow(
      'Workspace dashboard insights require an administrative permission.',
    );
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.event.count).not.toHaveBeenCalled();
  });

  it('renders an empty dashboard shell for scoped-only administrators without global insight queries', async () => {
    const { authorizationPolicy, prisma, redis, service, weatherService } = createInsightsServiceTestContext();
    authorizationPolicy.evaluateGlobalPermissions.mockResolvedValue([]);
    authorizationPolicy.evaluatePermissions.mockResolvedValue([Permission.Event.Update]);

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.summary).toEqual({
      eventsCount: 0,
      eventGroupsCount: 0,
      majorEventsCount: 0,
    });
    expect(result.calendarEvents).toEqual([]);
    expect(result.weatherAlerts).toEqual([]);
    expect(result.permissions).toEqual([
      expect.objectContaining({
        type: 'event',
        actions: [expect.objectContaining({ scope: 'update' })],
      }),
    ]);
    expect(prisma.event.count).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.eventGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
    expect(weatherService.getPublicEventWeather).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('reports major-event subscription date issues without event-level inconsistency queries', async () => {
    const { authorizationPolicy, prisma, service } = createInsightsServiceTestContext();
    authorizationPolicy.evaluateGlobalPermissions.mockResolvedValue([Permission.MajorEvent.Update]);
    prisma.majorEvent.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prisma.majorEvent.findMany.mockResolvedValueOnce([
      {
        id: 'major-subscription-mismatch',
        name: 'Major subscription mismatch',
        startDate: new Date('2026-05-24T10:00:00.000Z'),
        endDate: new Date('2026-05-26T20:00:00.000Z'),
        subscriptionStartDate: new Date('2026-05-26T18:00:00.000Z'),
        subscriptionEndDate: new Date('2026-05-27T11:00:00.000Z'),
      },
    ]);

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.inconsistencies).toEqual([
      expect.objectContaining({
        type: 'MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH',
        action: 'OPEN_MAJOR_EVENT',
        targetId: 'major-subscription-mismatch',
      }),
    ]);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.eventGroup.findMany).not.toHaveBeenCalled();
  });

  it('propagates permission evaluation failures', async () => {
    const { authorizationPolicy, prisma, redis, service } = createInsightsServiceTestContext();
    authorizationPolicy.evaluateGlobalPermissions.mockRejectedValue(new Error('policy unavailable'));

    await expect(service.getWorkspaceDashboardInsights({} as never)).rejects.toThrow('policy unavailable');

    expect(prisma.event.count).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not query or return event calendar data without event read permission', async () => {
    const { authorizationPolicy, prisma, service, weatherService } = createInsightsServiceTestContext();
    authorizationPolicy.evaluateGlobalPermissions.mockResolvedValue(['receipt#read']);
    prisma.majorEventSubscription.count.mockResolvedValue(2);
    prisma.majorEvent.findMany.mockResolvedValue([]);

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.calendarEvents).toEqual([]);
    expect(result.weatherAlerts).toEqual([]);
    expect(result.pendingReceiptValidationsCount).toBe(2);
    expect(result.pendingOfflineAttendancesCount).toBe(0);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(weatherService.getPublicEventWeather).not.toHaveBeenCalled();
  });
});
