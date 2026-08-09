import { ConflictException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  AuditLogEntityType,
  AuditLogOperation,
  AuditLogActorType,
  Prisma,
  SportsBracketSide,
  SportsMatchState,
  SportsReviewStatus,
  SportsScoreEntrySource,
  SportsStageType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import { planSportsGrandFinalOutcome } from '../domain/sports-double-elimination';
import { SportsStructuralInvalidation } from '../realtime/sports-structural-invalidation';

interface StandingAccumulator {
  registrationId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
  tiebreakData: Record<string, unknown>;
  opponentRegistrationIds: string[];
}

export abstract class SportsStandingsSupport {
  protected readonly auditLog: AuditLogService;

  constructor(protected readonly advancement: SportsBracketAdvancementService, auditLog?: AuditLogService) {
    this.auditLog =
      auditLog ??
      ({
        record: async () => undefined,
      } as unknown as AuditLogService);
  }

  protected async recordAutomaticScoreEntryAudit(
    tx: Prisma.TransactionClient,
    entry: {
      id: string;
      tournamentId: string;
      categoryId: string | null;
      teamId: string;
      sourceMatchId: string | null;
      source: SportsScoreEntrySource;
      points: number;
      reason: string;
      revision: number;
      deletedAt?: Date | null;
    },
    operation: AuditLogOperation,
    summary: string,
    actorId: string,
    majorEventId: string,
    before?: unknown,
    after?: unknown,
  ): Promise<void> {
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.SPORTS_TOURNAMENT_SCORE,
        entityId: entry.id,
        entityLabel: entry.reason,
        operation,
        actor: {
          name: 'Sistema de pontuação esportiva',
          type: AuditLogActorType.SERVICE,
        },
        before,
        after: after ?? this.automaticScoreEntryAuditSnapshot(entry),
        summary,
        scope: {
          permission: Permission.SportsTournament.Update,
          majorEventId,
        },
        metadata: {
          triggeredById: actorId,
          trigger: 'MATCH_RESULT_APPROVAL',
        },
        force: true,
      },
      tx,
    );
  }

  protected automaticScoreEntryAuditSnapshot(entry: {
    id: string;
    tournamentId: string;
    categoryId: string | null;
    teamId: string;
    sourceMatchId: string | null;
    source: SportsScoreEntrySource;
    points: number;
    reason: string;
    revision: number;
    deletedAt?: Date | null;
  }) {
    return {
      id: entry.id,
      tournamentId: entry.tournamentId,
      categoryId: entry.categoryId,
      teamId: entry.teamId,
      sourceMatchId: entry.sourceMatchId,
      source: entry.source,
      points: entry.points,
      reason: entry.reason,
      revision: entry.revision,
      deletedAt: entry.deletedAt ?? null,
    };
  }

  protected ensureAccumulator(
    accumulators: Map<string, StandingAccumulator>,
    registrationId: string,
  ): StandingAccumulator {
    const current = accumulators.get(registrationId);
    if (current) {
      return current;
    }
    const created: StandingAccumulator = {
      registrationId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      points: 0,
      tiebreakData: {},
      opponentRegistrationIds: [],
    };
    accumulators.set(registrationId, created);
    return created;
  }

  protected standingData(standing: StandingAccumulator, rank: number) {
    return {
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      scoreFor: standing.scoreFor,
      scoreAgainst: standing.scoreAgainst,
      points: standing.points,
      rank,
      tiebreakData: {
        ...standing.tiebreakData,
        scoreDifference: standing.scoreFor - standing.scoreAgainst,
      },
    };
  }

  protected async isPlacementDecidingMatch(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      replayOfMatchId: string | null;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      winnerRegistrationId: string | null;
      winnerAdvancesToId: string | null;
      stage: {
        type: SportsStageType;
        settings: Prisma.JsonValue;
      } | null;
    },
  ): Promise<boolean> {
    if (!match.stage) {
      return false;
    }
    if (match.stage.type === SportsStageType.ELIMINATION && !match.winnerAdvancesToId) {
      return true;
    }
    if (match.stage.type !== SportsStageType.FINAL) {
      return false;
    }
    const resetRule = this.readRecord(this.readRecord(match.stage.settings)['resetRule']);
    const replayRootId = await this.resolveReplayRootId(tx, match);
    if (resetRule['sourceMatchId'] !== replayRootId) {
      return !match.winnerAdvancesToId;
    }
    return planSportsGrandFinalOutcome(match).status === 'CHAMPIONSHIP_DECIDED';
  }

  protected async ensureReplayMatch(
    tx: Prisma.TransactionClient,
    source: {
      id: string;
      event: {
        name: string;
        emoji: string;
        startDate: Date;
        endDate: Date;
        majorEventId: string | null;
        eventGroupId: string | null;
        latitude: number | null;
        longitude: number | null;
        locationDescription: string | null;
      };
      categoryId: string;
      stageId: string | null;
      venueId: string | null;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      roundNumber: number | null;
      bracketPosition: number | null;
      groupKey: string | null;
      winnerAdvancesToId: string | null;
      winnerAdvancesToSide: SportsBracketSide | null;
      loserAdvancesToId: string | null;
      loserAdvancesToSide: SportsBracketSide | null;
    },
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const eventId = this.durableReplayId(source.id, 'event');
    const replayId = this.durableReplayId(source.id, 'match');
    const durationMs = Math.max(60_000, source.event.endDate.getTime() - source.event.startDate.getTime());
    const replayStartDate = source.event.endDate;
    const replayEndDate = new Date(replayStartDate.getTime() + durationMs);
    await tx.event.upsert({
      where: { id: eventId },
      create: {
        id: eventId,
        name: `Revanche — ${source.event.name}`,
        emoji: source.event.emoji,
        startDate: replayStartDate,
        endDate: replayEndDate,
        type: 'OTHER',
        majorEventId: source.event.majorEventId,
        eventGroupId: source.event.eventGroupId,
        latitude: source.event.latitude,
        longitude: source.event.longitude,
        locationDescription: source.event.locationDescription,
        allowSubscription: false,
        shouldCollectAttendance: true,
        publiclyVisible: false,
        publicationState: 'DRAFT',
        createdById: actorId,
        updatedById: actorId,
      },
      update: {},
    });
    const replay = await tx.sportsMatch.upsert({
      where: { replayOfMatchId: source.id },
      create: {
        id: replayId,
        eventId,
        categoryId: source.categoryId,
        stageId: source.stageId,
        venueId: source.venueId,
        homeRegistrationId: source.homeRegistrationId,
        awayRegistrationId: source.awayRegistrationId,
        roundNumber: source.roundNumber,
        bracketPosition: source.bracketPosition,
        groupKey: source.groupKey,
        winnerAdvancesToId: source.winnerAdvancesToId,
        winnerAdvancesToSide: source.winnerAdvancesToSide,
        loserAdvancesToId: source.loserAdvancesToId,
        loserAdvancesToSide: source.loserAdvancesToSide,
        replayOfMatchId: source.id,
        state: SportsMatchState.SCHEDULED,
        canonicalState: SportsMatchState.SCHEDULED,
        reviewStatus: SportsReviewStatus.NOT_REQUIRED,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {},
      include: {
        category: { select: { tournamentId: true } },
        event: {
          select: {
            deletedAt: true,
            publiclyVisible: true,
            publicationState: true,
          },
        },
      },
    });
    return [this.toInvalidation(replay, 'DRAW_REPLAY_CREATED')];
  }

  protected async resolveReplayRootId(
    tx: Prisma.TransactionClient,
    source: { id: string; replayOfMatchId: string | null },
  ): Promise<string> {
    let current = source;
    const visited = new Set<string>();
    while (current.replayOfMatchId) {
      if (visited.has(current.id)) {
        throw new ConflictException('A cadeia de partidas remarcadas contém um ciclo inválido.');
      }
      visited.add(current.id);
      current = await tx.sportsMatch.findUniqueOrThrow({
        where: { id: current.replayOfMatchId },
        select: { id: true, replayOfMatchId: true },
      });
    }
    return current.id;
  }

  protected durableReplayId(sourceMatchId: string, kind: 'event' | 'match'): string {
    const digest = createHash('sha256').update(`sports-replay:${kind}:${sourceMatchId}`).digest('hex');
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  }

  protected toInvalidation(
    match: {
      id: string;
      categoryId: string;
      stageId: string | null;
      category: { tournamentId: string };
      event: {
        deletedAt: Date | null;
        publiclyVisible: boolean;
        publicationState: import('@prisma/client').PublicationState;
      };
    },
    kind: SportsStructuralInvalidation['kind'],
  ): SportsStructuralInvalidation {
    const isPublic =
      match.event.deletedAt === null && match.event.publiclyVisible && match.event.publicationState === 'PUBLISHED';
    return {
      kind,
      tournamentId: match.category.tournamentId,
      categoryId: match.categoryId,
      stageIds: match.stageId ? [match.stageId] : [],
      matchIds: [match.id],
      publicMatchIds: isPublic ? [match.id] : [],
    };
  }

  protected readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  protected readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  protected readOptionalInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }

  protected readPositiveInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
