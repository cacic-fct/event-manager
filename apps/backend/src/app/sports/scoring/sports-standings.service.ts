import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  SportsBracketSide,
  SportsFormat,
  SportsMatchState,
  SportsReviewStatus,
  SportsScoreEntrySource,
  SportsScoringMode,
  SportsStageType,
} from '@prisma/client';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import { planSportsGrandFinalOutcome } from '../domain/sports-double-elimination';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
} from '../realtime/sports-structural-invalidation';
import { syncSportsMatchEventName } from '../sports-match-event-sync';

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

@Injectable()
export class SportsStandingsService {
  constructor(
    private readonly advancement: SportsBracketAdvancementService,
  ) {}

  async reconcileAfterProjectionChange(
    tx: Prisma.TransactionClient,
    matchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        categoryId: true,
        category: { select: { format: true } },
        stageId: true,
        canonicalState: true,
        reviewStatus: true,
      },
    });
    if (
      source.reviewStatus === SportsReviewStatus.APPROVED &&
      (
        [
          SportsMatchState.FINISHED,
          SportsMatchState.DRAW,
        ] as SportsMatchState[]
      ).includes(source.canonicalState)
    ) {
      return this.refreshAfterApprovedOutcome(tx, matchId, actorId);
    }
    if (source.stageId) {
      await this.recomputeStage(tx, source.stageId);
    }
    const invalidations =
      source.category.format === SportsFormat.GROUP_STAGE_ELIMINATION
        ? await this.refreshGroupQualifiers(tx, source.categoryId, actorId)
        : [];
    const placements = await tx.sportsCategoryPlacement.findMany({
      where: {
        categoryId: source.categoryId,
        sourceMatchId: matchId,
      },
      select: { id: true },
    });
    if (placements.length > 0) {
      await tx.sportsCategoryPlacement.deleteMany({
        where: { id: { in: placements.map((placement) => placement.id) } },
      });
    }
    await tx.sportsTournamentScoreEntry.updateMany({
      where: {
        sourceMatchId: matchId,
        source: SportsScoreEntrySource.PLACEMENT,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedById: actorId,
        updatedById: actorId,
        revision: { increment: 1 },
      },
    });
    return invalidations;
  }

  async refreshAfterApprovedOutcome(
    tx: Prisma.TransactionClient,
    matchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        event: true,
        stage: true,
        category: {
          include: {
            tournament: true,
          },
        },
      },
    });
    if (
      source.reviewStatus !== SportsReviewStatus.APPROVED ||
      !(
        [
          SportsMatchState.FINISHED,
          SportsMatchState.DRAW,
        ] as SportsMatchState[]
      ).includes(
        source.canonicalState,
      )
    ) {
      return [];
    }
    const invalidations: SportsStructuralInvalidation[][] = [];
    if (
      source.canonicalState === SportsMatchState.DRAW &&
      source.drawWillReschedule === true
    ) {
      invalidations.push(await this.ensureReplayMatch(tx, source, actorId));
    }
    if (source.stageId) {
      await this.recomputeStage(tx, source.stageId);
      if (
        source.category.format === SportsFormat.ROUND_ROBIN ||
        source.category.format === SportsFormat.SWISS
      ) {
        await this.confirmStandingsPlacementsIfComplete(
          tx,
          source,
          actorId,
        );
      }
    }
    if (source.category.format === SportsFormat.GROUP_STAGE_ELIMINATION) {
      invalidations.push(
        await this.refreshGroupQualifiers(tx, source.categoryId, actorId),
      );
    }
    if (
      source.canonicalState === SportsMatchState.FINISHED &&
      source.winnerRegistrationId &&
      source.loserRegistrationId &&
      (await this.isPlacementDecidingMatch(tx, source))
    ) {
      await this.confirmFinalPlacements(tx, source, actorId);
    }
    return mergeSportsStructuralInvalidations(...invalidations);
  }

  private async refreshGroupQualifiers(
    tx: Prisma.TransactionClient,
    categoryId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const invalidations: SportsStructuralInvalidation[][] = [];
    const stages = await tx.sportsStage.findMany({
      where: { categoryId, deletedAt: null },
      include: {
        standings: true,
        matches: {
          where: { deletedAt: null },
          select: {
            id: true,
            state: true,
            canonicalState: true,
            reviewStatus: true,
            homeRegistrationId: true,
            awayRegistrationId: true,
            winnerAdvancesToId: true,
          },
        },
      },
    });
    const groupStages = stages.filter((stage) => {
      const settings = this.readRecord(stage.settings);
      return typeof settings['groupKey'] === 'string';
    });
    const elimination = stages.find((stage) => {
      const settings = this.readRecord(stage.settings);
      return Boolean(settings['qualifierSlotsByMatch']);
    });
    if (
      groupStages.length === 0 ||
      groupStages.some((stage) =>
        stage.matches.some(
          (match) =>
            match.reviewStatus !== SportsReviewStatus.APPROVED ||
            !(
              [
                SportsMatchState.FINISHED,
                SportsMatchState.DRAW,
              ] as SportsMatchState[]
            ).includes(match.canonicalState),
        ),
      )
    ) {
      return elimination
        ? this.clearGroupQualifierAssignments(
            tx,
            elimination,
            groupStages,
            actorId,
          )
        : [];
    }
    if (!elimination) {
      return [];
    }
    const standingByGroupPosition = new Map<string, string>();
    for (const stage of groupStages) {
      const groupKey = this.readRecord(stage.settings)['groupKey'];
      if (typeof groupKey !== 'string') {
        continue;
      }
      for (const standing of stage.standings) {
        if (standing.rank) {
          standingByGroupPosition.set(
            `${groupKey}:${standing.rank}`,
            standing.registrationId,
          );
        }
      }
    }
    const slots = this.readRecord(
      this.readRecord(elimination.settings)['qualifierSlotsByMatch'],
    );
    for (const [matchId, rawSides] of Object.entries(slots)) {
      const sides = this.readRecord(rawSides);
      const home = this.readRecord(sides['home']);
      const away = this.readRecord(sides['away']);
      const homeRegistrationId = this.registrationForGroupSlot(
        home,
        standingByGroupPosition,
      );
      const awayRegistrationId = this.registrationForGroupSlot(
        away,
        standingByGroupPosition,
      );
      const match = await tx.sportsMatch.findUniqueOrThrow({
        where: { id: matchId },
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
      if (match.canonicalState !== SportsMatchState.SCHEDULED) {
        continue;
      }
      const slotChanges = {
        ...(homeRegistrationId && !match.homeRegistrationId
          ? { homeRegistrationId }
          : {}),
        ...(awayRegistrationId && !match.awayRegistrationId
          ? { awayRegistrationId }
          : {}),
      };
      if (Object.keys(slotChanges).length === 0) {
        continue;
      }
      const updated = await tx.sportsMatch.updateMany({
        where: {
          id: match.id,
          revision: match.revision,
          canonicalState: SportsMatchState.SCHEDULED,
          homeRegistrationId: match.homeRegistrationId,
          awayRegistrationId: match.awayRegistrationId,
        },
        data: {
          ...slotChanges,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        continue;
      }
      await syncSportsMatchEventName(tx, match.id, actorId);
      invalidations.push([
        this.toInvalidation(match, 'GROUP_QUALIFIERS_ASSIGNED'),
      ]);
      const automaticWinner =
        home['type'] === 'BYE'
          ? awayRegistrationId
          : away['type'] === 'BYE'
            ? homeRegistrationId
            : null;
      if (automaticWinner) {
        const settled = await tx.sportsMatch.updateMany({
          where: {
            id: match.id,
            revision: match.revision + 1,
            state: SportsMatchState.SCHEDULED,
            canonicalState: SportsMatchState.SCHEDULED,
          },
          data: {
            state: SportsMatchState.FINISHED,
            canonicalState: SportsMatchState.FINISHED,
            reviewStatus: SportsReviewStatus.APPROVED,
            winnerRegistrationId: automaticWinner,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        });
        if (settled.count === 1) {
          invalidations.push(
            await this.advancement.advanceBye(tx, match.id, actorId),
          );
        }
      }
    }
    return mergeSportsStructuralInvalidations(...invalidations);
  }

  private registrationForGroupSlot(
    slot: Record<string, unknown>,
    standingByGroupPosition: ReadonlyMap<string, string>,
  ): string | null {
    return slot['type'] === 'GROUP_POSITION' &&
      typeof slot['groupKey'] === 'string' &&
      typeof slot['groupPosition'] === 'number'
      ? standingByGroupPosition.get(
          `${slot['groupKey']}:${slot['groupPosition']}`,
        ) ?? null
      : null;
  }

  private async clearGroupQualifierAssignments(
    tx: Prisma.TransactionClient,
    elimination: {
      settings: Prisma.JsonValue;
      matches: Array<{
        id: string;
        canonicalState: SportsMatchState;
        homeRegistrationId: string | null;
        awayRegistrationId: string | null;
      }>;
    },
    groupStages: Array<{
      standings: Array<{ registrationId: string }>;
    }>,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const qualifierMatchIds = new Set(
      Object.keys(
        this.readRecord(
          this.readRecord(elimination.settings)['qualifierSlotsByMatch'],
        ),
      ),
    );
    const groupRegistrationIds = new Set(
      groupStages.flatMap((stage) =>
        stage.standings.map((standing) => standing.registrationId),
      ),
    );
    const invalidations: SportsStructuralInvalidation[] = [];
    for (const match of elimination.matches) {
      if (!qualifierMatchIds.has(match.id)) {
        continue;
      }
      const clearHome =
        match.homeRegistrationId !== null &&
        groupRegistrationIds.has(match.homeRegistrationId);
      const clearAway =
        match.awayRegistrationId !== null &&
        groupRegistrationIds.has(match.awayRegistrationId);
      if (!clearHome && !clearAway) {
        continue;
      }
      if (match.canonicalState !== SportsMatchState.SCHEDULED) {
        throw new ConflictException(
          'Redefina a eliminatória iniciada antes de corrigir a fase de grupos.',
        );
      }
      const changed = await tx.sportsMatch.updateMany({
        where: {
          id: match.id,
          canonicalState: SportsMatchState.SCHEDULED,
          homeRegistrationId: match.homeRegistrationId,
          awayRegistrationId: match.awayRegistrationId,
        },
        data: {
          ...(clearHome ? { homeRegistrationId: null } : {}),
          ...(clearAway ? { awayRegistrationId: null } : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'A chave eliminatória mudou durante a reconciliação.',
        );
      }
      await syncSportsMatchEventName(tx, match.id, actorId);
      const current = await tx.sportsMatch.findUniqueOrThrow({
        where: { id: match.id },
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
      invalidations.push(
        this.toInvalidation(current, 'GROUP_QUALIFIERS_ASSIGNED'),
      );
    }
    return invalidations;
  }

  private async recomputeStage(
    tx: Prisma.TransactionClient,
    stageId: string,
  ): Promise<void> {
    const stage = await tx.sportsStage.findUniqueOrThrow({
      where: { id: stageId },
      include: {
        category: { select: { format: true, standingsRules: true } },
        standings: true,
        matches: {
          where: {
            deletedAt: null,
            reviewStatus: SportsReviewStatus.APPROVED,
            canonicalState: {
              in: [SportsMatchState.FINISHED, SportsMatchState.DRAW],
            },
            NOT: {
              canonicalState: SportsMatchState.DRAW,
              drawWillReschedule: true,
            },
          },
        },
      },
    });
    const rules = this.readRecord(stage.category.standingsRules);
    const winPoints = this.readNumber(rules['winPoints'], 3);
    const drawPoints = this.readNumber(rules['drawPoints'], 1);
    const lossPoints = this.readNumber(rules['lossPoints'], 0);
    const byePoints = this.readNumber(rules['byePoints'], 1);
    const accumulators = new Map<string, StandingAccumulator>(
      stage.standings.map((standing) => {
        const byeCount = this.readNumber(
          this.readRecord(standing.tiebreakData)['byeCount'],
          0,
        );
        const tiebreakData = this.readRecord(standing.tiebreakData);
        return [
          standing.registrationId,
          {
            registrationId: standing.registrationId,
            played: byeCount,
            wins: byeCount,
            draws: 0,
            losses: 0,
            scoreFor: 0,
            scoreAgainst: 0,
            points: byeCount * byePoints,
            tiebreakData,
            opponentRegistrationIds: [],
          },
        ];
      }),
    );
    for (const match of stage.matches) {
      if (!match.homeRegistrationId || !match.awayRegistrationId) {
        continue;
      }
      const home = this.ensureAccumulator(accumulators, match.homeRegistrationId);
      const away = this.ensureAccumulator(accumulators, match.awayRegistrationId);
      home.opponentRegistrationIds.push(away.registrationId);
      away.opponentRegistrationIds.push(home.registrationId);
      const score = normalizeSportsScoreboard(match.canonicalScoreboard);
      home.played += 1;
      away.played += 1;
      home.scoreFor += score.home;
      home.scoreAgainst += score.away;
      away.scoreFor += score.away;
      away.scoreAgainst += score.home;
      if (match.canonicalState === SportsMatchState.DRAW) {
        home.draws += 1;
        away.draws += 1;
        home.points += drawPoints;
        away.points += drawPoints;
      } else if (match.winnerRegistrationId === home.registrationId) {
        home.wins += 1;
        away.losses += 1;
        home.points += winPoints;
        away.points += lossPoints;
      } else if (match.winnerRegistrationId === away.registrationId) {
        away.wins += 1;
        home.losses += 1;
        away.points += winPoints;
        home.points += lossPoints;
      }
    }

    for (const standing of accumulators.values()) {
      standing.tiebreakData = {
        ...standing.tiebreakData,
        buchholz: standing.opponentRegistrationIds.reduce(
          (total, registrationId) =>
            total + (accumulators.get(registrationId)?.points ?? 0),
          0,
        ),
      };
    }
    const ranked = [...accumulators.values()].sort(
      (left, right) =>
        right.points - left.points ||
        (stage.category.format === SportsFormat.SWISS
          ? this.readNumber(right.tiebreakData['buchholz'], 0) -
            this.readNumber(left.tiebreakData['buchholz'], 0)
          : 0) ||
        right.scoreFor - right.scoreAgainst - (left.scoreFor - left.scoreAgainst) ||
        right.scoreFor - left.scoreFor ||
        left.registrationId.localeCompare(right.registrationId),
    );
    for (const [index, standing] of ranked.entries()) {
      await tx.sportsStanding.upsert({
        where: {
          stageId_registrationId: {
            stageId,
            registrationId: standing.registrationId,
          },
        },
        create: {
          stageId,
          registrationId: standing.registrationId,
          ...this.standingData(standing, index + 1),
        },
        update: {
          ...this.standingData(standing, index + 1),
          revision: { increment: 1 },
        },
      });
    }
  }

  private async confirmFinalPlacements(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      categoryId: string;
      winnerRegistrationId: string | null;
      loserRegistrationId: string | null;
      category: {
        bracketRules: Prisma.JsonValue;
        tournamentId: string;
        tournament: {
          scoringMode: SportsScoringMode;
        };
      };
    },
    actorId: string,
    rankedRegistrationIds: readonly string[] = [],
  ): Promise<void> {
    const winnerId = match.winnerRegistrationId;
    const loserId = match.loserRegistrationId;
    if (!winnerId || !loserId) {
      return;
    }
    const bracketRules = this.readRecord(match.category.bracketRules);
    const placementPoints = this.readRecord(bracketRules['placementPoints']);
    const firstPoints = this.readOptionalInteger(placementPoints['1']);
    const secondPoints = this.readOptionalInteger(placementPoints['2']);
    const effectiveRanking =
      rankedRegistrationIds.length > 0
        ? rankedRegistrationIds
        : [winnerId, loserId];
    const placements = effectiveRanking.map((registrationId, index) => {
      const placement = index + 1;
      return {
        registrationId,
        placement,
        pointsAwarded:
          placement === 1
            ? firstPoints
            : placement === 2
              ? secondPoints
              : this.readOptionalInteger(placementPoints[String(placement)]),
      };
    });
    const existingPlacements = await tx.sportsCategoryPlacement.findMany({
      where: {
        categoryId: match.categoryId,
        registrationId: {
          in: placements.map((placement) => placement.registrationId),
        },
      },
    });
    if (
      placements.every((placement) =>
        existingPlacements.some(
          (existing) =>
            existing.registrationId === placement.registrationId &&
            existing.sourceMatchId === match.id &&
            existing.placement === placement.placement &&
            existing.pointsAwarded === placement.pointsAwarded &&
            existing.confirmedAt !== null,
        ),
      )
    ) {
      return;
    }
    for (const placement of placements) {
      await tx.sportsCategoryPlacement.upsert({
        where: {
          categoryId_registrationId: {
            categoryId: match.categoryId,
            registrationId: placement.registrationId,
          },
        },
        create: {
          categoryId: match.categoryId,
          registrationId: placement.registrationId,
          sourceMatchId: match.id,
          placement: placement.placement,
          pointsAwarded: placement.pointsAwarded,
          confirmedAt: new Date(),
          confirmedById: actorId,
        },
        update: {
          sourceMatchId: match.id,
          placement: placement.placement,
          pointsAwarded: placement.pointsAwarded,
          confirmedAt: new Date(),
          confirmedById: actorId,
        },
      });
    }
    if (
      match.category.tournament.scoringMode === SportsScoringMode.PER_SPORT
    ) {
      return;
    }
    const registrations = await tx.sportsRegistration.findMany({
      where: {
        id: {
          in: placements.map((placement) => placement.registrationId),
        },
      },
      select: { id: true, teamId: true },
    });
    const teamByRegistration = new Map(
      registrations.map((registration) => [registration.id, registration.teamId]),
    );
    await tx.sportsTournamentScoreEntry.updateMany({
      where: {
        tournamentId: match.category.tournamentId,
        categoryId: match.categoryId,
        source: SportsScoreEntrySource.PLACEMENT,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedById: actorId,
      },
    });
    const scoreEntries = placements.flatMap((placement) => {
      const teamId = teamByRegistration.get(placement.registrationId);
      return teamId && placement.pointsAwarded !== null
        ? [
            {
              tournamentId: match.category.tournamentId,
              categoryId: match.categoryId,
              teamId,
              sourceMatchId: match.id,
              source: SportsScoreEntrySource.PLACEMENT,
              points: placement.pointsAwarded,
              reason: `${placement.placement}º lugar`,
              createdById: actorId,
            },
          ]
        : [];
    });
    if (scoreEntries.length > 0) {
      await tx.sportsTournamentScoreEntry.createMany({ data: scoreEntries });
    }
  }

  private async confirmStandingsPlacementsIfComplete(
    tx: Prisma.TransactionClient,
    source: {
      id: string;
      stageId: string | null;
      categoryId: string;
      category: {
        format: SportsFormat;
        bracketRules: Prisma.JsonValue;
        tournamentId: string;
        tournament: {
          scoringMode: SportsScoringMode;
        };
      };
    },
    actorId: string,
  ): Promise<void> {
    if (!source.stageId) {
      return;
    }
    const stage = await tx.sportsStage.findUniqueOrThrow({
      where: { id: source.stageId },
      include: {
        standings: {
          where: { rank: { not: null } },
          orderBy: [{ rank: 'asc' }, { registrationId: 'asc' }],
        },
        matches: {
          where: { deletedAt: null },
          select: {
            id: true,
            roundNumber: true,
            bracketPosition: true,
            canonicalState: true,
            reviewStatus: true,
          },
        },
      },
    });
    const complete =
      stage.matches.length > 0 &&
      stage.matches.every(
        (match) =>
          match.reviewStatus === SportsReviewStatus.APPROVED &&
          (
            [
              SportsMatchState.FINISHED,
              SportsMatchState.DRAW,
            ] as SportsMatchState[]
          ).includes(match.canonicalState),
      );
    if (!complete || stage.standings.length < 2) {
      return;
    }
    if (source.category.format === SportsFormat.SWISS) {
      const maximumRounds = this.readPositiveInteger(
        this.readRecord(stage.settings)['maximumRounds'],
        1,
      );
      const completedRounds = stage.matches.reduce(
        (highest, match) => Math.max(highest, match.roundNumber ?? 0),
        0,
      );
      if (completedRounds < maximumRounds) {
        return;
      }
    }
    const placementSource = [...stage.matches].sort(
      (left, right) =>
        (right.roundNumber ?? 0) - (left.roundNumber ?? 0) ||
        (right.bracketPosition ?? 0) - (left.bracketPosition ?? 0) ||
        right.id.localeCompare(left.id),
    )[0];
    await this.confirmFinalPlacements(
      tx,
      {
        id: placementSource.id,
        categoryId: source.categoryId,
        winnerRegistrationId: stage.standings[0].registrationId,
        loserRegistrationId: stage.standings[1].registrationId,
        category: source.category,
      },
      actorId,
      stage.standings.map((standing) => standing.registrationId),
    );
  }

  private ensureAccumulator(
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

  private standingData(standing: StandingAccumulator, rank: number) {
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

  private async isPlacementDecidingMatch(
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
    if (
      match.stage.type === SportsStageType.ELIMINATION &&
      !match.winnerAdvancesToId
    ) {
      return true;
    }
    if (match.stage.type !== SportsStageType.FINAL) {
      return false;
    }
    const resetRule = this.readRecord(
      this.readRecord(match.stage.settings)['resetRule'],
    );
    const replayRootId = await this.resolveReplayRootId(tx, match);
    if (resetRule['sourceMatchId'] !== replayRootId) {
      return !match.winnerAdvancesToId;
    }
    return (
      planSportsGrandFinalOutcome(match).status === 'CHAMPIONSHIP_DECIDED'
    );
  }

  private async ensureReplayMatch(
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
    const durationMs = Math.max(
      60_000,
      source.event.endDate.getTime() - source.event.startDate.getTime(),
    );
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

  private async resolveReplayRootId(
    tx: Prisma.TransactionClient,
    source: { id: string; replayOfMatchId: string | null },
  ): Promise<string> {
    let current = source;
    const visited = new Set<string>();
    while (current.replayOfMatchId) {
      if (visited.has(current.id)) {
        throw new ConflictException(
          'A cadeia de partidas remarcadas contém um ciclo inválido.',
        );
      }
      visited.add(current.id);
      current = await tx.sportsMatch.findUniqueOrThrow({
        where: { id: current.replayOfMatchId },
        select: { id: true, replayOfMatchId: true },
      });
    }
    return current.id;
  }

  private durableReplayId(sourceMatchId: string, kind: 'event' | 'match'): string {
    const digest = createHash('sha256')
      .update(`sports-replay:${kind}:${sourceMatchId}`)
      .digest('hex');
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  }

  private toInvalidation(
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
      match.event.deletedAt === null &&
      match.event.publiclyVisible &&
      match.event.publicationState === 'PUBLISHED';
    return {
      kind,
      tournamentId: match.category.tournamentId,
      categoryId: match.categoryId,
      stageIds: match.stageId ? [match.stageId] : [],
      matchIds: [match.id],
      publicMatchIds: isPublic ? [match.id] : [],
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readOptionalInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }

  private readPositiveInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }
}
