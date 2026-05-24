import { createInsightsServiceTestContext } from './insights-service.fixtures';

describe('DashboardInsightsService cache and jobs', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns cached insights with dates restored and skips regeneration', async () => {
    const { prisma, redis, service } = createInsightsServiceTestContext();
    redis.get.mockResolvedValue(
      JSON.stringify({
        generatedAt: '2026-05-21T12:00:00.000Z',
        summary: {
          eventsCount: 1,
          eventGroupsCount: 2,
          majorEventsCount: 3,
        },
        suggestions: [],
        calendarEvents: [
          {
            id: 'event-1',
            name: 'Cached event',
            emoji: '📌',
            type: 'PALESTRA',
            startDate: '2026-05-22T12:00:00.000Z',
            endDate: '2026-05-22T13:00:00.000Z',
            locationDescription: 'Room 1',
            majorEventName: null,
            eventGroupName: null,
            attendancesCount: 0,
            subscriptionsCount: 0,
            shouldCollectAttendance: true,
            canCollectAttendanceNow: false,
          },
        ],
        weatherAlerts: [
          {
            eventId: 'event-1',
            eventName: 'Cached event',
            summary: 'Chuva',
            materialIcon: 'rainy',
            forecastTime: '2026-05-22T12:00:00.000Z',
            temperature: 21,
          },
        ],
        pendingCertificates: [
          {
            targetType: 'EVENT',
            targetId: 'event-1',
            title: 'Cached event',
            subtitle: 'Pending',
            finishedAt: '2026-05-20T12:00:00.000Z',
          },
        ],
        pendingReceiptValidationsCount: 0,
        pendingReceiptMajorEvents: [],
        inconsistencies: [],
        duplicatePeopleCount: 0,
        permissions: [],
      }),
    );

    const result = await service.getWorkspaceDashboardInsights({} as never);

    expect(result.generatedAt).toEqual(new Date('2026-05-21T12:00:00.000Z'));
    expect(result.calendarEvents[0].startDate).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(result.weatherAlerts[0].forecastTime).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(result.pendingCertificates[0].finishedAt).toEqual(new Date('2026-05-20T12:00:00.000Z'));
    expect(prisma.event.count).not.toHaveBeenCalled();
  });

  it('reuses an in-flight generation for the same permission cache key', async () => {
    const { keycloakAuthService, prisma, redis, service } = createInsightsServiceTestContext();
    keycloakAuthService.evaluateAccessTokenPermissions.mockResolvedValue(['event#edit']);
    redis.get.mockResolvedValue(null);
    prisma.event.count.mockResolvedValue(1);
    prisma.eventGroup.count.mockResolvedValue(2);
    prisma.majorEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    prisma.mergeCandidate.count.mockResolvedValue(0);
    prisma.majorEventSubscription.count.mockResolvedValue(0);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.eventGroup.findMany.mockResolvedValue([]);

    const firstRequest = service.getWorkspaceDashboardInsights({} as never);
    await Promise.resolve();
    await Promise.resolve();
    const secondRequest = service.getWorkspaceDashboardInsights({} as never);

    const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

    expect(firstResult).toBe(secondResult);
    expect(prisma.event.count).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('schedules refresh jobs and invalidates cached dashboard keys', async () => {
    const { queue, redis, service } = createInsightsServiceTestContext();
    redis.scanStream.mockReturnValue(
      (async function* scan() {
        yield ['dashboard:workspace:v3:event#edit', 'dashboard:workspace:v3:none'];
        yield [];
        yield ['dashboard:workspace:v3:certificate#edit'];
      })(),
    );

    await service.scheduleRefreshJobs();
    await service.invalidateCachedInsights();

    expect(queue.add).toHaveBeenCalledWith(
      'refresh-realtime-dashboard-insights',
      { scope: 'realtime' },
      expect.objectContaining({
        jobId: 'dashboard-insights:realtime',
        repeat: { pattern: '*/5 * * * *' },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'refresh-operational-dashboard-insights',
      { scope: 'operational' },
      expect.objectContaining({
        jobId: 'dashboard-insights:operational',
        repeat: { pattern: '*/30 * * * *' },
      }),
    );
    expect(redis.del).toHaveBeenCalledWith('dashboard:workspace:v3:event#edit', 'dashboard:workspace:v3:none');
    expect(redis.del).toHaveBeenCalledWith('dashboard:workspace:v3:certificate#edit');
  });
});
