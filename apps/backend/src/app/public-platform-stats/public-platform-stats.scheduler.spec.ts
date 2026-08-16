import { PublicPlatformStatsScheduler } from './public-platform-stats.scheduler';

describe('PublicPlatformStatsScheduler', () => {
  it('registers the public statistics refresh job during startup', async () => {
    const scheduleRefreshJob = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PublicPlatformStatsScheduler({ scheduleRefreshJob } as never);

    await scheduler.onModuleInit();

    expect(scheduleRefreshJob).toHaveBeenCalledTimes(1);
  });

  it('propagates scheduling failures so missing statistics jobs are visible at startup', async () => {
    const scheduleRefreshJob = jest.fn().mockRejectedValue(new Error('queue unavailable'));
    const scheduler = new PublicPlatformStatsScheduler({ scheduleRefreshJob } as never);

    await expect(scheduler.onModuleInit()).rejects.toThrow('queue unavailable');
  });
});
