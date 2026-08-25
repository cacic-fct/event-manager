import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { RATE_LIMIT_METADATA_KEY } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { EventSitemapResolver } from './event-sitemap.resolver';

describe('EventSitemapResolver', () => {
  it('exposes the resolver publicly and forwards the requested page unchanged', async () => {
    const page = { entries: [], hasNextPage: false };
    const getPage = jest.fn().mockResolvedValue(page);
    const resolver = new EventSitemapResolver({ getPage } as never);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, EventSitemapResolver)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, EventSitemapResolver.prototype.publicEventSitemap)).toEqual([
      RateLimitGuard,
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, EventSitemapResolver.prototype.publicEventSitemap)).toEqual({
      policy: RATE_LIMIT_POLICIES.publicEvents,
      resources: [],
    });
    await expect(resolver.publicEventSitemap(4)).resolves.toBe(page);
    expect(getPage).toHaveBeenCalledWith(4);
  });
});
