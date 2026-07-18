import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PublicPlatformStatsResolver } from './public-platform-stats.resolver';
import { PublicPlatformStatsService } from './public-platform-stats.service';

describe('PublicPlatformStatsService', () => {
  afterEach(() => jest.useRealTimers());

  const createContext = () => {
    const prisma = {
      people: { count: jest.fn() },
      event: { count: jest.fn() },
      majorEvent: { count: jest.fn() },
      certificate: { count: jest.fn() },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new PublicPlatformStatsService(
      prisma as unknown as PrismaService,
      redis as unknown as Redis,
      queue as unknown as Queue,
    );

    return { prisma, redis, queue, service };
  };

  it('returns cached aggregate stats without querying the database', async () => {
    const { prisma, redis, service } = createContext();
    redis.get.mockResolvedValue(
      JSON.stringify({ peopleCount: 11, eventsCount: 12, majorEventsCount: 13, certificatesCount: 14 }),
    );

    await expect(service.getPublicPlatformStats()).resolves.toEqual({
      peopleCount: 11,
      eventsCount: 12,
      majorEventsCount: 13,
      certificatesCount: 14,
    });

    expect(prisma.people.count).not.toHaveBeenCalled();
  });

  it('generates cache-miss stats from non-deleted rows older than two weeks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
    const { prisma, redis, service } = createContext();
    prisma.people.count.mockResolvedValue(10);
    prisma.event.count.mockResolvedValue(20);
    prisma.majorEvent.count.mockResolvedValue(3);
    prisma.certificate.count.mockResolvedValue(40);

    await expect(service.getPublicPlatformStats()).resolves.toEqual({
      peopleCount: 10,
      eventsCount: 20,
      majorEventsCount: 3,
      certificatesCount: 40,
    });

    const delayedCountWhere = {
      deletedAt: null,
      createdAt: { lte: new Date('2026-07-03T12:00:00.000Z') },
    };
    expect(prisma.people.count).toHaveBeenCalledWith({ where: delayedCountWhere });
    expect(prisma.event.count).toHaveBeenCalledWith({ where: delayedCountWhere });
    expect(prisma.majorEvent.count).toHaveBeenCalledWith({ where: delayedCountWhere });
    expect(prisma.certificate.count).toHaveBeenCalledWith({ where: delayedCountWhere });
    expect(redis.set).toHaveBeenCalledWith(
      'public:platform-stats:v2',
      JSON.stringify({ peopleCount: 10, eventsCount: 20, majorEventsCount: 3, certificatesCount: 40 }),
      'EX',
      172800,
    );
  });

  it('schedules a nightly refresh and exposes stats through GraphQL', async () => {
    const { queue, service } = createContext();
    const resolver = new PublicPlatformStatsResolver(service);
    const stats = { peopleCount: 1, eventsCount: 2, majorEventsCount: 3, certificatesCount: 4 };
    jest.spyOn(service, 'getPublicPlatformStats').mockResolvedValue(stats);

    await service.scheduleRefreshJob();

    expect(queue.add).toHaveBeenCalledWith(
      'refresh-public-platform-stats',
      {},
      expect.objectContaining({ jobId: 'public-platform-stats:nightly', repeat: { pattern: '0 3 * * *' } }),
    );
    await expect(resolver.publicPlatformStats()).resolves.toEqual(stats);
  });
});
