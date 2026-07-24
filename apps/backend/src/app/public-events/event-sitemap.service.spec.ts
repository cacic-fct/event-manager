import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from './models';
import { EVENT_SITEMAP_URL_LIMIT, EventSitemapService } from './event-sitemap.service';

describe('EventSitemapService', () => {
  const createContext = () => {
    const prisma = {
      event: {
        findMany: jest.fn(),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const service = new EventSitemapService(prisma as unknown as PrismaService, redis as unknown as Redis);

    return { prisma, redis, service };
  };

  it('uses the public event predicate, sorts UUIDv7 IDs, and limits a URL sitemap to 50,000 entries', async () => {
    const { prisma, redis, service } = createContext();
    const updatedAt = new Date('2026-07-23T12:00:00.000Z');
    const entries = Array.from({ length: EVENT_SITEMAP_URL_LIMIT + 1 }, (_, index) => ({
      id: `0198${String(index).padStart(32, '0')}`,
      updatedAt,
    }));
    prisma.event.findMany.mockResolvedValue(entries);

    await expect(service.getPage(0)).resolves.toMatchObject({
      pageCount: 2,
      entries: expect.arrayContaining([entries[0]]),
    });
    await expect(service.getPage(1)).resolves.toEqual({
      pageCount: 2,
      entries: [entries[EVENT_SITEMAP_URL_LIMIT]],
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: PUBLIC_EVENT_WHERE,
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'public:event-sitemap:v1',
      expect.any(String),
      'EX',
      7 * 24 * 60 * 60,
    );
  });

  it('serves a valid cached sitemap without querying the database', async () => {
    const { prisma, redis, service } = createContext();
    redis.get.mockResolvedValue(
      JSON.stringify([
        { id: '01980000-0000-7000-8000-000000000001', updatedAt: '2026-07-23T12:00:00.000Z' },
      ]),
    );

    await expect(service.getPage(0)).resolves.toEqual({
      pageCount: 1,
      entries: [
        {
          id: '01980000-0000-7000-8000-000000000001',
          updatedAt: new Date('2026-07-23T12:00:00.000Z'),
        },
      ],
    });
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });
});
