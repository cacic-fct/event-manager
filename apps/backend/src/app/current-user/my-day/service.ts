import { BadRequestException, Injectable } from '@nestjs/common';
import { EventManagerPermissionGrantScope, SubscriptionStatus } from '@prisma/client';
import { subMonths } from 'date-fns';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';
import { SportsAutoroutingService } from '../../sports/routing/sports-autorouting.service';
import { WeatherService } from '../../weather/weather.service';
import { CurrentUserContextService } from '../context.service';
import { findCurrentUserAttendanceCollectionEvents } from '../events/attendance-collection-events';
import { CurrentUserOnlineAttendanceRealtimeService } from '../events/attendance-realtime.service';
import { activeScopedManagerGrantWhere, currentUserAssociatedEventWhere } from '../events/map-event-ids';
import { EVENT_SELECT, EventRecord, GraphqlContext } from '../selects';
import {
  CurrentUserMyDay,
  CurrentUserMyDayAction,
  CurrentUserMyDayAttentionItem,
  CurrentUserMyDayEvent,
  CurrentUserMyDayRole,
  CurrentUserMyDayWeatherAlert,
} from './models';
import { buildMyDayWeatherAdvisories } from './weather-advisories';

const TIME_ZONE = 'America/Sao_Paulo';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class CurrentUserMyDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly onlineAttendance: CurrentUserOnlineAttendanceRealtimeService,
    private readonly sportsAutorouting: SportsAutoroutingService,
    private readonly weather: WeatherService,
  ) {}

  async getCurrentUserMyDay(context: GraphqlContext, selectedDate: string): Promise<CurrentUserMyDay> {
    const generatedAt = new Date();
    const normalizedDate = this.normalizeDate(selectedDate);
    const today = formatSaoPauloDate(generatedAt);
    const minimumDate = formatSaoPauloDate(subMonths(dayBounds(today).start, 1));
    const selectedBounds = dayBounds(normalizedDate);
    const minimumBounds = dayBounds(minimumDate);
    const authenticatedUser = this.currentUser.getAuthenticatedUser(context);
    const { person, user } = await this.currentUser.resolveCurrentUserContext(authenticatedUser);

    if (!person) {
      return this.emptyResult(generatedAt, normalizedDate, minimumDate);
    }

    const associatedWhere = currentUserAssociatedEventWhere(
      person.id,
      user?.id ?? authenticatedUser.sub,
      generatedAt,
    );
    const [availableEventCount, events, pendingActions] = await Promise.all([
      this.prisma.event.count({
        where: {
          AND: [PUBLIC_EVENT_WHERE, associatedWhere],
          endDate: { gte: minimumBounds.start },
        },
      }),
      this.prisma.event.findMany({
        where: {
          AND: [PUBLIC_EVENT_WHERE, associatedWhere],
          startDate: { lte: selectedBounds.end },
          endDate: { gte: selectedBounds.start },
        },
        select: EVENT_SELECT,
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      this.loadPendingActions(person.id, minimumBounds.start),
    ]);

    const hasContent = availableEventCount > 0 || pendingActions.length > 0;
    if (events.length === 0) {
      return {
        generatedAt,
        selectedDate: normalizedDate,
        minimumDate,
        hasContent,
        currentEvent: null,
        nextEvent: null,
        laterEvents: [],
        attention: pendingActions,
        weather: [],
      };
    }

    const isToday = normalizedDate === today;
    const [roleState, pendingOnlineEvents, collectionEvents, sportsRoute, weatherAlerts] = await Promise.all([
      this.loadRoleState(events, person.id, user?.id ?? authenticatedUser.sub, generatedAt),
      isToday ? this.onlineAttendance.listPendingOnlineAttendanceEvents(person.id) : Promise.resolve([]),
      isToday
        ? findCurrentUserAttendanceCollectionEvents(
            {
              prisma: this.prisma,
              currentUserContext: this.currentUser,
              authorizationPolicy: this.authorizationPolicy,
            },
            context,
          )
        : Promise.resolve([]),
      isToday ? this.sportsAutorouting.resolveCurrentUserRoute(person.id, generatedAt) : Promise.resolve(null),
      this.loadWeatherAlerts(events, generatedAt),
    ]);
    const pendingOnlineEventIds = new Set(pendingOnlineEvents.map((item) => item.eventId));
    const collectionEventIds = new Set(collectionEvents.map((item) => item.eventId));
    const viewModels = events.map((event) =>
      this.mapEvent(event, roleState, pendingOnlineEventIds, collectionEventIds, sportsRoute),
    );
    const currentIndex = isToday
      ? events.findIndex((event) => event.startDate <= generatedAt && event.endDate >= generatedAt)
      : -1;
    const nextIndex = events.findIndex((event, index) => {
      if (index === currentIndex) {
        return false;
      }
      return event.startDate > (isToday ? generatedAt : selectedBounds.start);
    });
    const effectiveNextIndex = nextIndex >= 0 ? nextIndex : currentIndex < 0 && !isToday ? 0 : -1;
    const excluded = new Set([currentIndex, effectiveNextIndex].filter((index) => index >= 0));
    const laterEvents = viewModels.filter((_, index) => !excluded.has(index) && index > effectiveNextIndex);
    const conflicts = buildConflictAlerts(events);

    return {
      generatedAt,
      selectedDate: normalizedDate,
      minimumDate,
      hasContent,
      currentEvent: currentIndex >= 0 ? viewModels[currentIndex] : null,
      nextEvent: effectiveNextIndex >= 0 ? viewModels[effectiveNextIndex] : null,
      laterEvents,
      attention: [...pendingActions, ...conflicts].sort(
        (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
      ),
      weather: weatherAlerts,
    };
  }

  private async loadPendingActions(
    personId: string,
    minimumStart: Date,
  ): Promise<CurrentUserMyDayAttentionItem[]> {
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        subscriptionStatus: { not: SubscriptionStatus.CANCELED },
        majorEvent: {
          deletedAt: null,
          endDate: { gte: minimumStart },
        },
      },
      select: {
        id: true,
        majorEventId: true,
        subscriptionStatus: true,
        receiptRejectionReason: true,
        imageLicenseAgreementAccepted: true,
        majorEvent: {
          select: {
            name: true,
            requiresImageLicenseAgreement: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const items: CurrentUserMyDayAttentionItem[] = [];

    for (const subscription of subscriptions) {
      const paymentRoute = `/major-event/${subscription.majorEventId}/payment`;
      const subscriptionRoute = `/major-event/${subscription.majorEventId}/subscription`;
      if (subscription.subscriptionStatus === SubscriptionStatus.WAITING_RECEIPT_UPLOAD) {
        items.push({
          id: `payment:${subscription.id}`,
          kind: 'PAYMENT',
          title: 'Envie seu comprovante',
          description: `A inscrição em ${subscription.majorEvent.name} aguarda o comprovante de pagamento.`,
          materialIcon: 'receipt_long',
          route: paymentRoute,
          priority: 10,
          offlineCapable: false,
        });
      } else if (subscription.subscriptionStatus === SubscriptionStatus.REJECTED_INVALID_RECEIPT) {
        items.push({
          id: `payment-rejected:${subscription.id}`,
          kind: 'PAYMENT',
          title: 'Reenvie seu comprovante',
          description:
            subscription.receiptRejectionReason?.trim() ||
            `O comprovante de ${subscription.majorEvent.name} precisa ser corrigido.`,
          materialIcon: 'receipt_long',
          route: paymentRoute,
          priority: 5,
          offlineCapable: false,
        });
      } else if (subscription.subscriptionStatus === SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT) {
        items.push({
          id: `subscription-conflict:${subscription.id}`,
          kind: 'SUBSCRIPTION',
          title: 'Ajuste sua inscrição',
          description: `Há um conflito de horários na inscrição em ${subscription.majorEvent.name}.`,
          materialIcon: 'edit_calendar',
          route: subscriptionRoute,
          priority: 15,
          offlineCapable: false,
        });
      }

      if (
        subscription.majorEvent.requiresImageLicenseAgreement &&
        !subscription.imageLicenseAgreementAccepted &&
        subscription.subscriptionStatus !== SubscriptionStatus.CANCELED
      ) {
        items.push({
          id: `image-license:${subscription.id}`,
          kind: 'SUBSCRIPTION',
          title: 'Revise sua inscrição',
          description: `Confirme o termo de uso de imagem de ${subscription.majorEvent.name}.`,
          materialIcon: 'contract',
          route: subscriptionRoute,
          priority: 20,
          offlineCapable: false,
        });
      }
    }

    return items;
  }

  private async loadRoleState(events: EventRecord[], personId: string, userId: string | undefined, now: Date) {
    const eventIds = events.map((event) => event.id);
    const [lecturers, collectors, managerGrants, sportsMatches] = await Promise.all([
      this.prisma.eventLecturer.findMany({
        where: { personId, eventId: { in: eventIds } },
        select: { eventId: true },
      }),
      this.prisma.eventAttendanceCollector.findMany({
        where: { personId, eventId: { in: eventIds } },
        select: { eventId: true },
      }),
      userId
        ? this.prisma.eventManagerPermissionGrant.findMany({
            where: {
              userId,
              deletedAt: null,
              OR: [
                {
                  scope: EventManagerPermissionGrantScope.EVENT,
                  eventId: { in: eventIds },
                  ...activeScopedManagerGrantWhere(userId, EventManagerPermissionGrantScope.EVENT, now),
                },
                {
                  scope: EventManagerPermissionGrantScope.EVENT_GROUP,
                  eventGroupId: { in: events.flatMap((event) => (event.eventGroupId ? [event.eventGroupId] : [])) },
                  ...activeScopedManagerGrantWhere(userId, EventManagerPermissionGrantScope.EVENT_GROUP, now),
                },
                {
                  scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
                  majorEventId: { in: events.flatMap((event) => (event.majorEventId ? [event.majorEventId] : [])) },
                  ...activeScopedManagerGrantWhere(userId, EventManagerPermissionGrantScope.MAJOR_EVENT, now),
                },
              ],
            },
            select: { scope: true, eventId: true, eventGroupId: true, majorEventId: true },
          })
        : Promise.resolve([]),
      this.prisma.sportsMatch.findMany({
        where: { eventId: { in: eventIds }, deletedAt: null },
        select: {
          id: true,
          eventId: true,
          state: true,
          rosters: {
            where: { deletedAt: null, status: 'APPROVED' },
            select: {
              entries: {
                where: {
                  deletedAt: null,
                  status: 'APPROVED',
                  registrationMember: {
                    deletedAt: null,
                    eligibility: 'ELIGIBLE',
                    teamMember: {
                      deletedAt: null,
                      status: 'APPROVED',
                      participant: { personId, deletedAt: null, status: 'ACTIVE' },
                    },
                  },
                },
                select: { id: true },
              },
            },
          },
          officialAssignments: {
            where: { personId, active: true, revokedAt: null },
            select: { id: true },
          },
          category: {
            select: {
              officialAssignments: {
                where: { personId, active: true, revokedAt: null, matchId: null },
                select: { id: true },
              },
              tournament: {
                select: {
                  officials: {
                    where: { personId, active: true, revokedAt: null, categoryId: null, matchId: null },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      lecturerEventIds: new Set(lecturers.map((item) => item.eventId)),
      collectorEventIds: new Set(collectors.map((item) => item.eventId)),
      managerGrants,
      sportsMatches,
    };
  }

  private mapEvent(
    event: EventRecord,
    roleState: Awaited<ReturnType<CurrentUserMyDayService['loadRoleState']>>,
    pendingOnlineEventIds: ReadonlySet<string>,
    collectionEventIds: ReadonlySet<string>,
    sportsRoute: Awaited<ReturnType<SportsAutoroutingService['resolveCurrentUserRoute']>>,
  ): CurrentUserMyDayEvent {
    const sportsMatch = roleState.sportsMatches.find((match) => match.eventId === event.id);
    const isAthlete = Boolean(sportsMatch?.rosters.some((roster) => roster.entries.length > 0));
    const isOfficial = Boolean(
      sportsMatch &&
        (sportsMatch.officialAssignments.length > 0 ||
          sportsMatch.category.officialAssignments.length > 0 ||
          sportsMatch.category.tournament.officials.length > 0),
    );
    const roles: CurrentUserMyDayRole[] = [];
    if (roleState.lecturerEventIds.has(event.id)) {
      roles.push({ kind: 'LECTURER', label: 'Ministrante' });
    }
    if (roleState.collectorEventIds.has(event.id)) {
      roles.push({ kind: 'ATTENDANCE_COLLECTOR', label: 'Coleta de presença' });
    }
    if (this.hasManagerGrant(event, roleState.managerGrants)) {
      roles.push({ kind: 'ORGANIZER', label: 'Organização' });
    }
    if (isAthlete) {
      roles.push({ kind: 'ATHLETE', label: 'Atleta' });
    }
    if (isOfficial) {
      roles.push({ kind: 'OFFICIAL', label: 'Oficial' });
    }

    let attendanceAction: CurrentUserMyDayAction | null = null;
    if (collectionEventIds.has(event.id)) {
      attendanceAction = {
        kind: 'COLLECT_ATTENDANCE',
        label: 'Coletar presenças',
        materialIcon: 'qr_code_scanner',
        route: `/attendance/collect/${event.id}/method`,
        offlineCapable: true,
      };
    } else if (pendingOnlineEventIds.has(event.id)) {
      attendanceAction = {
        kind: 'SELF_ATTENDANCE',
        label: 'Fazer check-in',
        materialIcon: 'how_to_reg',
        route: `/attendance/register/${event.id}`,
        offlineCapable: false,
      };
    }

    const sportsActions: CurrentUserMyDayAction[] = [];
    if (
      sportsMatch &&
      isOfficial &&
      sportsRoute?.matchId === sportsMatch.id &&
      sportsRoute.mode !== 'MATCH_DETAIL'
    ) {
      sportsActions.push({
        kind: 'SPORTS_OPERATE',
        label: 'Gerenciar partida',
        materialIcon: 'sports_score',
        route: `/sports/operate/${sportsMatch.id}?mode=${sportsRoute.mode}`,
        offlineCapable: true,
      });
    } else if (sportsMatch && (isAthlete || isOfficial)) {
      sportsActions.push({
        kind: 'SPORTS_MATCH',
        label: 'Painel da partida',
        materialIcon: 'scoreboard',
        route: `/sports/match/${sportsMatch.id}`,
        offlineCapable: false,
      });
    }

    return {
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
      locationDescription: event.locationDescription,
      roles,
      attendanceAction,
      sportsActions,
      infoAction: {
        kind: 'EVENT_INFO',
        label: 'Informações',
        materialIcon: 'info',
        route: `/event/${event.id}`,
        offlineCapable: true,
      },
      mapAction:
        event.latitude != null && event.longitude != null
          ? {
              kind: 'MAP',
              label: 'Ver no mapa',
              materialIcon: 'location_on',
              route: `/map?evento=${encodeURIComponent(event.id)}`,
              offlineCapable: true,
            }
          : null,
    };
  }

  private hasManagerGrant(
    event: EventRecord,
    grants: Awaited<ReturnType<CurrentUserMyDayService['loadRoleState']>>['managerGrants'],
  ): boolean {
    return grants.some(
      (grant) =>
        grant.eventId === event.id ||
        (event.eventGroupId && grant.eventGroupId === event.eventGroupId) ||
        (event.majorEventId && grant.majorEventId === event.majorEventId),
    );
  }

  private async loadWeatherAlerts(events: EventRecord[], now: Date): Promise<CurrentUserMyDayWeatherAlert[]> {
    const forecasts = await Promise.all(
      events
        .filter((event) => event.endDate >= now && event.latitude != null && event.longitude != null)
        .map(async (event) => {
          try {
            return { event, weather: await this.weather.getPublicEventWeather(event.id) };
          } catch {
            return { event, weather: null };
          }
        }),
    );
    const deduplicated = new Map<string, CurrentUserMyDayWeatherAlert>();
    for (const { event, weather } of forecasts) {
      if (!weather) {
        continue;
      }
      const day = formatSaoPauloDate(weather.forecastTime);
      for (const advisory of buildMyDayWeatherAdvisories(weather)) {
        const key = `${day}:${advisory.kind}`;
        if (deduplicated.has(key)) {
          continue;
        }
        deduplicated.set(key, {
          id: `weather:${key}`,
          ...advisory,
          eventId: event.id,
          eventName: event.name,
          forecastTime: weather.forecastTime,
          temperature: weather.temperature,
          uvIndex: weather.uvIndex ?? null,
          route: `/event/${event.id}`,
        });
      }
    }
    return [...deduplicated.values()];
  }

  private normalizeDate(value: string): string {
    if (!DATE_PATTERN.test(value)) {
      throw new BadRequestException('Date must use the YYYY-MM-DD format.');
    }
    const bounds = dayBounds(value);
    if (Number.isNaN(bounds.start.getTime()) || formatSaoPauloDate(bounds.start) !== value) {
      throw new BadRequestException('Date is invalid.');
    }
    return value;
  }

  private emptyResult(generatedAt: Date, selectedDate: string, minimumDate: string): CurrentUserMyDay {
    return {
      generatedAt,
      selectedDate,
      minimumDate,
      hasContent: false,
      currentEvent: null,
      nextEvent: null,
      laterEvents: [],
      attention: [],
      weather: [],
    };
  }
}

export function dayBounds(value: string): { start: Date; end: Date } {
  return {
    start: new Date(`${value}T00:00:00.000-03:00`),
    end: new Date(`${value}T23:59:59.999-03:00`),
  };
}

export function formatSaoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function buildConflictAlerts(events: readonly EventRecord[]): CurrentUserMyDayAttentionItem[] {
  const alerts: CurrentUserMyDayAttentionItem[] = [];
  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const left = events[leftIndex];
      const right = events[rightIndex];
      if (left.endDate <= right.startDate || right.endDate <= left.startDate) {
        continue;
      }
      alerts.push({
        id: `conflict:${left.id}:${right.id}`,
        kind: 'CONFLICT',
        title: 'Conflito de horário',
        description: `${left.name} e ${right.name} se sobrepõem.`,
        materialIcon: 'event_busy',
        route: `/event/${right.id}`,
        priority: 50,
        offlineCapable: true,
      });
    }
  }
  return alerts;
}
