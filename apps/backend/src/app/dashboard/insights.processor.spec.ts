import { DashboardInsightsProcessor } from './insights.processor';

describe('DashboardInsightsProcessor', () => {
  it.each(['refresh-realtime-dashboard-insights', 'refresh-operational-dashboard-insights'])(
    'invalidates cached insights for %s',
    async (name) => {
      const invalidateCachedInsights = jest.fn().mockResolvedValue(undefined);
      const processor = new DashboardInsightsProcessor({ invalidateCachedInsights } as never);

      await processor.process({ name, data: {} } as never);

      expect(invalidateCachedInsights).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores unrelated queue jobs', async () => {
    const invalidateCachedInsights = jest.fn();
    const processor = new DashboardInsightsProcessor({ invalidateCachedInsights } as never);

    await processor.process({ name: 'unknown', data: {} } as never);

    expect(invalidateCachedInsights).not.toHaveBeenCalled();
  });
});
