import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { RATE_LIMIT_METADATA_KEY } from '../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PublicPlatformStatsResolver } from './public-platform-stats.resolver';

describe('PublicPlatformStatsResolver', () => {
  it('exposes the delayed aggregate projection through the public rate limit policy', async () => {
    const stats = { events: 10, people: 20 };
    const getPublicPlatformStats = jest.fn().mockResolvedValue(stats);
    const resolver = new PublicPlatformStatsResolver({ getPublicPlatformStats } as never);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicPlatformStatsResolver)).toBe(true);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, PublicPlatformStatsResolver.prototype.publicPlatformStats)).toEqual(
      { policy: RATE_LIMIT_POLICIES.publicEvents, resources: [] },
    );
    await expect(resolver.publicPlatformStats()).resolves.toBe(stats);
    expect(getPublicPlatformStats).toHaveBeenCalledTimes(1);
  });
});
