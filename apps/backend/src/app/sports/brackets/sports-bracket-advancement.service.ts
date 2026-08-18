import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SportsBracketSide, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { planSportsWinnerAdvancement } from '../domain/sports-brackets';
import { planSportsGrandFinalOutcome } from '../domain/sports-double-elimination';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';
import { SportsMatchRosterService } from '../rosters/sports-match-roster.service';

import { SportsBracketAdvancementAssignments } from './sports-bracket-advancement-assignments';

@Injectable()
export class SportsBracketAdvancementService extends SportsBracketAdvancementAssignments {
  constructor(rosters: SportsMatchRosterService) {
    super(rosters);
  }

  async reconcileAfterProjectionChange(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: sourceMatchId },
      include: {
        winnerAdvancesTo: true,
        loserAdvancesTo: true,
      },
    });
    if (
      source.reviewStatus === SportsReviewStatus.APPROVED &&
      source.canonicalState === SportsMatchState.FINISHED &&
      source.winnerRegistrationId
    ) {
      return this.advanceApprovedOutcome(tx, sourceMatchId, actorId);
    }
    const sourceRegistrationIds = [source.homeRegistrationId, source.awayRegistrationId].filter((id): id is string =>
      Boolean(id),
    );
    const invalidations: SportsStructuralInvalidation[][] = [];
    if (source.winnerAdvancesToId && source.winnerAdvancesToSide) {
      invalidations.push(
        await this.clearSourceAssignment(
          tx,
          source.id,
          source.winnerAdvancesToId,
          source.winnerAdvancesToSide,
          sourceRegistrationIds,
          actorId,
        ),
      );
    }
    if (source.loserAdvancesToId && source.loserAdvancesToSide) {
      invalidations.push(
        await this.clearSourceAssignment(
          tx,
          source.id,
          source.loserAdvancesToId,
          source.loserAdvancesToSide,
          sourceRegistrationIds,
          actorId,
        ),
      );
    }
    return mergeSportsStructuralInvalidations(...invalidations);
  }

  async advanceApprovedOutcome(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: sourceMatchId },
      include: {
        winnerAdvancesTo: true,
        loserAdvancesTo: true,
        stage: true,
      },
    });
    if (
      source.canonicalState !== SportsMatchState.FINISHED ||
      source.reviewStatus !== SportsReviewStatus.APPROVED ||
      !source.winnerRegistrationId
    ) {
      return [];
    }

    const resetRule = this.readResetRule(source.stage?.settings);
    const replayRootId = resetRule ? await this.resolveReplayRootId(tx, source) : source.id;
    if (resetRule?.sourceMatchId === replayRootId) {
      const resetPlan = planSportsGrandFinalOutcome(source);
      if (resetPlan.status === 'BLOCKED') {
        throw new ConflictException('A grande final não pôde ser concluída porque seus participantes mudaram.');
      }
      if (resetPlan.status === 'CHAMPIONSHIP_DECIDED') {
        return this.reconcileGrandFinalResetMatch(tx, source, resetRule.resetMatchId, null, null, actorId);
      }
      return this.reconcileGrandFinalResetMatch(
        tx,
        source,
        resetRule.resetMatchId,
        resetPlan.resetHomeRegistrationId,
        resetPlan.resetAwayRegistrationId,
        actorId,
      );
    }

    const invalidations: SportsStructuralInvalidation[][] = [];
    const advancementKind: SportsStructuralInvalidationKind = 'BRACKET_ADVANCEMENT';
    if (source.winnerAdvancesToId && source.winnerAdvancesToSide) {
      const plan = planSportsWinnerAdvancement({
        source: {
          id: source.id,
          outcome: 'FINALIZED',
          state: source.canonicalState,
          homeRegistrationId: source.homeRegistrationId,
          awayRegistrationId: source.awayRegistrationId,
          winnerRegistrationId: source.winnerRegistrationId,
          winnerAdvancesToId: source.winnerAdvancesToId,
          winnerAdvancesToSide: source.winnerAdvancesToSide,
        },
        target: source.winnerAdvancesTo
          ? {
              ...source.winnerAdvancesTo,
              state: source.winnerAdvancesTo.canonicalState,
            }
          : null,
      });
      if (
        plan.status === 'CONFLICT' &&
        [source.homeRegistrationId, source.awayRegistrationId].includes(plan.occupyingRegistrationId)
      ) {
        invalidations.push(
          await this.clearSourceAssignment(
            tx,
            source.id,
            plan.targetMatchId,
            plan.side as SportsBracketSide,
            [source.homeRegistrationId, source.awayRegistrationId].filter((id): id is string => Boolean(id)),
            actorId,
          ),
        );
        invalidations.push(
          await this.assignRegistration(
            tx,
            plan.targetMatchId,
            plan.side as SportsBracketSide,
            plan.registrationId,
            actorId,
            advancementKind,
          ),
        );
        await this.rosters.copyApprovedRosterForWinner(tx, source.id, plan.targetMatchId, plan.registrationId, actorId);
      } else if (plan.status === 'CONFLICT' || plan.status === 'BLOCKED') {
        throw new ConflictException('O vencedor não pôde avançar automaticamente porque a próxima chave mudou.');
      } else if (plan.status === 'ASSIGN') {
        invalidations.push(
          await this.assignRegistration(
            tx,
            plan.targetMatchId,
            plan.side as SportsBracketSide,
            plan.registrationId,
            actorId,
            advancementKind,
          ),
        );
        await this.rosters.copyApprovedRosterForWinner(tx, source.id, plan.targetMatchId, plan.registrationId, actorId);
      } else if (plan.status !== 'NOOP') {
        throw new ConflictException('O vencedor não pôde avançar automaticamente porque a próxima chave mudou.');
      } else {
        invalidations.push(await this.invalidationForMatch(tx, plan.targetMatchId, advancementKind));
      }
    }

    if (source.loserRegistrationId && source.loserAdvancesToId && source.loserAdvancesToSide) {
      const currentLoserTargetRegistrationId =
        source.loserAdvancesToSide === SportsBracketSide.HOME
          ? source.loserAdvancesTo?.homeRegistrationId
          : source.loserAdvancesTo?.awayRegistrationId;
      if (currentLoserTargetRegistrationId && currentLoserTargetRegistrationId !== source.loserRegistrationId) {
        invalidations.push(
          await this.clearSourceAssignment(
            tx,
            source.id,
            source.loserAdvancesToId,
            source.loserAdvancesToSide,
            [source.homeRegistrationId, source.awayRegistrationId].filter((id): id is string => Boolean(id)),
            actorId,
          ),
        );
      }
      invalidations.push(
        await this.assignRegistration(
          tx,
          source.loserAdvancesToId,
          source.loserAdvancesToSide,
          source.loserRegistrationId,
          actorId,
          advancementKind,
        ),
      );
      await this.rosters.copyApprovedRosterForWinner(
        tx,
        source.id,
        source.loserAdvancesToId,
        source.loserRegistrationId,
        actorId,
      );
    }
    return mergeSportsStructuralInvalidations(...invalidations);
  }

  async advanceBye(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const source = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: sourceMatchId },
      include: { winnerAdvancesTo: true },
    });
    if (!source.winnerRegistrationId || !source.winnerAdvancesToId || !source.winnerAdvancesToSide) {
      return [];
    }
    const plan = planSportsWinnerAdvancement({
      source: {
        id: source.id,
        outcome: 'AUTOMATIC_BYE',
        state: source.canonicalState,
        homeRegistrationId: source.homeRegistrationId,
        awayRegistrationId: source.awayRegistrationId,
        winnerRegistrationId: source.winnerRegistrationId,
        winnerAdvancesToId: source.winnerAdvancesToId,
        winnerAdvancesToSide: source.winnerAdvancesToSide,
      },
      target: source.winnerAdvancesTo
        ? {
            ...source.winnerAdvancesTo,
            state: source.winnerAdvancesTo.canonicalState,
          }
        : null,
    });
    if (plan.status === 'ASSIGN') {
      return this.assignRegistration(
        tx,
        plan.targetMatchId,
        plan.side as SportsBracketSide,
        plan.registrationId,
        actorId,
        'STRUCTURAL_BYE_ADVANCED',
      );
    }
    if (plan.status !== 'NOOP') {
      throw new ConflictException('A vaga automática não pôde avançar porque a próxima chave mudou.');
    }
    return this.invalidationForMatch(tx, plan.targetMatchId, 'STRUCTURAL_BYE_ADVANCED');
  }
}
