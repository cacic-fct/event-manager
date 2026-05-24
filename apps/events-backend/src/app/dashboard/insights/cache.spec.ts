import { getCachedInsights, getCacheKey } from './cache';

describe('dashboard insights cache helpers', () => {
  it('returns null when cache is empty', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
    };

    await expect(getCachedInsights(redis as never, 'dashboard:workspace:v3:none')).resolves.toBeNull();
    expect(redis.get).toHaveBeenCalledWith('dashboard:workspace:v3:none');
  });

  it('restores cached date strings to Date instances', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(
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
              majorEventName: 'Major',
              eventGroupName: 'Group',
              attendancesCount: 4,
              subscriptionsCount: 5,
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
          pendingReceiptMajorEvents: [
            {
              majorEventId: 'major-1',
              name: 'Cached major',
              emoji: '🎓',
              startDate: '2026-05-24T12:00:00.000Z',
              endDate: '2026-05-26T12:00:00.000Z',
              pendingCount: 2,
            },
          ],
          inconsistencies: [],
          duplicatePeopleCount: 0,
          permissions: [],
        }),
      ),
    };

    const result = await getCachedInsights(redis as never, 'cache-key');

    expect(result?.generatedAt).toEqual(new Date('2026-05-21T12:00:00.000Z'));
    expect(result?.calendarEvents[0].startDate).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(result?.calendarEvents[0].endDate).toEqual(new Date('2026-05-22T13:00:00.000Z'));
    expect(result?.weatherAlerts[0].forecastTime).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(result?.pendingCertificates[0].finishedAt).toEqual(new Date('2026-05-20T12:00:00.000Z'));
    expect(result?.pendingReceiptMajorEvents[0].startDate).toEqual(new Date('2026-05-24T12:00:00.000Z'));
    expect(result?.pendingReceiptMajorEvents[0].endDate).toEqual(new Date('2026-05-26T12:00:00.000Z'));
  });

  it('returns null for invalid cache payloads', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue('{invalid-json'),
    };

    await expect(getCachedInsights(redis as never, 'cache-key')).resolves.toBeNull();
  });

  it('builds permission-aware cache keys', () => {
    expect(getCacheKey([])).toBe('dashboard:workspace:v3:none');
    expect(getCacheKey(['event#edit', 'certificate#edit', 'event#edit'])).toBe(
      'dashboard:workspace:v3:certificate#edit,event#edit',
    );
    expect(getCacheKey(['certificate#edit', 'event#edit'])).toBe(
      'dashboard:workspace:v3:certificate#edit,event#edit',
    );
  });
});
