import { Permission } from '@cacic-fct/shared-permissions';
import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { actionablePendingMergeCandidateWhere } from '../people/merge-candidates/merge-candidate-filters';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
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
import { buildPublicationConsistencyWarnings } from '../publishing/publishing-consistency';
import { addDays, startOfDay, subDays } from 'date-fns';

export const DASHBOARD_INSIGHTS_QUEUE = 'dashboard-insights';
const DASHBOARD_INCONSISTENCY_LIMIT = 30;

@Injectable()
export class DashboardInsightsService {
  private readonly inFlightInsights = new Map<string, Promise<WorkspaceDashboardInsights>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly weatherService: WeatherService,
    private readonly redis: Redis,
    @InjectQueue(DASHBOARD_INSIGHTS_QUEUE)
    private readonly insightsQueue: Queue,
  ) {}

  async getWorkspaceDashboardInsights(context: GraphqlContext): Promise<WorkspaceDashboardInsights> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const permissionResolution = await resolveDashboardPermissions(this.authorizationPolicy, authenticatedUser);
    const permissions = permissionResolution.permissions;
    if (!permissionResolution.cacheable) {
      return this.generateInsights(permissions, {
        canReadGlobalInsights: permissionResolution.canReadGlobalInsights,
      });
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

  private async generateInsights(
    permissions: string[],
    options: { canReadGlobalInsights: boolean } = { canReadGlobalInsights: true },
  ): Promise<WorkspaceDashboardInsights> {
    const now = new Date();
    const today = startOfDay(now);
    const sevenDaysFromToday = addDays(today, 7);
    const tomorrow = addDays(today, 1);
    const inconsistencyWindowStart = subDays(now, 14);

    const grantedPermissionSet = new Set(permissions);
    if (grantedPermissionSet.size === 0) {
      throw new ForbiddenException('Workspace dashboard insights require an administrative permission.');
    }
    const permissionSet = options.canReadGlobalInsights ? grantedPermissionSet : new Set<string>();

    const canManageEvents =
      permissionSet.has(Permission.Event.Create) ||
      permissionSet.has(Permission.Event.Update) ||
      permissionSet.has(Permission.Event.Delete);
    const canReadEvents = permissionSet.has(Permission.Event.Read) || canManageEvents;
    const canManageMajorEvents =
      permissionSet.has(Permission.MajorEvent.Create) ||
      permissionSet.has(Permission.MajorEvent.Update) ||
      permissionSet.has(Permission.MajorEvent.Delete);
    const canReadMajorEvents = permissionSet.has(Permission.MajorEvent.Read) || canManageMajorEvents;
    const canManageCertificates =
      permissionSet.has(Permission.Certificate.Issue) ||
      permissionSet.has(Permission.Certificate.Reissue) ||
      permissionSet.has(Permission.CertificateConfig.Create) ||
      permissionSet.has(Permission.CertificateConfig.Update) ||
      permissionSet.has(Permission.CertificateConfig.Delete);
    const canManageMergeCandidates =
      permissionSet.has(Permission.MergeCandidate.Read) ||
      permissionSet.has(Permission.MergeCandidate.Merge) ||
      permissionSet.has(Permission.MergeCandidate.Update);
    const canValidateReceipts =
      permissionSet.has(Permission.Receipt.Read) ||
      permissionSet.has(Permission.Receipt.Approve) ||
      permissionSet.has(Permission.Receipt.Reject) ||
      permissionSet.has(Permission.Receipt.Undo);
    const canReviewOfflineAttendances = permissionSet.has(Permission.EventAttendance.Update);
    const shouldBuildEventInconsistencies = canManageEvents || canManageCertificates;
    const shouldBuildMajorEventInconsistencies = canManageMajorEvents;
    const shouldBuildInconsistencies = shouldBuildEventInconsistencies || shouldBuildMajorEventInconsistencies;

    const [
      eventsCount,
      eventGroupsCount,
      majorEventsCount,
      duplicatePeopleCount,
      pendingReceiptValidationsCount,
      pendingReceiptMajorEvents,
      pendingOfflineAttendancesCount,
      pendingOfflineAttendanceEvents,
      calendarEvents,
      upcomingMajorEventsCount,
      consistencyEvents,
      majorEventsWithSubscriptionDates,
      singleEventGroups,
      mismatchingCertificateGroupEvents,
      pastCertificateEventsWithoutAttendance,
      pastCertificateEventsWithoutAttendanceCollection,
      publicationMajorEvents,
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
      canReviewOfflineAttendances
        ? this.prisma.offlineEventAttendanceSubmission.count({
            where: {
              status: 'PENDING',
              event: {
                deletedAt: null,
              },
            },
          })
        : Promise.resolve(0),
      canReviewOfflineAttendances
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              offlineAttendanceSubmissions: {
                some: {
                  status: 'PENDING',
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
                  offlineAttendanceSubmissions: {
                    where: {
                      status: 'PENDING',
                    },
                  },
                },
              },
            },
            orderBy: { startDate: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      canReadEvents
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              startDate: {
                gte: today,
                lt: tomorrow,
              },
            },
            select: EVENT_INSIGHT_SELECT,
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
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
      shouldBuildEventInconsistencies
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
      shouldBuildMajorEventInconsistencies
        ? this.prisma.majorEvent.findMany({
            where: {
              deletedAt: null,
              endDate: { gte: now },
              OR: [{ subscriptionStartDate: { not: null } }, { subscriptionEndDate: { not: null } }],
            },
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              subscriptionStartDate: true,
              subscriptionEndDate: true,
            },
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      shouldBuildEventInconsistencies
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
      shouldBuildEventInconsistencies
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
      shouldBuildEventInconsistencies
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
      shouldBuildEventInconsistencies
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              endDate: { lt: now },
              shouldIssueCertificate: true,
              shouldCollectAttendance: false,
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
      shouldBuildMajorEventInconsistencies
        ? this.prisma.majorEvent.findMany({
            where: {
              deletedAt: null,
              OR: [
                {
                  publicationState: 'PUBLISHED',
                  events: {
                    none: {
                      deletedAt: null,
                      publicationState: 'PUBLISHED',
                      publiclyVisible: true,
                    },
                  },
                },
                {
                  publicationState: 'SCHEDULED',
                  scheduledPublishAt: { lte: now },
                },
              ],
            },
            select: {
              id: true,
              name: true,
              publicationState: true,
              scheduledPublishAt: true,
              events: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  publiclyVisible: true,
                  publicationState: true,
                },
              },
            },
            orderBy: { startDate: 'asc' },
            take: DASHBOARD_INCONSISTENCY_LIMIT,
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
      pendingOfflineAttendancesCount: canReviewOfflineAttendances ? pendingOfflineAttendancesCount : 0,
      pendingOfflineAttendanceEvents: canReviewOfflineAttendances
        ? pendingOfflineAttendanceEvents.map((event) => ({
            eventId: event.id,
            name: event.name,
            emoji: event.emoji,
            startDate: event.startDate,
            endDate: event.endDate,
            pendingCount: event._count.offlineAttendanceSubmissions,
          }))
        : [],
      inconsistencies: shouldBuildInconsistencies
        ? [
            ...buildInconsistencies({
              now,
              events: consistencyEvents,
              majorEventsWithSubscriptionDates,
              singleEventGroups,
              mismatchingCertificateGroupEvents,
              pastCertificateEventsWithoutAttendance,
              pastCertificateEventsWithoutAttendanceCollection,
            }),
            ...buildPublicationConsistencyWarnings({
              now,
              events: consistencyEvents,
              majorEvents: publicationMajorEvents,
            }),
          ].slice(0, DASHBOARD_INCONSISTENCY_LIMIT)
        : [],
      duplicatePeopleCount: canManageMergeCandidates ? duplicatePeopleCount : 0,
      permissions: formatPermissions(permissions),
    };
  }
}
