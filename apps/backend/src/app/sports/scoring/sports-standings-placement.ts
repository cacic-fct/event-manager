import {
  Prisma,
  AuditLogOperation,
  SportsFormat,
  SportsMatchState,
  SportsReviewStatus,
  SportsScoreEntrySource,
  SportsScoringMode,
} from '@prisma/client';
import {
  normalizeSportsOverallScoringRules,
  sportsOverallScoringUsesFinalPlacement,
  sportsOverallScoringUsesMatchResult,
} from '../domain/sports-overall-scoring';

import { SportsStandingsSupport } from './sports-standings-support';

export abstract class SportsStandingsPlacement extends SportsStandingsSupport {
  protected async confirmFinalPlacements(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      categoryId: string;
      winnerRegistrationId: string | null;
      loserRegistrationId: string | null;
      category: {
        bracketRules: Prisma.JsonValue;
        overallScoringRules: Prisma.JsonValue;
        tournamentId: string;
        tournament: {
          scoringMode: SportsScoringMode;
          majorEventId: string;
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
    const overallRules = normalizeSportsOverallScoringRules(
      match.category.overallScoringRules,
      this.readRecord(bracketRules['placementPoints']),
    );
    const placementScoringEnabled = sportsOverallScoringUsesFinalPlacement(overallRules.mode);
    const effectiveRanking = rankedRegistrationIds.length > 0 ? rankedRegistrationIds : [winnerId, loserId];
    const placements = effectiveRanking.map((registrationId, index) => {
      const placement = index + 1;
      return {
        registrationId,
        placement,
        pointsAwarded: placementScoringEnabled ? (overallRules.placement[String(placement)] ?? null) : null,
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
    const placementsUnchanged =
      placements.every((placement) =>
        existingPlacements.some(
          (existing) =>
            existing.registrationId === placement.registrationId &&
            existing.sourceMatchId === match.id &&
            existing.placement === placement.placement &&
            existing.pointsAwarded === placement.pointsAwarded &&
            existing.confirmedAt !== null,
        ),
      );
    if (!placementsUnchanged) {
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
    }
    await this.syncFinalPlacementScoreEntries(tx, match, placements, actorId);
  }

  protected async syncFinalPlacementScoreEntries(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      categoryId: string;
      category: {
        tournamentId: string;
        tournament: { majorEventId: string };
      };
    },
    placements: ReadonlyArray<{
      registrationId: string;
      placement: number;
      pointsAwarded: number | null;
    }>,
    actorId: string,
  ): Promise<void> {
    const registrations = await tx.sportsRegistration.findMany({
      where: {
        id: {
          in: placements.map((placement) => placement.registrationId),
        },
      },
      select: { id: true, teamId: true },
    });
    const teamByRegistration = new Map(registrations.map((registration) => [registration.id, registration.teamId]));
    const existingEntries = await tx.sportsTournamentScoreEntry.findMany({
      where: {
        tournamentId: match.category.tournamentId,
        categoryId: match.categoryId,
        source: SportsScoreEntrySource.PLACEMENT,
        deletedAt: null,
      },
    });
    const desiredEntries = placements.flatMap((placement) => {
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
            },
          ]
        : [];
    });
    const unchanged =
      existingEntries.length === desiredEntries.length &&
      desiredEntries.every((desired) =>
        existingEntries.some(
          (existing) =>
            existing.teamId === desired.teamId &&
            existing.sourceMatchId === desired.sourceMatchId &&
            existing.points === desired.points &&
            existing.reason === desired.reason,
        ),
      );
    if (unchanged) {
      return;
    }
    const deletedAt = new Date();
    if (existingEntries.length > 0) {
      await tx.sportsTournamentScoreEntry.updateMany({
        where: {
          id: { in: existingEntries.map((entry) => entry.id) },
          deletedAt: null,
        },
        data: {
          deletedAt,
          deletedById: actorId,
          updatedById: actorId,
          revision: {
            increment: 1,
          },
        },
      });
      for (const entry of existingEntries) {
        await this.recordAutomaticScoreEntryAudit(
          tx,
          entry,
          AuditLogOperation.DELETE,
          'Pontuação automática de colocação substituída.',
          actorId,
          match.category.tournament.majorEventId,
          this.automaticScoreEntryAuditSnapshot(entry),
          this.automaticScoreEntryAuditSnapshot({ ...entry, deletedAt, revision: entry.revision + 1 }),
        );
      }
    }
    if (desiredEntries.length === 0) {
      return;
    }
    await tx.sportsTournamentScoreEntry.createMany({
      data: desiredEntries.map((entry) => ({
        ...entry,
        createdById: actorId,
        updatedById: actorId,
      })),
    });
    const createdEntries = await tx.sportsTournamentScoreEntry.findMany({
      where: {
        tournamentId: match.category.tournamentId,
        categoryId: match.categoryId,
        source: SportsScoreEntrySource.PLACEMENT,
        sourceMatchId: match.id,
        deletedAt: null,
      },
    });
    for (const entry of createdEntries) {
      await this.recordAutomaticScoreEntryAudit(
        tx,
        entry,
        AuditLogOperation.CREATE,
        'Pontuação automática de colocação registrada.',
        actorId,
        match.category.tournament.majorEventId,
        undefined,
        this.automaticScoreEntryAuditSnapshot(entry),
      );
    }
  }

  protected async syncAutomaticMatchScoreEntries(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      categoryId: string;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      winnerRegistrationId: string | null;
      loserRegistrationId: string | null;
      drawWillReschedule: boolean | null;
      canonicalState: SportsMatchState;
      category: {
        overallScoringRules: Prisma.JsonValue;
        tournamentId: string;
        tournament: {
          scoringMode: SportsScoringMode;
          majorEventId: string;
        };
      };
    },
    actorId: string,
  ): Promise<void> {
    const rules =
      match.category.tournament.scoringMode === SportsScoringMode.PER_SPORT
        ? normalizeSportsOverallScoringRules({ mode: 'NONE' })
        : normalizeSportsOverallScoringRules(match.category.overallScoringRules);
    const desired: Array<{
      registrationId: string;
      points: number;
      reason: string;
    }> = [];
    if (
      sportsOverallScoringUsesMatchResult(rules.mode) &&
      match.drawWillReschedule !== true &&
      match.canonicalState === SportsMatchState.DRAW
    ) {
      for (const registrationId of [match.homeRegistrationId, match.awayRegistrationId]) {
        if (registrationId && rules.match.draw > 0) {
          desired.push({ registrationId, points: rules.match.draw, reason: 'Empate na partida' });
        }
      }
    } else if (
      sportsOverallScoringUsesMatchResult(rules.mode) &&
      match.canonicalState === SportsMatchState.FINISHED
    ) {
      if (match.winnerRegistrationId && rules.match.win > 0) {
        desired.push({
          registrationId: match.winnerRegistrationId,
          points: rules.match.win,
          reason: 'Vitória na partida',
        });
      }
      if (match.loserRegistrationId && rules.match.loss > 0) {
        desired.push({
          registrationId: match.loserRegistrationId,
          points: rules.match.loss,
          reason: 'Derrota na partida',
        });
      }
    }
    const registrations = await tx.sportsRegistration.findMany({
      where: { id: { in: desired.map((entry) => entry.registrationId) } },
      select: { id: true, teamId: true },
    });
    const teamByRegistration = new Map(registrations.map((registration) => [registration.id, registration.teamId]));
    const desiredEntries = desired.flatMap((entry) => {
      const teamId = teamByRegistration.get(entry.registrationId);
      return teamId ? [{ teamId, points: entry.points, reason: entry.reason }] : [];
    });
    const existingEntries = await tx.sportsTournamentScoreEntry.findMany({
      where: {
        tournamentId: match.category.tournamentId,
        categoryId: match.categoryId,
        sourceMatchId: match.id,
        source: SportsScoreEntrySource.MATCH,
        deletedAt: null,
      },
    });
    const unchanged =
      existingEntries.length === desiredEntries.length &&
      desiredEntries.every((desiredEntry) =>
        existingEntries.some(
          (existing) =>
            existing.teamId === desiredEntry.teamId &&
            existing.points === desiredEntry.points &&
            existing.reason === desiredEntry.reason,
        ),
      );
    if (unchanged) {
      return;
    }
    const deletedAt = new Date();
    if (existingEntries.length > 0) {
      await tx.sportsTournamentScoreEntry.updateMany({
        where: {
          id: { in: existingEntries.map((entry) => entry.id) },
          deletedAt: null,
        },
        data: {
          deletedAt,
          deletedById: actorId,
          updatedById: actorId,
          revision: { increment: 1 },
        },
      });
      for (const entry of existingEntries) {
        await this.recordAutomaticScoreEntryAudit(
          tx,
          entry,
          AuditLogOperation.DELETE,
          'Pontuação automática da partida substituída.',
          actorId,
          match.category.tournament.majorEventId,
          this.automaticScoreEntryAuditSnapshot(entry),
          this.automaticScoreEntryAuditSnapshot({ ...entry, deletedAt, revision: entry.revision + 1 }),
        );
      }
    }
    for (const entry of desiredEntries) {
      const created = await tx.sportsTournamentScoreEntry.create({
        data: {
          tournamentId: match.category.tournamentId,
          categoryId: match.categoryId,
          teamId: entry.teamId,
          sourceMatchId: match.id,
          source: SportsScoreEntrySource.MATCH,
          points: entry.points,
          reason: entry.reason,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.recordAutomaticScoreEntryAudit(
        tx,
        created,
        AuditLogOperation.CREATE,
        'Pontuação automática da partida registrada.',
        actorId,
        match.category.tournament.majorEventId,
        undefined,
        this.automaticScoreEntryAuditSnapshot(created),
      );
    }
  }

  protected async clearAutomaticPlacementScoreEntries(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    majorEventId: string,
    actorId: string,
  ): Promise<void> {
    const entries = await tx.sportsTournamentScoreEntry.findMany({
      where: {
        sourceMatchId,
        source: SportsScoreEntrySource.PLACEMENT,
        deletedAt: null,
      },
    });
    if (entries.length === 0) {
      return;
    }
    const deletedAt = new Date();
    await tx.sportsTournamentScoreEntry.updateMany({
      where: {
        id: { in: entries.map((entry) => entry.id) },
        deletedAt: null,
      },
      data: {
        deletedAt,
        deletedById: actorId,
        updatedById: actorId,
        revision: { increment: 1 },
      },
    });
    for (const entry of entries) {
      await this.recordAutomaticScoreEntryAudit(
        tx,
        entry,
        AuditLogOperation.DELETE,
        'Pontuação automática de colocação removida após a revisão do resultado.',
        actorId,
        majorEventId,
        this.automaticScoreEntryAuditSnapshot(entry),
        this.automaticScoreEntryAuditSnapshot({ ...entry, deletedAt, revision: entry.revision + 1 }),
      );
    }
  }

  protected async confirmStandingsPlacementsIfComplete(
    tx: Prisma.TransactionClient,
    source: {
      id: string;
      stageId: string | null;
      categoryId: string;
      category: {
        format: SportsFormat;
        bracketRules: Prisma.JsonValue;
        overallScoringRules: Prisma.JsonValue;
        tournamentId: string;
        tournament: {
          scoringMode: SportsScoringMode;
          majorEventId: string;
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
          ([SportsMatchState.FINISHED, SportsMatchState.DRAW] as SportsMatchState[]).includes(match.canonicalState),
      );
    if (!complete || stage.standings.length < 2) {
      return;
    }
    if (source.category.format === SportsFormat.SWISS) {
      const maximumRounds = this.readPositiveInteger(this.readRecord(stage.settings)['maximumRounds'], 1);
      const completedRounds = stage.matches.reduce((highest, match) => Math.max(highest, match.roundNumber ?? 0), 0);
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
}
