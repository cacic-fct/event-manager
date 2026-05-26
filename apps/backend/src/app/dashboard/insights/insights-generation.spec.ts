import { createInsightsServiceTestContext, insightEvent } from './insights-service.fixtures';

describe('DashboardInsightsService generation', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('generates and caches permission-aware dashboard insights', async () => {
    const { keycloakAuthService, prisma, redis, service, weatherService } = createInsightsServiceTestContext();
    keycloakAuthService.evaluateAccessTokenPermissions.mockResolvedValue([
      'event#edit',
      'major-event#edit',
      'certificate#edit',
      'merge-candidate#read',
      'validate-receipt:read',
      'person#manage',
    ]);
    prisma.event.count.mockResolvedValue(10);
    prisma.eventGroup.count.mockResolvedValue(3);
    prisma.majorEvent.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.mergeCandidate.count.mockResolvedValue(4);
    prisma.majorEventSubscription.count.mockResolvedValue(5);
    prisma.event.findMany
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
          startDate: new Date('2009-12-31T13:00:00.000Z'),
          endDate: new Date('2009-12-31T14:00:00.000Z'),
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
    expect(result.duplicatePeopleCount).toBe(4);
    expect(result.inconsistencies.map((item) => item.type)).toEqual(
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
      ]),
    );
    expect(result.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'event',
          label: 'Evento',
          resourceIcon: 'event',
          actions: [expect.objectContaining({ scope: 'edit', label: 'Editar', icon: 'edit' })],
        }),
        expect.objectContaining({
          type: 'person',
          label: 'Pessoas',
          resourceIcon: 'person',
          actions: [expect.objectContaining({ scope: 'manage', label: 'Gerenciar', icon: 'admin_panel_settings' })],
        }),
      ]),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'dashboard:workspace:v4:certificate#edit,event#edit,major-event#edit,merge-candidate#read,person#manage,validate-receipt:read',
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

  it('serves uncached non-personalized insights when permission evaluation fails', async () => {
    const { currentUserContext, keycloakAuthService, prisma, redis, service } = createInsightsServiceTestContext();
    currentUserContext.getAuthenticatedUser.mockReturnValue({
      token: 'token',
      permissionSet: new Set<string>(['event#edit', 'major-event#edit']),
    });
    keycloakAuthService.evaluateAccessTokenPermissions.mockRejectedValue(new Error('UMA unavailable'));
    prisma.event.count.mockResolvedValue(0);
    prisma.eventGroup.count.mockResolvedValue(0);
    prisma.majorEvent.count.mockResolvedValue(0);
    prisma.mergeCandidate.count.mockResolvedValue(9);
    prisma.majorEventSubscription.count.mockResolvedValue(8);
    prisma.majorEvent.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.eventGroup.findMany.mockResolvedValue([]);

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.suggestions.map((suggestion) => suggestion.action)).toEqual([
      'CREATE_EVENT_GROUP',
      'CREATE_EVENT',
      'CREATE_MAJOR_EVENT',
    ]);
    expect(result.pendingReceiptValidationsCount).toBe(0);
    expect(result.pendingReceiptMajorEvents).toEqual([]);
    expect(result.duplicatePeopleCount).toBe(0);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
