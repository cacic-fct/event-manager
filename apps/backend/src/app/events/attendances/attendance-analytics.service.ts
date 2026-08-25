import {
  AttendanceCollectorProductivity,
  AttendanceHeatmapPoint,
  AttendanceMethodCount,
  AttendanceReviewEventSummary,
  AttendanceReviewItem,
  AttendanceTimeBucket,
  EventAttendanceAnalyticsSnapshot,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceCreationMethod,
  AttendanceReviewFlagKind,
  AttendanceReviewFlagSeverity,
  AttendanceReviewFlagStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Permission } from '@cacic-fct/shared-permissions';

const MIN_WINDOW_MINUTES = 15;
const MAX_WINDOW_MINUTES = 240;
const REVIEW_DETECTION_WINDOW_MINUTES = 60;
const MAX_ANALYTICS_ATTENDANCES = 10_000;
const MAX_REVIEW_ITEMS = 100;
const UNUSUAL_SCANS_PER_MINUTE = 20;
const LARGE_OFFLINE_BACKLOG = 25;
const OLD_OFFLINE_BACKLOG_MINUTES = 30;
const LOCATION_ACCURACY_FLOOR_METERS = 250;
const LOCATION_NEAR_EVENT_METERS = 750;
const LOCATION_FAR_FROM_EVENT_METERS = 2_500;
const IMPROBABLE_TRANSITION_METERS = 2_000;
const IMPROBABLE_TRAVEL_SPEED_METERS_PER_SECOND = 70;
const MAX_TRANSITION_SECONDS = 180;
const MIN_GEOLOCATED_SCANS_FOR_REVIEW = 6;
const MIN_IMPROBABLE_TRANSITIONS_FOR_REVIEW = 3;

type AnalyticsAttendance = Prisma.EventAttendanceGetPayload<{
  select: {
    personId: true;
    attendedAt: true;
    createdAt: true;
    createdById: true;
    committedById: true;
    createdByMethod: true;
    status: true;
    collectedLatitude: true;
    collectedLongitude: true;
    collectedAccuracyMeters: true;
  };
}>;

type EventAnalyticsRecord = Prisma.EventGetPayload<{
  select: {
    id: true;
    name: true;
    emoji: true;
    startDate: true;
    latitude: true;
    longitude: true;
    allowSubscription: true;
    majorEventId: true;
    autoSubscribe: true;
    sportsMatch: {
      select: {
        id: true;
        category: { select: { tournamentId: true } };
      };
    };
  };
}>;

type FlagCandidate = {
  eventId: string;
  personId?: string;
  actorId?: string;
  kind: AttendanceReviewFlagKind;
  severity: AttendanceReviewFlagSeverity;
  dedupeKey: string;
  title: string;
  summary: string;
  details?: Prisma.InputJsonValue;
};

export interface AttendanceAnalyticsWindowRequest {
  windowMinutes?: number;
  start?: Date;
  end?: Date;
}

interface ResolvedAttendanceAnalyticsWindow {
  start: Date | null;
  end: Date | null;
  windowMinutes: number | null;
  attendedAt?: Prisma.DateTimeFilter;
}

