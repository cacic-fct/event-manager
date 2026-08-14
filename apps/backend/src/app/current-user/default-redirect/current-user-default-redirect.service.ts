import { Injectable, Logger } from '@nestjs/common';
import { SportsApplicationStatus, SportsTournamentStatus, SubscriptionStatus } from '@prisma/client';
import { addMinutes, subMinutes } from 'date-fns';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PUBLIC_EVENT_WHERE,
  PUBLIC_MAJOR_EVENT_WHERE,
  PUBLIC_REGULAR_EVENT_WHERE,
  publicRegularSubscriptionEventWhere,
} from '../../public-events/models';
import { DefaultRedirectRoute } from '../models';

const CACHE_TTL_SECONDS = 15 * 60;
const UPCOMING_MATCH_WINDOW_MINUTES = 45;
const RECENT_MATCH_WINDOW_MINUTES = 30;
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

  async invalidatePeople(personIds: readonly string[]): Promise<void> {
    const keys = [...new Set(personIds)].map((personId) => this.getCacheKey(personId));
    if (keys.length === 0) {
      return;
    }
    try {
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`Could not invalidate sports redirect cache: ${this.formatError(error)}`);
    }
  }

  private async resolveUncached(personId: string, now: Date): Promise<DefaultRedirectRoute> {
    const [hasUpcomingSportsMatch, hasPendingInPersonAttendance] = await Promise.all([
      this.hasUpcomingSportsMatch(personId, now),
      this.hasPendingInPersonAttendance(personId, now),
    ]);
    if (hasUpcomingSportsMatch || hasPendingInPersonAttendance) {
      return DefaultRedirectRoute.WALLET;
    }

    if (await this.hasOpenParticipationOpportunity(personId, now)) {
      return DefaultRedirectRoute.MAJOR_EVENT;
    }

    return (await this.hasCurrentOrFutureEvent(now)) ? DefaultRedirectRoute.CALENDAR : DefaultRedirectRoute.MENU;
  }

  private async hasUpcomingSportsMatch(personId: string, now: Date): Promise<boolean> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        deletedAt: null,
        state: {
          in: ['SCHEDULED', 'CHECK_IN', 'LIVE', 'PAUSED'],
        },
        event: {
          AND: [
            PUBLIC_EVENT_WHERE,
            {
              startDate: { lte: addMinutes(now, UPCOMING_MATCH_WINDOW_MINUTES) },
              endDate: { gte: subMinutes(now, RECENT_MATCH_WINDOW_MINUTES) },
            },
          ],
        },
        rosters: {
          some: {
            deletedAt: null,
            status: 'APPROVED',
            entries: {
              some: {
                deletedAt: null,
                status: 'APPROVED',
                registrationMember: {
                  deletedAt: null,
                  eligibility: 'ELIGIBLE',
                  teamMember: {
                    deletedAt: null,
                    participant: {
                      personId,
                      deletedAt: null,
                      status: 'ACTIVE',
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(match);
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
                status: 'PRESENT',
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return Boolean(event);
  }

  private async hasOpenParticipationOpportunity(personId: string, now: Date): Promise<boolean> {
    const [regularMajorEvent, sportsTournament] = await Promise.all([
      this.prisma.majorEvent.findFirst({
        where: {
          AND: [
            PUBLIC_MAJOR_EVENT_WHERE,
            { endDate: { gte: now } },
            { OR: [{ subscriptionStartDate: null }, { subscriptionStartDate: { lte: now } }] },
            { OR: [{ subscriptionEndDate: null }, { subscriptionEndDate: { gte: now } }] },
            {
              events: {
                some: publicRegularSubscriptionEventWhere(now),
              },
            },
            {
              subscriptions: {
                none: {
                  personId,
                  deletedAt: null,
                  subscriptionStatus: { not: SubscriptionStatus.CANCELED },
                  selectedEvents: {
                    some: {
                      deletedAt: null,
                      event: PUBLIC_REGULAR_EVENT_WHERE,
                    },
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      }),
      this.prisma.sportsTournament.findFirst({
        where: {
          deletedAt: null,
          finishedAt: null,
          status: SportsTournamentStatus.REGISTRATION_OPEN,
          selfSubscriptionEnabled: true,
          majorEvent: {
            ...PUBLIC_MAJOR_EVENT_WHERE,
            endDate: { gte: now },
          },
          AND: [
            {
              OR: [
                { registrationStartDate: { lte: now } },
                {
                  registrationStartDate: null,
                  majorEvent: {
                    OR: [{ subscriptionStartDate: null }, { subscriptionStartDate: { lte: now } }],
                  },
                },
              ],
            },
            {
              OR: [
                { registrationEndDate: { gte: now } },
                {
                  registrationEndDate: null,
                  majorEvent: {
                    OR: [{ subscriptionEndDate: null }, { subscriptionEndDate: { gte: now } }],
                  },
                },
              ],
            },
          ],
          participants: {
            none: {
              personId,
              deletedAt: null,
            },
          },
          playerApplications: {
            none: {
              applicantPersonId: personId,
              deletedAt: null,
              status: {
                in: [
                  SportsApplicationStatus.PENDING,
                  SportsApplicationStatus.APPROVED,
                  SportsApplicationStatus.CHANGES_REQUESTED,
                  SportsApplicationStatus.WAITING_PAYMENT,
                  SportsApplicationStatus.ACTIVE,
                ],
              },
            },
          },
        },
        select: { id: true },
      }),
    ]);

    return Boolean(regularMajorEvent || sportsTournament);
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
