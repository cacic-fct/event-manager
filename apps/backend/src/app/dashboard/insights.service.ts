import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { actionablePendingMergeCandidateWhere } from '../people/merge-candidates/merge-candidate-filters';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { WorkspaceDashboardInsights } from './models';
import { getCachedInsights, getCacheKey } from './insights/cache';
import { CACHE_TTL_SECONDS } from './insights/constants';
import { EVENT_INSIGHT_SELECT } from './insights/insight-event.select';
import { mapCalendarEvent } from './insights/calendar';
import { buildInconsistencies } from './insights/inconsistencies';
import { formatPermissions, resolveDashboardPermissions } from './insights/permissions';
import { buildPendingCertificates } from './insights/pending-certificates';
import { buildSuggestions } from './insights/suggestions';
import { buildWeatherAlerts } from './insights/weather-alerts';

export const DASHBOARD_INSIGHTS_QUEUE = 'dashboard-insights';

@Injectable()
export class DashboardInsightsService {
  private readonly inFlightInsights = new Map<string, Promise<WorkspaceDashboardInsights>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly weatherService: WeatherService,
    private readonly redis: Redis,
    @InjectQueue(DASHBOARD_INSIGHTS_QUEUE)
    private readonly insightsQueue: Queue,
  ) {}

  async getWorkspaceDashboardInsights(context: GraphqlContext): Promise<WorkspaceDashboardInsights> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const permissionResolution = await resolveDashboardPermissions(this.keycloakAuthService, authenticatedUser);
    const permissions = permissionResolution.permissions;
    if (!permissionResolution.cacheable) {
      return this.generateInsights(permissions);
    }

    const cacheKey = getCacheKey(permissions);
    const cached = await getCachedInsights(this.redis, cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.inFlightInsights.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const generation = this.generateAndCacheInsights(cacheKey, permissions);
    this.inFlightInsights.set(cacheKey, generation);

    try {
      return await generation;
    } finally {
      this.inFlightInsights.delete(cacheKey);
    }
  }

  async scheduleRefreshJobs(): Promise<void> {
    await this.insightsQueue.add(
      'refresh-realtime-dashboard-insights',
      { scope: 'realtime' },
      {
        jobId: 'dashboard-insights:realtime',
        repeat: { pattern: '*/5 * * * *' },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    await this.insightsQueue.add(
      'refresh-operational-dashboard-insights',
      { scope: 'operational' },
      {
        jobId: 'dashboard-insights:operational',
        repeat: { pattern: '*/30 * * * *' },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async invalidateCachedInsights(): Promise<void> {
    const stream = this.redis.scanStream({
      match: 'dashboard:workspace:*',
      count: 100,
    });
    const batches: Promise<number>[] = [];

    for await (const keys of stream) {
      const cacheKeys = keys as string[];
      if (cacheKeys.length > 0) {
        batches.push(this.redis.del(...cacheKeys));
      }
    }

    await Promise.all(batches);
  }

  private async generateAndCacheInsights(cacheKey: string, permissions: string[]): Promise<WorkspaceDashboardInsights> {
    const insights = await this.generateInsights(permissions);
    await this.redis.set(cacheKey, JSON.stringify(insights), 'EX', CACHE_TTL_SECONDS);
    return insights;
  }

  private async generateInsights(permissions: string[]): Promise<WorkspaceDashboardInsights> {
    const now = new Date();
    const today = startOfLocalDay(now);
    const sevenDaysFromToday = new Date(today);
    sevenDaysFromToday.setDate(sevenDaysFromToday.getDate() + 7);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const inconsistencyWindowStart = new Date(now);
    inconsistencyWindowStart.setDate(inconsistencyWindowStart.getDate() - 14);

    const permissionSet = new Set(permissions);
    if (permissionSet.size === 0) {
      throw new ForbiddenException('Workspace dashboard insights require an administrative permission.');
    }

    const canReadEvents = permissionSet.has('event#read') || permissionSet.has('event#edit');
    const canManageEvents = permissionSet.has('event#edit');
    const canReadMajorEvents = permissionSet.has('major-event#read') || permissionSet.has('major-event#edit');
    const canManageMajorEvents = permissionSet.has('major-event#edit');
    const canManageCertificates = permissionSet.has('certificate#edit');
    const canManageMergeCandidates = permissionSet.has('merge-candidate#read');
    const canValidateReceipts =
      permissionSet.has('validate-receipt#read') || permissionSet.has('validate-receipt#edit');
    const shouldBuildInconsistencies = canManageEvents || canManageCertificates;

    const [
      eventsCount,
      eventGroupsCount,
      majorEventsCount,
      duplicatePeopleCount,
      pendingReceiptValidationsCount,
      pendingReceiptMajorEvents,
      calendarEvents,
      upcomingMajorEventsCount,
      consistencyEvents,
      singleEventGroups,
      mismatchingCertificateGroupEvents,
      pastCertificateEventsWithoutAttendance,
    ] = await Promise.all([
      canReadEvents ? this.prisma.event.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      canReadEvents ? this.prisma.eventGroup.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      canReadMajorEvents ? this.prisma.majorEvent.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      canManageMergeCandidates
        ? this.prisma.mergeCandidate.count({
            where: actionablePendingMergeCandidateWhere,
          })
        : Promise.resolve(0),
      canValidateReceipts
        ? this.prisma.majorEventSubscription.count({
            where: {
              deletedAt: null,
              subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
              majorEvent: {
                deletedAt: null,
                isPaymentRequired: true,
              },
            },
          })
        : Promise.resolve(0),
      canValidateReceipts
        ? this.prisma.majorEvent.findMany({
            where: {
              deletedAt: null,
              isPaymentRequired: true,
              subscriptions: {
                some: {
                  deletedAt: null,
                  subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
                },
              },
            },
            select: {
              id: true,
              name: true,
              emoji: true,
              startDate: true,
              endDate: true,
              _count: {
                select: {
                  subscriptions: {
                    where: {
                      deletedAt: null,
                      subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
                    },
                  },
                },
              },
            },
            orderBy: { startDate: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      this.prisma.event.findMany({
        where: {
          deletedAt: null,
          startDate: {
            gte: today,
            lt: tomorrow,
          },
        },
        select: EVENT_INSIGHT_SELECT,
        orderBy: { startDate: 'asc' },
      }),
      canManageMajorEvents
        ? this.prisma.majorEvent.count({
            where: {
              deletedAt: null,
              startDate: {
                gte: today,
                lt: sevenDaysFromToday,
              },
            },
          })
        : Promise.resolve(0),
      shouldBuildInconsistencies
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              OR: [
                {
                  startDate: {
                    gte: inconsistencyWindowStart,
                  },
                },
                {
                  endDate: {
                    gte: inconsistencyWindowStart,
                  },
                },
              ],
            },
            select: EVENT_INSIGHT_SELECT,
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      shouldBuildInconsistencies
        ? this.prisma.eventGroup.findMany({
            where: {
              deletedAt: null,
              events: {
                some: { deletedAt: null },
              },
            },
            select: {
              id: true,
              name: true,
              events: {
                where: { deletedAt: null },
                select: { id: true },
                take: 2,
              },
            },
            orderBy: { updatedAt: 'desc' },
            take: 30,
          })
        : Promise.resolve([]),
      shouldBuildInconsistencies
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              eventGroup: {
                deletedAt: null,
              },
            },
            select: {
              id: true,
              name: true,
              shouldIssueCertificate: true,
              eventGroup: {
                select: {
                  id: true,
                  name: true,
                  shouldIssueCertificate: true,
                },
              },
            },
            orderBy: { startDate: 'desc' },
            take: 30,
          })
        : Promise.resolve([]),
      shouldBuildInconsistencies
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              endDate: { lt: now },
              shouldIssueCertificate: true,
              attendances: { none: {} },
              OR: [
                { majorEventId: null },
                {
                  majorEvent: {
                    deletedAt: null,
                    certificateConfigs: {
                      some: {
                        deletedAt: null,
                        isActive: true,
                        issuedTo: 'ATTENDEE',
                      },
                    },
                  },
                },
                {
                  eventGroup: {
                    deletedAt: null,
                    certificateConfigs: {
                      some: {
                        deletedAt: null,
                        isActive: true,
                        issuedTo: 'ATTENDEE',
                      },
                    },
                  },
                },
                {
                  certificateConfigs: {
                    some: {
                      deletedAt: null,
                      isActive: true,
                      issuedTo: 'ATTENDEE',
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              name: true,
            },
            orderBy: { endDate: 'desc' },
            take: 30,
          })
        : Promise.resolve([]),
    ]);

    return {
      generatedAt: now,
      summary: {
        eventsCount,
        eventGroupsCount,
        majorEventsCount,
      },
      suggestions: buildSuggestions({
        upcomingActivitiesCount: calendarEvents.length + upcomingMajorEventsCount,
        canManageEvents,
        canManageMajorEvents,
      }),
      calendarEvents: calendarEvents.map((event) => mapCalendarEvent(event, now)),
      weatherAlerts: await buildWeatherAlerts(this.weatherService, calendarEvents),
      pendingCertificates: canManageCertificates ? await buildPendingCertificates(this.prisma, now) : [],
      pendingReceiptValidationsCount: canValidateReceipts ? pendingReceiptValidationsCount : 0,
      pendingReceiptMajorEvents: canValidateReceipts
        ? pendingReceiptMajorEvents.map((majorEvent) => ({
            majorEventId: majorEvent.id,
            name: majorEvent.name,
            emoji: majorEvent.emoji,
            startDate: majorEvent.startDate,
            endDate: majorEvent.endDate,
            pendingCount: majorEvent._count.subscriptions,
          }))
        : [],
      inconsistencies:
        canManageEvents || canManageCertificates
          ? buildInconsistencies({
              events: consistencyEvents,
              singleEventGroups,
              mismatchingCertificateGroupEvents,
              pastCertificateEventsWithoutAttendance,
            })
          : [],
      duplicatePeopleCount: canManageMergeCandidates ? duplicatePeopleCount : 0,
      permissions: formatPermissions(permissions),
    };
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
