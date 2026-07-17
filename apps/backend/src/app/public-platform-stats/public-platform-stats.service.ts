import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PublicPlatformStats } from './models';

export const PUBLIC_PLATFORM_STATS_QUEUE = 'public-platform-stats';
const CACHE_KEY = 'public:platform-stats:v2';
const CACHE_TTL_SECONDS = 48 * 60 * 60;
const PUBLIC_STATS_DELAY_DAYS = 14;

@Injectable()
export class PublicPlatformStatsService {
  private inFlightRefresh: Promise<PublicPlatformStats> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
    @InjectQueue(PUBLIC_PLATFORM_STATS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async getPublicPlatformStats(): Promise<PublicPlatformStats> {
    const cached = await this.getCachedStats();
    if (cached) {
      return cached;
    }

    return this.refreshPublicPlatformStats();
  }

  async refreshPublicPlatformStats(): Promise<PublicPlatformStats> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refresh = this.generateAndCacheStats();
    this.inFlightRefresh = refresh;

    try {
      return await refresh;
    } finally {
      this.inFlightRefresh = null;
    }
  }

  async scheduleRefreshJob(): Promise<void> {
    await this.queue.add(
      'refresh-public-platform-stats',
      {},
      {
        jobId: 'public-platform-stats:nightly',
        repeat: { pattern: '0 3 * * *' },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  private async getCachedStats(): Promise<PublicPlatformStats | null> {
    const cached = await this.redis.get(CACHE_KEY);
    if (!cached) {
      return null;
    }

    try {
      const parsed = JSON.parse(cached) as Partial<PublicPlatformStats>;
      if (
        !isCount(parsed.peopleCount) ||
        !isCount(parsed.eventsCount) ||
        !isCount(parsed.majorEventsCount) ||
        !isCount(parsed.certificatesCount)
      ) {
        return null;
      }

      return {
        peopleCount: parsed.peopleCount,
        eventsCount: parsed.eventsCount,
        majorEventsCount: parsed.majorEventsCount,
        certificatesCount: parsed.certificatesCount,
      };
    } catch {
      return null;
    }
  }

  private async generateAndCacheStats(): Promise<PublicPlatformStats> {
    const delayedUntil = new Date(Date.now() - PUBLIC_STATS_DELAY_DAYS * 24 * 60 * 60 * 1000);
    const countWhere = {
      deletedAt: null,
      createdAt: { lte: delayedUntil },
    };
    const [peopleCount, eventsCount, majorEventsCount, certificatesCount] = await Promise.all([
      this.prisma.people.count({ where: countWhere }),
      this.prisma.event.count({ where: countWhere }),
      this.prisma.majorEvent.count({ where: countWhere }),
      this.prisma.certificate.count({ where: countWhere }),
    ]);
    const stats = { peopleCount, eventsCount, majorEventsCount, certificatesCount };

    await this.redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL_SECONDS);
    return stats;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
