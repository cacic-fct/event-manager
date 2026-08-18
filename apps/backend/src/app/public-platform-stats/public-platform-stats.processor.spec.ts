import { PublicPlatformStatsProcessor } from './public-platform-stats.processor';

describe('PublicPlatformStatsProcessor', () => {
  it('refreshes the public projection for the supported job', async () => {
    const refreshPublicPlatformStats = jest.fn().mockResolvedValue(undefined);
    const processor = new PublicPlatformStatsProcessor({ refreshPublicPlatformStats } as never);

    await processor.process({ name: 'refresh-public-platform-stats', data: {} } as never);

    expect(refreshPublicPlatformStats).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated queue jobs', async () => {
    const refreshPublicPlatformStats = jest.fn();
    const processor = new PublicPlatformStatsProcessor({ refreshPublicPlatformStats } as never);

    await processor.process({ name: 'unknown', data: {} } as never);

    expect(refreshPublicPlatformStats).not.toHaveBeenCalled();
  });
});
