import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE, PUBLIC_MAJOR_EVENT_WHERE } from '../../public-events/models';
import { DefaultRedirectRoute } from '../models';

const CACHE_TTL_SECONDS = 15 * 60;
const CACHE_KEY_PREFIX = 'current-user:default-redirect:v1';

@Injectable()
export class CurrentUserDefaultRedirectService {
  private readonly logger = new Logger(CurrentUserDefaultRedirectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
  ) {}

  async resolve(personId: string): Promise<DefaultRedirectRoute> {
    const cached = await this.getCachedRoute(personId);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const route = await this.resolveUncached(personId, now);
    await this.cacheRoute(personId, route);
    return route;
  }

  private async resolveUncached(personId: string, now: Date): Promise<DefaultRedirectRoute> {
    if (await this.hasPendingInPersonAttendance(personId, now)) {
      return DefaultRedirectRoute.WALLET;
    }

    if (await this.hasOpenUnsubscribedMajorEvent(personId, now)) {
      return DefaultRedirectRoute.MAJOR_EVENT;
    }

    return (await this.hasCurrentOrFutureEvent(now)) ? DefaultRedirectRoute.CALENDAR : DefaultRedirectRoute.MENU;
  }

  private async getCachedRoute(personId: string): Promise<DefaultRedirectRoute | null> {
    try {
      const cached = await this.redis.get(this.getCacheKey(personId));
      return isDefaultRedirectRoute(cached) ? cached : null;
    } catch (error) {
      this.logger.warn(`Could not read the current-user default redirect cache: ${this.formatError(error)}`);
      return null;
    }
  }

  private async cacheRoute(personId: string, route: DefaultRedirectRoute): Promise<void> {
    try {
      await this.redis.set(this.getCacheKey(personId), route, 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Could not cache the current-user default redirect: ${this.formatError(error)}`);
    }
  }

  private getCacheKey(personId: string): string {
    return `${CACHE_KEY_PREFIX}:${personId}`;
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async hasPendingInPersonAttendance(personId: string, now: Date): Promise<boolean> {
    const event = await this.prisma.event.findFirst({
      where: {
        AND: [
          PUBLIC_EVENT_WHERE,
          {
            shouldCollectAttendance: true,
            isOnlineAttendanceAllowed: false,
            startDate: { lte: now },
            endDate: { gte: now },
            subscriptions: {
              some: {
                personId,
                deletedAt: null,
              },
            },
            attendances: {
              none: {
                personId,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return Boolean(event);
  }

  private async hasOpenUnsubscribedMajorEvent(personId: string, now: Date): Promise<boolean> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        AND: [
          PUBLIC_MAJOR_EVENT_WHERE,
          { endDate: { gte: now } },
          {
            OR: [{ subscriptionStartDate: null }, { subscriptionStartDate: { lte: now } }],
          },
          {
            OR: [{ subscriptionEndDate: null }, { subscriptionEndDate: { gte: now } }],
          },
          {
            subscriptions: {
              none: {
                personId,
                deletedAt: null,
                subscriptionStatus: { not: SubscriptionStatus.CANCELED },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return Boolean(majorEvent);
  }

  private async hasCurrentOrFutureEvent(now: Date): Promise<boolean> {
    const event = await this.prisma.event.findFirst({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { endDate: { gte: now } }],
      },
      select: { id: true },
    });

    return Boolean(event);
  }
}

function isDefaultRedirectRoute(value: string | null): value is DefaultRedirectRoute {
  return Object.values(DefaultRedirectRoute).includes(value as DefaultRedirectRoute);
}
