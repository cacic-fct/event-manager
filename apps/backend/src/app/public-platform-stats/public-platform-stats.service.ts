import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PublicPlatformStats } from './models';

export const PUBLIC_PLATFORM_STATS_QUEUE = 'public-platform-stats';
const CACHE_KEY = 'public:platform-stats:v3';
const CACHE_TTL_SECONDS = 48 * 60 * 60;
const PUBLIC_STATS_DELAY_DAYS = 14;
const TIME_ZONE = 'America/Sao_Paulo';

type CachedPublicPlatformStats = PublicPlatformStats & {
  generatedAt: string;
};

@Injectable()
export class PublicPlatformStatsService {
  private inFlightRefresh: Promise<PublicPlatformStats> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
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

  private async getCachedStats(): Promise<PublicPlatformStats | null> {
    const cached = await this.redis.get(CACHE_KEY);
    if (!cached) {
      return null;
    }

    try {
      const parsed = JSON.parse(cached) as Partial<CachedPublicPlatformStats>;
      if (
        !isCount(parsed.peopleCount) ||
        !isCount(parsed.eventsCount) ||
        !isCount(parsed.majorEventsCount) ||
        !isCount(parsed.certificatesCount) ||
        typeof parsed.generatedAt !== 'string' ||
        !isCurrentSaoPauloDay(parsed.generatedAt)
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
    const generatedAt = new Date();
    const delayedUntil = new Date(generatedAt.getTime() - PUBLIC_STATS_DELAY_DAYS * 24 * 60 * 60 * 1000);
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

    await this.redis.set(CACHE_KEY, JSON.stringify({ ...stats, generatedAt: generatedAt.toISOString() }), 'EX', CACHE_TTL_SECONDS);
    return stats;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCurrentSaoPauloDay(value: string): boolean {
  const generatedAt = new Date(value);
  return Number.isFinite(generatedAt.getTime()) && formatSaoPauloDate(generatedAt) === formatSaoPauloDate(new Date());
}

function formatSaoPauloDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
