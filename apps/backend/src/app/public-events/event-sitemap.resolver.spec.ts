import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { EventSitemapResolver } from './event-sitemap.resolver';

describe('EventSitemapResolver', () => {
  it('exposes the resolver publicly and forwards the requested page unchanged', async () => {
    const page = { entries: [], hasNextPage: false };
    const getPage = jest.fn().mockResolvedValue(page);
    const resolver = new EventSitemapResolver({ getPage } as never);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, EventSitemapResolver)).toBe(true);
    await expect(resolver.publicEventSitemap(4)).resolves.toBe(page);
    expect(getPage).toHaveBeenCalledWith(4);
  });
});
