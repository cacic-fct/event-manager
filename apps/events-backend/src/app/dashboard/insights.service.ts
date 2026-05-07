import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import {
  DashboardActionLink,
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardInconsistency,
  DashboardPermissionGroup,
  DashboardWeatherAlert,
  WorkspaceDashboardInsights,
} from './models';

export const DASHBOARD_INSIGHTS_QUEUE = 'dashboard-insights';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX = 'dashboard:workspace:v2';
const DEFAULT_EMOJI = '❔';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const SUSPICIOUS_EARLIEST_DATE = new Date('2010-01-01T00:00:00.000Z');
const UNFAVORABLE_WEATHER_CODES = new Set([
  51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99,
]);
const DASHBOARD_PERMISSION_REQUIREMENTS = [
  'event#edit',
  'major-event#edit',
  'certificate#edit',
  'merge-candidate#read',
] as const;

const EVENT_INSIGHT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  startDate: true,
  endDate: true,
  locationDescription: true,
  latitude: true,
  longitude: true,
  majorEventId: true,
  majorEvent: {
    select: {
      id: true,
      name: true,
      certificateConfigs: {
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      },
    },
  },
  eventGroupId: true,
  eventGroup: {
    select: {
      id: true,
      name: true,
      shouldIssueCertificate: true,
      certificateConfigs: {
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      },
    },
  },
  shouldCollectAttendance: true,
  shouldIssueCertificate: true,
  certificateConfigs: {
    where: { deletedAt: null, isActive: true },
    select: { id: true },
  },
  lecturers: {
    select: {
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  subscriptions: {
    where: { deletedAt: null },
    select: { personId: true },
  },
  attendances: {
    select: { personId: true },
  },
  _count: {
    select: {
      attendances: true,
      subscriptions: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EventSelect;

type InsightEvent = Prisma.EventGetPayload<{
  select: typeof EVENT_INSIGHT_SELECT;
}>;

type CachedDashboardInsights = Omit<
  WorkspaceDashboardInsights,
  'generatedAt'
> & {
  generatedAt: string;
  calendarEvents: (Omit<DashboardCalendarEvent, 'startDate' | 'endDate'> & {
    startDate: string;
    endDate: string;
  })[];
  weatherAlerts: (Omit<DashboardWeatherAlert, 'forecastTime'> & {
    forecastTime: string;
  })[];
  pendingCertificates: (Omit<DashboardCertificatePendingItem, 'finishedAt'> & {
    finishedAt: string;
  })[];
};

@Injectable()
export class DashboardInsightsService {
  private readonly inFlightInsights = new Map<
    string,
    Promise<WorkspaceDashboardInsights>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly weatherService: WeatherService,
    private readonly redis: Redis,
    @InjectQueue(DASHBOARD_INSIGHTS_QUEUE)
    private readonly insightsQueue: Queue,
  ) {}

  async getWorkspaceDashboardInsights(
    context: GraphqlContext,
  ): Promise<WorkspaceDashboardInsights> {
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const permissionResolution =
      await this.resolveDashboardPermissions(authenticatedUser);
    const permissions = permissionResolution.permissions;
    if (!permissionResolution.cacheable) {
      return this.generateInsights(permissions);
    }

    const cacheKey = this.getCacheKey(permissions);
    const cached = await this.getCachedInsights(cacheKey);
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

  private async generateAndCacheInsights(
    cacheKey: string,
    permissions: string[],
  ): Promise<WorkspaceDashboardInsights> {
    const insights = await this.generateInsights(permissions);
    await this.redis.set(
      cacheKey,
      JSON.stringify(insights),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return insights;
  }

  private async resolveDashboardPermissions(
    authenticatedUser: AuthenticatedUser,
  ): Promise<{
    permissions: string[];
    cacheable: boolean;
  }> {
    const permissions = new Set(authenticatedUser.permissionSet);

    try {
      const grantedPermissions =
        await this.keycloakAuthService.evaluateAccessTokenPermissions(
          authenticatedUser.token,
          [...DASHBOARD_PERMISSION_REQUIREMENTS],
        );
      for (const permission of grantedPermissions) {
        permissions.add(permission);
      }
      return {
        permissions: [...permissions].sort(),
        cacheable: true,
      };
    } catch {
      // Dashboard calendar is permission-independent. If UMA evaluation is
      // temporarily unavailable, keep serving the non-personalized insights
      // instead of failing or caching a request-order dependent permission set.
      return {
        permissions: [...permissions].sort(),
        cacheable: false,
      };
    }
  }

  private async generateInsights(
    permissions: string[],
  ): Promise<WorkspaceDashboardInsights> {
    const now = new Date();
    const today = this.startOfLocalDay(now);
    const sevenDaysFromToday = new Date(today);
    sevenDaysFromToday.setDate(sevenDaysFromToday.getDate() + 7);
    const inconsistencyWindowStart = new Date(now);
    inconsistencyWindowStart.setDate(inconsistencyWindowStart.getDate() - 14);

    const [
      eventsCount,
      eventGroupsCount,
      majorEventsCount,
      duplicatePeopleCount,
      calendarEvents,
      consistencyEvents,
    ] = await Promise.all([
      this.prisma.event.count({ where: { deletedAt: null } }),
      this.prisma.eventGroup.count({ where: { deletedAt: null } }),
      this.prisma.majorEvent.count({ where: { deletedAt: null } }),
      this.prisma.mergeCandidate.count({ where: { status: 'PENDING' } }),
      this.prisma.event.findMany({
        where: {
          deletedAt: null,
          startDate: {
            gte: today,
            lt: sevenDaysFromToday,
          },
        },
        select: EVENT_INSIGHT_SELECT,
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.event.findMany({
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
      }),
    ]);

    const permissionSet = new Set(permissions);
    const canManageEvents = permissionSet.has('event#edit');
    const canManageMajorEvents = permissionSet.has('major-event#edit');
    const canManageCertificates = permissionSet.has('certificate#edit');
    const canManageMergeCandidates = permissionSet.has('merge-candidate#read');

    return {
      generatedAt: now,
      summary: {
        eventsCount,
        eventGroupsCount,
        majorEventsCount,
      },
      suggestions: this.buildSuggestions({
        eventsCount,
        majorEventsCount,
        canManageEvents,
        canManageMajorEvents,
      }),
      calendarEvents: calendarEvents.map((event) =>
        this.mapCalendarEvent(event, now),
      ),
      weatherAlerts: await this.buildWeatherAlerts(calendarEvents),
      pendingCertificates: canManageCertificates
        ? await this.buildPendingCertificates(now)
        : [],
      inconsistencies:
        canManageEvents || canManageCertificates
          ? this.buildInconsistencies(consistencyEvents)
          : [],
      duplicatePeopleCount: canManageMergeCandidates ? duplicatePeopleCount : 0,
      permissions: this.formatPermissions(permissions),
    };
  }

  private buildSuggestions(input: {
    eventsCount: number;
    majorEventsCount: number;
    canManageEvents: boolean;
    canManageMajorEvents: boolean;
  }): DashboardActionLink[] {
    if (input.eventsCount > 0 || input.majorEventsCount > 0) {
      return [];
    }

    const suggestions: DashboardActionLink[] = [];
    if (input.canManageEvents) {
      suggestions.push(
        {
          action: 'CREATE_EVENT_GROUP',
          label: 'Criar grupo de eventos',
        },
        {
          action: 'CREATE_EVENT',
          label: 'Criar evento',
        },
      );
    }
    if (input.canManageMajorEvents) {
      suggestions.push({
        action: 'CREATE_MAJOR_EVENT',
        label: 'Criar grande evento',
      });
    }

    return suggestions;
  }

  private mapCalendarEvent(
    event: InsightEvent,
    now: Date,
  ): DashboardCalendarEvent {
    return {
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      locationDescription: event.locationDescription,
      majorEventName: event.majorEvent?.name ?? null,
      eventGroupName: event.eventGroup?.name ?? null,
      attendancesCount: event._count.attendances,
      subscriptionsCount: event._count.subscriptions,
      shouldCollectAttendance: event.shouldCollectAttendance,
      canCollectAttendanceNow:
        event.shouldCollectAttendance &&
        event.startDate.getTime() <= now.getTime() + TWO_HOURS_MS &&
        event.endDate.getTime() >= now.getTime() - TWO_HOURS_MS,
    };
  }

  private async buildWeatherAlerts(
    events: InsightEvent[],
  ): Promise<DashboardWeatherAlert[]> {
    const weatherEvents = events.filter(
      (event) =>
        event.latitude != null &&
        event.longitude != null &&
        event.startDate.getTime() > Date.now(),
    );

    const forecasts = await Promise.all(
      weatherEvents.map(async (event) => {
        try {
          const forecast = await this.weatherService.getPublicEventWeather(
            event.id,
          );
          if (
            !forecast ||
            !UNFAVORABLE_WEATHER_CODES.has(forecast.weatherCode)
          ) {
            return null;
          }

          return {
            eventId: event.id,
            eventName: event.name,
            summary: forecast.summary,
            materialIcon: forecast.materialIcon,
            forecastTime: forecast.forecastTime,
            temperature: forecast.temperature,
          };
        } catch {
          return null;
        }
      }),
    );

    return forecasts.filter((forecast) => forecast != null);
  }

  private async buildPendingCertificates(
    now: Date,
  ): Promise<DashboardCertificatePendingItem[]> {
    const [events, eventGroups, majorEvents, majorEventsWithLecturers] =
      await Promise.all([
        this.prisma.event.findMany({
          where: {
            deletedAt: null,
            endDate: { lt: now },
            majorEventId: null,
            OR: [
              { shouldIssueCertificate: true },
              {
                certificateConfigs: {
                  some: { deletedAt: null, isActive: true },
                },
              },
            ],
          },
          select: {
            id: true,
            name: true,
            endDate: true,
            eventGroup: {
              select: {
                shouldIssueCertificate: true,
                certificateConfigs: {
                  where: { deletedAt: null, isActive: true },
                  select: { id: true },
                },
              },
            },
            certificateConfigs: {
              where: { deletedAt: null, isActive: true },
              select: {
                id: true,
                certificates: {
                  where: { deletedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { endDate: 'desc' },
          take: 20,
        }),
        this.prisma.eventGroup.findMany({
          where: {
            deletedAt: null,
            OR: [
              { shouldIssueCertificate: true },
              {
                certificateConfigs: {
                  some: { deletedAt: null, isActive: true },
                },
              },
            ],
            events: {
              some: { deletedAt: null, endDate: { lt: now } },
              every: {
                OR: [{ majorEventId: null }, { deletedAt: { not: null } }],
              },
            },
          },
          select: {
            id: true,
            name: true,
            shouldIssueCertificate: true,
            events: {
              where: { deletedAt: null },
              select: { endDate: true },
              orderBy: { endDate: 'desc' },
              take: 1,
            },
            certificateConfigs: {
              where: { deletedAt: null, isActive: true },
              select: {
                id: true,
                certificates: {
                  where: { deletedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
          take: 20,
        }),
        this.prisma.majorEvent.findMany({
          where: {
            deletedAt: null,
            endDate: { lt: now },
            certificateConfigs: { some: { deletedAt: null, isActive: true } },
          },
          select: {
            id: true,
            name: true,
            endDate: true,
            certificateConfigs: {
              where: { deletedAt: null, isActive: true },
              select: {
                id: true,
                certificates: {
                  where: { deletedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { endDate: 'desc' },
          take: 20,
        }),
        this.prisma.majorEvent.findMany({
          where: {
            deletedAt: null,
            endDate: { lt: now },
            events: {
              some: {
                deletedAt: null,
                lecturers: { some: {} },
              },
            },
            certificateConfigs: {
              some: {
                deletedAt: null,
                isActive: true,
                issuedTo: 'LECTURER',
              },
            },
          },
          select: {
            id: true,
            name: true,
            endDate: true,
            certificateConfigs: {
              where: {
                deletedAt: null,
                isActive: true,
                issuedTo: 'LECTURER',
              },
              select: {
                id: true,
                certificates: {
                  where: { deletedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { endDate: 'desc' },
          take: 20,
        }),
      ]);

    const pending: DashboardCertificatePendingItem[] = [];
    for (const event of events) {
      const groupIssuesCertificate =
        event.eventGroup?.shouldIssueCertificate ||
        Boolean(event.eventGroup?.certificateConfigs.length);
      if (
        !groupIssuesCertificate &&
        this.hasMissingCertificatesOrConfig(event)
      ) {
        pending.push({
          targetType: 'EVENT',
          targetId: event.id,
          title: event.name,
          subtitle: 'Evento finalizado sem certificados emitidos.',
          finishedAt: event.endDate,
        });
      }
    }

    for (const group of eventGroups) {
      if (this.hasMissingCertificatesOrConfig(group) && group.events[0]) {
        pending.push({
          targetType: 'EVENT_GROUP',
          targetId: group.id,
          title: group.name,
          subtitle: 'Grupo finalizado sem certificados emitidos.',
          finishedAt: group.events[0].endDate,
        });
      }
    }

    for (const majorEvent of majorEvents) {
      if (this.hasConfigWithoutCertificate(majorEvent)) {
        pending.push({
          targetType: 'MAJOR_EVENT',
          targetId: majorEvent.id,
          title: majorEvent.name,
          subtitle: 'Grande evento finalizado sem certificados emitidos.',
          finishedAt: majorEvent.endDate,
        });
      }
    }

    for (const majorEvent of majorEventsWithLecturers) {
      if (this.hasConfigWithoutCertificate(majorEvent)) {
        pending.push({
          targetType: 'MAJOR_EVENT_LECTURERS',
          targetId: majorEvent.id,
          title: majorEvent.name,
          subtitle:
            'Há palestrantes cadastrados no grande evento sem certificados emitidos.',
          finishedAt: majorEvent.endDate,
        });
      }
    }

    return pending
      .sort(
        (left, right) => right.finishedAt.getTime() - left.finishedAt.getTime(),
      )
      .slice(0, 12);
  }

  private hasConfigWithoutCertificate(target: {
    certificateConfigs: { certificates: { id: string }[] }[];
  }): boolean {
    return target.certificateConfigs.some(
      (config) => config.certificates.length === 0,
    );
  }

  private hasMissingCertificatesOrConfig(target: {
    shouldIssueCertificate?: boolean;
    certificateConfigs: { certificates: { id: string }[] }[];
  }): boolean {
    return (
      (target.shouldIssueCertificate &&
        target.certificateConfigs.length === 0) ||
      this.hasConfigWithoutCertificate(target)
    );
  }

  private buildInconsistencies(
    events: InsightEvent[],
  ): DashboardInconsistency[] {
    const inconsistencies: DashboardInconsistency[] = [];
    const eventsByLecturer = new Map<string, InsightEvent[]>();

    for (const event of events) {
      if (event.lecturers.length === 0) {
        inconsistencies.push({
          type: 'EVENT_WITHOUT_LECTURER',
          severity: 'WARNING',
          title: 'Evento sem palestrante cadastrado',
          description: event.name,
          eventId: event.id,
        });
      }

      if (
        event.endDate.getTime() - event.startDate.getTime() >
        EIGHT_HOURS_MS
      ) {
        inconsistencies.push({
          type: 'SUSPICIOUS_DURATION',
          severity: 'WARNING',
          title: 'Evento com duração suspeita',
          description: `${event.name} tem mais de 8 horas de duração.`,
          eventId: event.id,
        });
      }

      if (event.startDate < SUSPICIOUS_EARLIEST_DATE) {
        inconsistencies.push({
          type: 'SUSPICIOUS_DATE',
          severity: 'CRITICAL',
          title: 'Evento com data suspeita',
          description: `${event.name} está cadastrado antes de 2010.`,
          eventId: event.id,
        });
      }

      if (event.emoji === DEFAULT_EMOJI) {
        inconsistencies.push({
          type: 'PLACEHOLDER_EMOJI',
          severity: 'INFO',
          title: 'Evento com emoji padrão',
          description: `${event.name} ainda usa o emoji placeholder.`,
          eventId: event.id,
        });
      }

      const lecturerIds = new Set(
        event.lecturers.map((lecturer) => lecturer.personId),
      );
      for (const subscription of event.subscriptions) {
        if (lecturerIds.has(subscription.personId)) {
          inconsistencies.push({
            type: 'LECTURER_SELF_SUBSCRIBED',
            severity: 'WARNING',
            title: 'Palestrante inscrito no próprio evento',
            description: event.name,
            eventId: event.id,
            personId: subscription.personId,
          });
        }
      }
      for (const attendance of event.attendances) {
        if (lecturerIds.has(attendance.personId)) {
          inconsistencies.push({
            type: 'LECTURER_SELF_ATTENDED',
            severity: 'WARNING',
            title: 'Palestrante com presença no próprio evento',
            description: event.name,
            eventId: event.id,
            personId: attendance.personId,
          });
        }
      }

      for (const lecturer of event.lecturers) {
        const lecturerEvents = eventsByLecturer.get(lecturer.personId) ?? [];
        lecturerEvents.push(event);
        eventsByLecturer.set(lecturer.personId, lecturerEvents);
      }
    }

    for (const lecturerEvents of eventsByLecturer.values()) {
      for (let leftIndex = 0; leftIndex < lecturerEvents.length; leftIndex++) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < lecturerEvents.length;
          rightIndex++
        ) {
          const left = lecturerEvents[leftIndex];
          const right = lecturerEvents[rightIndex];
          if (
            left.startDate < right.endDate &&
            right.startDate < left.endDate
          ) {
            inconsistencies.push({
              type: 'LECTURER_DOUBLE_BOOKED',
              severity: 'CRITICAL',
              title: 'O palestrante está alocado em dois eventos simultâneos.',
              description: `${left.name} e ${right.name}`,
              eventId: left.id,
              relatedEventId: right.id,
            });
          }
        }
      }
    }

    return inconsistencies.slice(0, 30);
  }

  private formatPermissions(permissions: string[]): DashboardPermissionGroup[] {
    const groupedPermissions = new Map<string, DashboardPermissionGroup>();

    for (const permission of permissions) {
      const [resource, action = 'unknown'] = permission.split('#');
      if (!groupedPermissions.has(resource)) {
        groupedPermissions.set(resource, {
          type: resource,
          label: this.getFormattedResource(resource),
          resourceIcon: this.getResourceIcon(resource),
          actions: [],
        });
      }

      const group = groupedPermissions.get(resource)!;
      if (!group.actions.some((entry) => entry.scope === action)) {
        group.actions.push({
          scope: action,
          label: this.getFormattedAction(action),
          icon: this.getActionIcon(action),
        });
      }
    }

    return [...groupedPermissions.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }

  private getFormattedAction(action: string): string {
    switch (action) {
      case 'read':
        return 'Visualizar';
      case 'create':
        return 'Criar';
      case 'edit':
      case 'update':
        return 'Editar';
      case 'delete':
        return 'Excluir';
      case 'manage':
        return 'Gerenciar';
      default:
        return action;
    }
  }

  private getFormattedResource(resource: string): string {
    switch (resource) {
      case 'event':
        return 'Evento';
      case 'major-event':
        return 'Grande evento';
      case 'event-group':
        return 'Grupo de eventos';
      case 'certificate':
        return 'Certificado';
      case 'event-attendance':
        return 'Presenças';
      case 'event-lecturer':
        return 'Palestrante';
      case 'person':
        return 'Pessoas';
      case 'merge-candidate':
        return 'Pessoa duplicada';
      default:
        return resource;
    }
  }

  private getResourceIcon(type: string): string {
    switch (type) {
      case 'event':
        return 'event';
      case 'major-event':
        return 'festival';
      case 'event-group':
        return 'groups';
      case 'certificate':
        return 'workspace_premium';
      case 'event-lecturer':
        return 'record_voice_over';
      case 'event-attendance':
        return 'fact_check';
      case 'person':
        return 'person';
      case 'merge-candidate':
        return 'merge';
      default:
        return 'shield';
    }
  }

  private getActionIcon(action: string): string {
    switch (action) {
      case 'read':
        return 'visibility';
      case 'create':
        return 'add';
      case 'edit':
      case 'update':
        return 'edit';
      case 'delete':
        return 'delete';
      case 'manage':
        return 'admin_panel_settings';
      default:
        return 'help';
    }
  }

  private async getCachedInsights(
    cacheKey: string,
  ): Promise<WorkspaceDashboardInsights | null> {
    const cached = await this.redis.get(cacheKey);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as CachedDashboardInsights;
    return {
      ...parsed,
      generatedAt: new Date(parsed.generatedAt),
      calendarEvents: parsed.calendarEvents.map((event) => ({
        ...event,
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
      })),
      weatherAlerts: parsed.weatherAlerts.map((alert) => ({
        ...alert,
        forecastTime: new Date(alert.forecastTime),
      })),
      pendingCertificates: parsed.pendingCertificates.map((item) => ({
        ...item,
        finishedAt: new Date(item.finishedAt),
      })),
    };
  }

  private getCacheKey(permissions: string[]): string {
    return `${CACHE_KEY_PREFIX}:${permissions.join(',') || 'none'}`;
  }

  private startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
