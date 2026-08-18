import { Injectable } from '@nestjs/common';
import { Prisma, SportsFormat, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
} from '../realtime/sports-structural-invalidation';

import { SportsStandingsQualifiers } from './sports-standings-qualifiers';

@Injectable()
export class SportsStandingsService extends SportsStandingsQualifiers {
  constructor(advancement: SportsBracketAdvancementService, auditLog: AuditLogService) {
    super(advancement, auditLog);
  }

  async reconcileAfterProjectionChange(
    tx: Prisma.TransactionClient,
    matchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        id: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        winnerRegistrationId: true,
        loserRegistrationId: true,
        drawWillReschedule: true,
        categoryId: true,
        category: {
          select: {
            format: true,
            overallScoringRules: true,
            tournamentId: true,
            tournament: { select: { scoringMode: true, majorEventId: true } },
          },
        },
        stageId: true,
        canonicalState: true,
        reviewStatus: true,
      },
    });
    if (
      source.reviewStatus === SportsReviewStatus.APPROVED &&
      ([SportsMatchState.FINISHED, SportsMatchState.DRAW] as SportsMatchState[]).includes(source.canonicalState)
    ) {
      return this.refreshAfterApprovedOutcome(tx, matchId, actorId);
    }
    if (source.stageId) {
      await this.recomputeStage(tx, source.stageId);
    }
    await this.syncAutomaticMatchScoreEntries(tx, source, actorId);
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
    await this.clearAutomaticPlacementScoreEntries(tx, matchId, source.category.tournament.majorEventId, actorId);
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
      !([SportsMatchState.FINISHED, SportsMatchState.DRAW] as SportsMatchState[]).includes(source.canonicalState)
    ) {
      return [];
    }
    await this.syncAutomaticMatchScoreEntries(tx, source, actorId);
    const invalidations: SportsStructuralInvalidation[][] = [];
    if (source.canonicalState === SportsMatchState.DRAW && source.drawWillReschedule === true) {
      invalidations.push(await this.ensureReplayMatch(tx, source, actorId));
    }
    if (source.stageId) {
      await this.recomputeStage(tx, source.stageId);
      if (source.category.format === SportsFormat.ROUND_ROBIN || source.category.format === SportsFormat.SWISS) {
        await this.confirmStandingsPlacementsIfComplete(tx, source, actorId);
      }
    }
    if (source.category.format === SportsFormat.GROUP_STAGE_ELIMINATION) {
      invalidations.push(await this.refreshGroupQualifiers(tx, source.categoryId, actorId));
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
}
