import { Prisma, SportsFormat, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { DEFAULT_SPORTS_STANDINGS_RULES } from '@cacic-fct/shared-data-types';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';

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

import { SportsStandingsPlacement } from './sports-standings-placement';

export abstract class SportsStandingsComputation extends SportsStandingsPlacement {
  protected async recomputeStage(tx: Prisma.TransactionClient, stageId: string): Promise<void> {
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
    const winPoints = this.readNumber(rules['winPoints'], DEFAULT_SPORTS_STANDINGS_RULES.winPoints);
    const drawPoints = this.readNumber(rules['drawPoints'], DEFAULT_SPORTS_STANDINGS_RULES.drawPoints);
    const lossPoints = this.readNumber(rules['lossPoints'], DEFAULT_SPORTS_STANDINGS_RULES.lossPoints);
    const byePoints = this.readNumber(rules['byePoints'], DEFAULT_SPORTS_STANDINGS_RULES.byePoints);
    const accumulators = new Map<string, StandingAccumulator>(
      stage.standings.map((standing) => {
        const byeCount = this.readNumber(this.readRecord(standing.tiebreakData)['byeCount'], 0);
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
          (total, registrationId) => total + (accumulators.get(registrationId)?.points ?? 0),
          0,
        ),
      };
    }
    const ranked = [...accumulators.values()].sort(
      (left, right) =>
        right.points - left.points ||
        (stage.category.format === SportsFormat.SWISS
          ? this.readNumber(right.tiebreakData['buchholz'], 0) - this.readNumber(left.tiebreakData['buchholz'], 0)
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
}
