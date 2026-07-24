import { BadRequestException, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from './models';
import { PublicEventSitemapEntry, PublicEventSitemapPage } from './event-sitemap.models';

export const EVENT_SITEMAP_URL_LIMIT = 50_000;
const CACHE_KEY = 'public:event-sitemap:v1';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

type CachedSitemapEntry = {
  id: string;
  updatedAt: string;
};

@Injectable()
export class EventSitemapService {
  private inFlightRefresh: Promise<PublicEventSitemapEntry[]> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
  ) {}

  async getPage(page: number): Promise<PublicEventSitemapPage> {
    if (!Number.isSafeInteger(page) || page < 0) {
      throw new BadRequestException('Sitemap page must be a non-negative integer.');
    }

    const entries = await this.getEntries();
    return {
      entries: entries.slice(page * EVENT_SITEMAP_URL_LIMIT, (page + 1) * EVENT_SITEMAP_URL_LIMIT),
      pageCount: Math.ceil(entries.length / EVENT_SITEMAP_URL_LIMIT),
    };
  }

  async refresh(): Promise<PublicEventSitemapEntry[]> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refresh = this.generateAndCacheEntries();
    this.inFlightRefresh = refresh;

    try {
      return await refresh;
    } finally {
      this.inFlightRefresh = null;
    }
  }

  private async getEntries(): Promise<PublicEventSitemapEntry[]> {
    const cached = await this.getCachedEntries();
    return cached ?? this.refresh();
  }

  private async getCachedEntries(): Promise<PublicEventSitemapEntry[] | null> {
    const cached = await this.redis.get(CACHE_KEY);
    if (!cached) {
      return null;
    }

    try {
      const parsed = JSON.parse(cached);
      if (!Array.isArray(parsed) || !parsed.every(isCachedSitemapEntry)) {
        return null;
      }

      return parsed.map(({ id, updatedAt }) => ({ id, updatedAt: new Date(updatedAt) }));
    } catch {
      return null;
    }
  }

  private async generateAndCacheEntries(): Promise<PublicEventSitemapEntry[]> {
    const entries = await this.prisma.event.findMany({
      where: PUBLIC_EVENT_WHERE,
      select: {
        id: true,
        updatedAt: true,
      },
      // UUIDv7 values are time-sortable, so this gives each page a stable boundary.
      orderBy: {
        id: 'asc',
      },
    });
    const serialized: CachedSitemapEntry[] = entries.map(({ id, updatedAt }) => ({
      id,
      updatedAt: updatedAt.toISOString(),
    }));

    await this.redis.set(CACHE_KEY, JSON.stringify(serialized), 'EX', CACHE_TTL_SECONDS);
    return entries;
  }
}

function isCachedSitemapEntry(value: unknown): value is CachedSitemapEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<CachedSitemapEntry>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.updatedAt))
  );
}
