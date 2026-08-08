import {
  Prisma,
  SportsFormat,
  SportsMatchState,
  SportsReviewStatus,
  SportsScoreEntrySource,
  SportsScoringMode
} from '@prisma/client';

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
        updatedById: actorId,
        revision: {
          increment: 1,
        },
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

  protected async confirmStandingsPlacementsIfComplete(
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

}