@Injectable()
export class AttendanceAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
  ) {}

  async snapshot(
    eventId: string,
    requestedWindow: AttendanceAnalyticsWindowRequest = {},
  ): Promise<EventAttendanceAnalyticsSnapshot> {
    const event = await this.findEvent(eventId);
    const generatedAt = new Date();
    const window = resolveAttendanceAnalyticsWindow(requestedWindow, generatedAt);
    const reviewDetectionStart = new Date(generatedAt.getTime() - REVIEW_DETECTION_WINDOW_MINUTES * 60_000);

    const [windowAttendances, reviewDetectionAttendances, allPresentAttendances, pendingOfflineSubmissions] =
      await Promise.all([
        this.prisma.eventAttendance.findMany({
          where: { eventId, ...(window.attendedAt ? { attendedAt: window.attendedAt } : {}) },
          select: analyticsAttendanceSelect,
          orderBy: { attendedAt: 'asc' },
        }),
        this.prisma.eventAttendance.findMany({
          where: { eventId, attendedAt: { gte: reviewDetectionStart } },
          select: analyticsAttendanceSelect,
          orderBy: { attendedAt: 'asc' },
          take: MAX_ANALYTICS_ATTENDANCES,
        }),
        this.prisma.eventAttendance.findMany({
          where: { eventId, status: 'PRESENT' },
          select: { personId: true },
        }),
        this.prisma.offlineEventAttendanceSubmission.findMany({
          where: { eventId, status: 'PENDING' },
          select: { id: true, submittedAt: true },
          orderBy: { submittedAt: 'asc' },
          take: MAX_ANALYTICS_ATTENDANCES,
        }),
      ]);

    const actorNames = await this.actorNames([...windowAttendances, ...reviewDetectionAttendances]);
    await this.detectReviewFlags(event, reviewDetectionAttendances, pendingOfflineSubmissions, generatedAt, actorNames);

    const [subscribedPersonIds, reviewItems] = await Promise.all([
      this.subscribedPersonIds(event),
      this.reviewItems(event),
    ]);
    const presentPersonIds = new Set(allPresentAttendances.map((attendance) => attendance.personId));

    return {
      eventId: event.id,
      eventName: event.name,
      emoji: event.emoji,
      generatedAt,
      windowMinutes: window.windowMinutes,
      windowStart: window.start,
      windowEnd: window.end,
      presentCount: presentPersonIds.size,
      noShowCount: [...subscribedPersonIds].filter((personId) => !presentPersonIds.has(personId)).length,
      pendingReviewCount: reviewItems.length,
      pendingOfflineCount: pendingOfflineSubmissions.length,
      eventLatitude: event.latitude ?? undefined,
      eventLongitude: event.longitude ?? undefined,
      scansPerMinute: buildTimeBuckets(windowAttendances, 'minute'),
      scansByHour: buildTimeBuckets(windowAttendances, 'hour'),
      collectors: buildCollectorProductivity(windowAttendances, actorNames),
      methods: countMethods(windowAttendances),
      heatmapPoints: buildHeatmapPoints(windowAttendances),
      reviewItems,
    };
  }

  async pendingReviewSummaries(user?: AuthenticatedUser): Promise<AttendanceReviewEventSummary[]> {
    await this.materializeRecentAuditFlags();
    const accessibleTargets = await this.authorization.accessibleEventTargets(user, Permission.EventAttendance.Update);
    const accessibleEventIds = accessibleTargets
      ? await this.prisma.event.findMany({
          where: {
            deletedAt: null,
            OR: [
              { id: { in: [...accessibleTargets.eventIds] } },
              { majorEventId: { in: [...accessibleTargets.majorEventIds] } },
              { eventGroupId: { in: [...accessibleTargets.eventGroupIds] } },
            ],
          },
          select: { id: true },
        })
      : null;
    const flags = await this.prisma.attendanceReviewFlag.groupBy({
      by: ['eventId'],
      where: {
        status: AttendanceReviewFlagStatus.PENDING,
        ...(accessibleEventIds ? { eventId: { in: accessibleEventIds.map((event) => event.id) } } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { eventId: 'desc' } },
      take: 20,
    });
    if (!flags.length) return [];

    const events = await this.prisma.event.findMany({
      where: { id: { in: flags.map((flag) => flag.eventId) }, deletedAt: null },
      select: { id: true, name: true, emoji: true, startDate: true },
    });
    const eventById = new Map(events.map((event) => [event.id, event]));
    return flags.flatMap((flag) => {
      const event = eventById.get(flag.eventId);
      return event
        ? [
            {
              eventId: event.id,
              eventName: event.name,
              emoji: event.emoji,
              startDate: event.startDate,
              pendingCount: flag._count._all,
            },
          ]
        : [];
    });
  }

  async reviewFlag(
    flagId: string,
    status: AttendanceReviewFlagStatus,
    reviewedById?: string,
    reviewNote?: string,
    eventId?: string,
  ): Promise<AttendanceReviewItem> {
    if (flagId.startsWith('sports:')) {
      throw new BadRequestException('Revise esta operação na central esportiva.');
    }
    const existing = await this.prisma.attendanceReviewFlag.findUnique({ where: { id: flagId } });
    if (!existing) throw new NotFoundException(`Attendance review flag ${flagId} was not found.`);
    if (eventId && existing.eventId !== eventId) {
      throw new NotFoundException(`Attendance review flag ${flagId} was not found.`);
    }

    const updated = await this.prisma.attendanceReviewFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById,
        reviewNote: reviewNote?.trim() || null,
      },
    });
    return this.mapFlag(updated);
  }

  private async findEvent(eventId: string): Promise<EventAnalyticsRecord> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        startDate: true,
        latitude: true,
        longitude: true,
        allowSubscription: true,
        majorEventId: true,
        autoSubscribe: true,
        sportsMatch: { select: { id: true, category: { select: { tournamentId: true } } } },
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} was not found.`);
    return event;
  }

  private async actorNames(attendances: AnalyticsAttendance[]): Promise<Map<string, string>> {
    const actorIds = [
      ...new Set(
        attendances
          .flatMap((attendance) => [attendance.createdById, attendance.committedById])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    return new Map(actors.map((actor) => [actor.id, actor.name]));
  }

  private async subscribedPersonIds(event: EventAnalyticsRecord): Promise<Set<string>> {
    const standalone = event.allowSubscription
      ? await this.prisma.eventSubscription.findMany({
          where: { eventId: event.id, deletedAt: null },
          select: { personId: true },
        })
      : [];
    const major = event.majorEventId
      ? await this.prisma.majorEventSubscription.findMany({
          where: {
            majorEventId: event.majorEventId,
            deletedAt: null,
            subscriptionStatus: 'CONFIRMED',
            ...(event.autoSubscribe ? {} : { selectedEvents: { some: { eventId: event.id, deletedAt: null } } }),
          },
          select: { personId: true },
        })
      : [];
    return new Set([...standalone, ...major].map((subscription) => subscription.personId));
  }

  private async detectReviewFlags(
    event: EventAnalyticsRecord,
    attendances: AnalyticsAttendance[],
    pendingOffline: Array<{ id: string; submittedAt: Date }>,
    now: Date,
    actorNames: Map<string, string>,
  ): Promise<void> {
    const candidates: FlagCandidate[] = [];
    const volumeByActorMinute = new Map<string, { actorId: string; minute: Date; count: number }>();
    for (const attendance of attendances.filter((item) => item.status === 'PRESENT')) {
      const actorId = collectorId(attendance);
      const minute = truncateDate(attendance.attendedAt, 'minute');
      const volumeKey = `${actorId}:${minute.toISOString()}`;
      const volume = volumeByActorMinute.get(volumeKey) ?? { actorId, minute, count: 0 };
      volume.count += 1;
      volumeByActorMinute.set(volumeKey, volume);
    }

    if (event.latitude !== null && event.longitude !== null) {
      for (const pattern of findInconsistentLocationPatterns(attendances, event.latitude, event.longitude)) {
        candidates.push({
          eventId: event.id,
          actorId: pattern.actorId.startsWith('method:') ? undefined : pattern.actorId,
          kind: AttendanceReviewFlagKind.DISTANT_LOCATION,
          severity: AttendanceReviewFlagSeverity.INFO,
          dedupeKey: `location-pattern:${event.id}:${pattern.actorId}`,
          title: 'Padrão de localização inconsistente',
          summary: `${actorNames.get(pattern.actorId) ?? collectorFallbackName(pattern.actorId)} teve ${pattern.transitionCount} transições geográficas improváveis em ${pattern.scanCount} coletas. Pontos isolados e sequências estáveis não são sinalizados.`,
          details: { transitionCount: pattern.transitionCount, scanCount: pattern.scanCount },
        });
      }
    }

    for (const volume of volumeByActorMinute.values()) {
      if (volume.count < UNUSUAL_SCANS_PER_MINUTE) continue;
      candidates.push({
        eventId: event.id,
        actorId: volume.actorId.startsWith('method:') ? undefined : volume.actorId,
        kind: AttendanceReviewFlagKind.UNUSUAL_VOLUME,
        severity: AttendanceReviewFlagSeverity.WARNING,
        dedupeKey: `volume:${event.id}:${volume.actorId}:${volume.minute.toISOString()}`,
        title: 'Volume de coleta incomum',
        summary: `${actorNames.get(volume.actorId) ?? collectorFallbackName(volume.actorId)} registrou ${volume.count} presenças em um minuto.`,
        details: { count: volume.count, minute: volume.minute.toISOString() },
      });
    }

    const oldestPending = pendingOffline[0]?.submittedAt;
    const oldestAgeMinutes = oldestPending ? Math.floor((now.getTime() - oldestPending.getTime()) / 60_000) : 0;
    if (pendingOffline.length >= LARGE_OFFLINE_BACKLOG || oldestAgeMinutes >= OLD_OFFLINE_BACKLOG_MINUTES) {
      candidates.push({
        eventId: event.id,
        kind: AttendanceReviewFlagKind.OFFLINE_BACKLOG,
        severity:
          pendingOffline.length >= LARGE_OFFLINE_BACKLOG
            ? AttendanceReviewFlagSeverity.CRITICAL
            : AttendanceReviewFlagSeverity.WARNING,
        dedupeKey: `offline-backlog:${event.id}`,
        title: 'Fila off-line acumulada',
        summary: `${pendingOffline.length} envio(s) aguardam reconciliação; o mais antigo está pendente há ${oldestAgeMinutes} min.`,
        details: { count: pendingOffline.length, oldestAgeMinutes },
      });
    }

    const auditEntries = await this.prisma.auditLogEntry.findMany({
      where: {
        eventId: event.id,
        entityType: 'EVENT_ATTENDANCE',
        OR: [{ operation: 'DELETE' }, { groupedCount: { gte: 3 } }],
      },
      select: {
        id: true,
        actorId: true,
        actorName: true,
        operation: true,
        groupedCount: true,
        lastRecordedAt: true,
        entityId: true,
      },
      orderBy: { lastRecordedAt: 'desc' },
      take: MAX_REVIEW_ITEMS,
    });
    for (const entry of auditEntries) {
      const removal = entry.operation === 'DELETE';
      candidates.push({
        eventId: event.id,
        actorId: entry.actorId ?? undefined,
        kind: removal ? AttendanceReviewFlagKind.ATTENDANCE_REMOVAL : AttendanceReviewFlagKind.REPEATED_SCAN_ATTEMPTS,
        severity: removal ? AttendanceReviewFlagSeverity.WARNING : AttendanceReviewFlagSeverity.INFO,
        dedupeKey: `${removal ? 'removal' : 'repeat'}:${entry.id}`,
        title: removal ? 'Presença removida' : 'Tentativas repetidas de leitura',
        summary: removal
          ? `${entry.actorName} removeu uma presença; o registro continua válido como ação auditada até revisão humana.`
          : `${entry.groupedCount} tentativas semelhantes foram agrupadas para a mesma presença.`,
        details: { auditLogEntryId: entry.id, entityId: entry.entityId },
      });
    }

    await Promise.all(candidates.map((candidate) => this.upsertFlag(candidate)));
  }

  private upsertFlag(candidate: FlagCandidate): Promise<unknown> {
    return this.prisma.attendanceReviewFlag.upsert({
      where: { dedupeKey: candidate.dedupeKey },
      create: candidate,
      update: { title: candidate.title, summary: candidate.summary, details: candidate.details },
    });
  }

  private async materializeRecentAuditFlags(): Promise<void> {
    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        eventId: { not: null },
        entityType: 'EVENT_ATTENDANCE',
        OR: [{ operation: 'DELETE' }, { groupedCount: { gte: 3 } }],
      },
      select: {
        id: true,
        eventId: true,
        actorId: true,
        actorName: true,
        operation: true,
        groupedCount: true,
        entityId: true,
      },
      orderBy: { lastRecordedAt: 'desc' },
      take: 500,
    });
    await Promise.all(
      entries.flatMap((entry) => {
        if (!entry.eventId) return [];
        const removal = entry.operation === 'DELETE';
        return [
          this.upsertFlag({
            eventId: entry.eventId,
            actorId: entry.actorId ?? undefined,
            kind: removal
              ? AttendanceReviewFlagKind.ATTENDANCE_REMOVAL
              : AttendanceReviewFlagKind.REPEATED_SCAN_ATTEMPTS,
            severity: removal ? AttendanceReviewFlagSeverity.WARNING : AttendanceReviewFlagSeverity.INFO,
            dedupeKey: `${removal ? 'removal' : 'repeat'}:${entry.id}`,
            title: removal ? 'Presença removida' : 'Tentativas repetidas de leitura',
            summary: removal
              ? `${entry.actorName} removeu uma presença; a ação auditada aguarda revisão humana.`
              : `${entry.groupedCount} tentativas semelhantes foram agrupadas para a mesma presença.`,
            details: { auditLogEntryId: entry.id, entityId: entry.entityId },
          }),
        ];
      }),
    );
  }

  private async reviewItems(event: EventAnalyticsRecord): Promise<AttendanceReviewItem[]> {
    const [flags, sportsActions] = await Promise.all([
      this.prisma.attendanceReviewFlag.findMany({
        where: { eventId: event.id, status: AttendanceReviewFlagStatus.PENDING },
        orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
        take: MAX_REVIEW_ITEMS,
      }),
      event.sportsMatch
        ? this.prisma.sportsMatchAction.findMany({
            where: { matchId: event.sportsMatch.id, reviewStatus: 'PENDING' },
            select: { id: true, type: true, actorUserId: true, authoredAt: true, offline: true },
            orderBy: { authoredAt: 'desc' },
            take: MAX_REVIEW_ITEMS,
          })
        : Promise.resolve([]),
    ]);
    const actorIds = [
      ...new Set(
        [...flags.map((flag) => flag.actorId), ...sportsActions.map((action) => action.actorUserId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));
    return [
      ...flags.map((flag) => this.mapFlag(flag, actorNameById.get(flag.actorId ?? ''))),
      ...sportsActions.map(
        (action) =>
          ({
            id: `sports:${action.id}`,
            eventId: event.id,
            kind: 'IMPROBABLE_MATCH_OPERATION',
            severity: action.offline ? 'WARNING' : 'INFO',
            status: 'PENDING',
            title: 'Operação esportiva precisa de revisão',
            summary: `${action.type.replace(/_/g, ' ')} foi encaminhada pela validação da partida.`,
            detectedAt: action.authoredAt,
            actorId: action.actorUserId ?? undefined,
            actorName: action.actorUserId ? actorNameById.get(action.actorUserId) : undefined,
            deepLink: event.sportsMatch ? `/sports/${event.sportsMatch.category.tournamentId}` : undefined,
          }) satisfies AttendanceReviewItem,
      ),
    ].slice(0, MAX_REVIEW_ITEMS);
  }

  private mapFlag(
    flag: {
      id: string;
      eventId: string;
      kind: string;
      severity: string;
      status: string;
      title: string;
      summary: string;
      detectedAt: Date;
      personId: string | null;
      actorId: string | null;
    },
    actorName?: string,
  ): AttendanceReviewItem {
    return {
      id: flag.id,
      eventId: flag.eventId,
      kind: flag.kind,
      severity: flag.severity,
      status: flag.status,
      title: flag.title,
      summary: flag.summary,
      detectedAt: flag.detectedAt,
      personId: flag.personId ?? undefined,
      actorId: flag.actorId ?? undefined,
      actorName,
    };
  }
}

const analyticsAttendanceSelect = {
  personId: true,
  attendedAt: true,
  createdAt: true,
  createdById: true,
  committedById: true,
  createdByMethod: true,
  status: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
} satisfies Prisma.EventAttendanceSelect;

export function resolveAttendanceAnalyticsWindow(
  requested: AttendanceAnalyticsWindowRequest,
  now = new Date(),
): ResolvedAttendanceAnalyticsWindow {
  const hasFixedBoundary = requested.start !== undefined || requested.end !== undefined;
  if (requested.windowMinutes !== undefined && hasFixedBoundary) {
    throw new BadRequestException('Use uma duração ou um intervalo fixo, não ambos.');
  }
  if (hasFixedBoundary) {
    if (requested.start === undefined || requested.end === undefined) {
      throw new BadRequestException('Informe o início e o fim do intervalo de presença.');
    }
    const start = new Date(requested.start);
    const end = new Date(requested.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('O intervalo de presença informado é inválido.');
    }
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException('O fim do intervalo deve ser posterior ao início.');
    }
    return {
      start,
      end,
      windowMinutes: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 60_000)),
      attendedAt: { gte: start, lte: end },
    };
  }
  if (requested.windowMinutes === undefined) {
    return { start: null, end: null, windowMinutes: null };
  }
  if (
    !Number.isInteger(requested.windowMinutes) ||
    requested.windowMinutes < MIN_WINDOW_MINUTES ||
    requested.windowMinutes > MAX_WINDOW_MINUTES
  ) {
    throw new BadRequestException(`A janela deve ter entre ${MIN_WINDOW_MINUTES} e ${MAX_WINDOW_MINUTES} minutos.`);
  }
  const end = new Date(now);
  const start = new Date(end.getTime() - requested.windowMinutes * 60_000);
  return {
    start,
    end,
    windowMinutes: requested.windowMinutes,
    attendedAt: { gte: start },
  };
}

export function buildTimeBuckets(
  attendances: AnalyticsAttendance[],
  precision: 'minute' | 'hour',
): AttendanceTimeBucket[] {
  const counts = new Map<string, number>();
  for (const attendance of attendances.filter((item) => item.status === 'PRESENT')) {
    const start = truncateDate(attendance.attendedAt, precision).toISOString();
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([start, count]) => ({ start: new Date(start), count }));
}

export function buildCollectorProductivity(
  attendances: AnalyticsAttendance[],
  actorNames: Map<string, string>,
): AttendanceCollectorProductivity[] {
  const collectors = new Map<string, { actorId: string; scans: AnalyticsAttendance[] }>();
  for (const attendance of attendances.filter((item) => item.status === 'PRESENT')) {
    const actorId = collectorId(attendance);
    const collector = collectors.get(actorId) ?? { actorId, scans: [] };
    collector.scans.push(attendance);
    collectors.set(actorId, collector);
  }
  return [...collectors.values()]
    .map(({ actorId, scans }) => ({
      actorId,
      name: actorNames.get(actorId) ?? collectorFallbackName(actorId),
      count: scans.length,
      firstScanAt: scans[0].attendedAt,
      lastScanAt: scans[scans.length - 1].attendedAt,
      methods: countMethods(scans),
      onlineCount: scans.filter((attendance) => !isOfflineAttendance(attendance)).length,
      offlineCount: scans.filter(isOfflineAttendance).length,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function countMethods(attendances: AnalyticsAttendance[]): AttendanceMethodCount[] {
  const counts = new Map<string, number>();
  for (const attendance of attendances.filter((item) => item.status === 'PRESENT')) {
    counts.set(attendance.createdByMethod, (counts.get(attendance.createdByMethod) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((left, right) => right.count - left.count);
}

export function buildHeatmapPoints(attendances: AnalyticsAttendance[]): AttendanceHeatmapPoint[] {
  const cells = new Map<
    string,
    { latitude: number; longitude: number; count: number; accuracyTotal: number; accuracyCount: number }
  >();
  for (const attendance of attendances.filter((item) => item.status === 'PRESENT')) {
    if (attendance.collectedLatitude === null || attendance.collectedLongitude === null) continue;
    const latitude = Number(attendance.collectedLatitude.toFixed(4));
    const longitude = Number(attendance.collectedLongitude.toFixed(4));
    const key = `${latitude}:${longitude}`;
    const cell = cells.get(key) ?? { latitude, longitude, count: 0, accuracyTotal: 0, accuracyCount: 0 };
    cell.count += 1;
    if (attendance.collectedAccuracyMeters !== null) {
      cell.accuracyTotal += attendance.collectedAccuracyMeters;
      cell.accuracyCount += 1;
    }
    cells.set(key, cell);
  }
  return [...cells.values()].map((cell) => ({
    latitude: cell.latitude,
    longitude: cell.longitude,
    count: cell.count,
    averageAccuracyMeters: cell.accuracyCount ? cell.accuracyTotal / cell.accuracyCount : undefined,
  }));
}

function collectorId(attendance: AnalyticsAttendance): string {
  return attendance.createdById ?? attendance.committedById ?? `method:${attendance.createdByMethod}`;
}

function collectorFallbackName(actorId: string): string {
  if (!actorId.startsWith('method:')) return 'Pessoa coletora não identificada';
  return methodLabel(actorId.slice('method:'.length) as AttendanceCreationMethod);
}

function methodLabel(method: AttendanceCreationMethod): string {
  return (
    {
      CSV_IMPORT: 'Importação CSV',
      EVENT_DUPLICATION: 'Duplicação do evento',
      MANUAL_INPUT: 'Entrada manual',
      ORAL_CALL: 'Chamada oral',
      SCANNER: 'Leitor de crachá',
      ONLINE_CODE: 'Código on-line',
      UNKNOWN: 'Método não identificado',
    } satisfies Record<AttendanceCreationMethod, string>
  )[method];
}

function isOfflineAttendance(attendance: AnalyticsAttendance): boolean {
  return (
    (attendance.committedById !== null && attendance.committedById !== attendance.createdById) ||
    attendance.createdAt.getTime() - attendance.attendedAt.getTime() > 60_000
  );
}

function truncateDate(date: Date, precision: 'minute' | 'hour'): Date {
  const result = new Date(date);
  result.setUTCSeconds(0, 0);
  if (precision === 'hour') result.setUTCMinutes(0);
  return result;
}

export function haversineMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findInconsistentLocationPatterns(
  attendances: AnalyticsAttendance[],
  eventLatitude: number,
  eventLongitude: number,
): Array<{ actorId: string; transitionCount: number; scanCount: number }> {
  const scansByActor = new Map<string, AnalyticsAttendance[]>();
  for (const attendance of attendances) {
    if (attendance.collectedLatitude === null || attendance.collectedLongitude === null) continue;
    const actorId = collectorId(attendance);
    const scans = scansByActor.get(actorId) ?? [];
    scans.push(attendance);
    scansByActor.set(actorId, scans);
  }

  const patterns: Array<{ actorId: string; transitionCount: number; scanCount: number }> = [];
  for (const [actorId, unorderedScans] of scansByActor) {
    if (unorderedScans.length < MIN_GEOLOCATED_SCANS_FOR_REVIEW) continue;
    const scans = [...unorderedScans].sort((left, right) => left.attendedAt.getTime() - right.attendedAt.getTime());
    let transitionCount = 0;
    for (let index = 1; index < scans.length; index += 1) {
      const previous = scans[index - 1];
      const current = scans[index];
      const previousLatitude = previous.collectedLatitude;
      const previousLongitude = previous.collectedLongitude;
      const currentLatitude = current.collectedLatitude;
      const currentLongitude = current.collectedLongitude;
      if (
        previousLatitude === null ||
        previousLongitude === null ||
        currentLatitude === null ||
        currentLongitude === null
      )
        continue;
      const seconds = (current.attendedAt.getTime() - previous.attendedAt.getTime()) / 1_000;
      if (seconds <= 0 || seconds > MAX_TRANSITION_SECONDS) continue;

      const previousEventDistance = haversineMeters(eventLatitude, eventLongitude, previousLatitude, previousLongitude);
      const currentEventDistance = haversineMeters(eventLatitude, eventLongitude, currentLatitude, currentLongitude);
      const accuracyAllowance =
        Math.max(LOCATION_ACCURACY_FLOOR_METERS, previous.collectedAccuracyMeters ?? 0) +
        Math.max(LOCATION_ACCURACY_FLOOR_METERS, current.collectedAccuracyMeters ?? 0);
      const transitionDistance = Math.max(
        0,
        haversineMeters(previousLatitude, previousLongitude, currentLatitude, currentLongitude) - accuracyAllowance,
      );
      const crossesEventBoundary =
        (previousEventDistance <= LOCATION_NEAR_EVENT_METERS &&
          currentEventDistance >= LOCATION_FAR_FROM_EVENT_METERS) ||
        (currentEventDistance <= LOCATION_NEAR_EVENT_METERS && previousEventDistance >= LOCATION_FAR_FROM_EVENT_METERS);
      if (
        crossesEventBoundary &&
        transitionDistance >= IMPROBABLE_TRANSITION_METERS &&
        transitionDistance / seconds >= IMPROBABLE_TRAVEL_SPEED_METERS_PER_SECOND
      ) {
        transitionCount += 1;
      }
    }
    if (transitionCount >= MIN_IMPROBABLE_TRANSITIONS_FOR_REVIEW) {
      patterns.push({ actorId, transitionCount, scanCount: scans.length });
    }
  }
  return patterns;
}
