import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  PublicationState,
  SportsBracketSide,
  SportsMatchState,
  SportsReviewStatus,
} from '@prisma/client';
import { planSportsWinnerAdvancement } from '../domain/sports-brackets';
import { planSportsGrandFinalOutcome } from '../domain/sports-double-elimination';
import { SportsMatchRosterService } from '../rosters/sports-match-roster.service';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';
import { syncSportsMatchEventName } from '../sports-match-event-sync';

@Injectable()
export class SportsBracketAdvancementService {
  constructor(private readonly rosters: SportsMatchRosterService) {}

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
    const sourceRegistrationIds = [
      source.homeRegistrationId,
      source.awayRegistrationId,
    ].filter((id): id is string => Boolean(id));
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
    const replayRootId = resetRule
      ? await this.resolveReplayRootId(tx, source)
      : source.id;
    if (resetRule?.sourceMatchId === replayRootId) {
      const resetPlan = planSportsGrandFinalOutcome(source);
      if (resetPlan.status === 'BLOCKED') {
        throw new ConflictException(
          'A grande final não pôde ser concluída porque seus participantes mudaram.',
        );
      }
      if (resetPlan.status === 'CHAMPIONSHIP_DECIDED') {
        return this.reconcileGrandFinalResetMatch(
          tx,
          source,
          resetRule.resetMatchId,
          null,
          null,
          actorId,
        );
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
    const advancementKind: SportsStructuralInvalidationKind =
      resetRule?.sourceMatchId === replayRootId
        ? 'GRAND_FINAL_RESET_ACTIVATED'
        : 'BRACKET_ADVANCEMENT';
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
        [source.homeRegistrationId, source.awayRegistrationId].includes(
          plan.occupyingRegistrationId,
        )
      ) {
        invalidations.push(
          await this.clearSourceAssignment(
            tx,
            source.id,
            plan.targetMatchId,
            plan.side as SportsBracketSide,
            [
              source.homeRegistrationId,
              source.awayRegistrationId,
            ].filter((id): id is string => Boolean(id)),
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
        await this.rosters.copyApprovedRosterForWinner(
          tx,
          source.id,
          plan.targetMatchId,
          plan.registrationId,
          actorId,
        );
      } else if (plan.status === 'CONFLICT' || plan.status === 'BLOCKED') {
        throw new ConflictException(
          'O vencedor não pôde avançar automaticamente porque a próxima chave mudou.',
        );
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
        await this.rosters.copyApprovedRosterForWinner(
          tx,
          source.id,
          plan.targetMatchId,
          plan.registrationId,
          actorId,
        );
      } else if (plan.status !== 'NOOP') {
        throw new ConflictException(
          'O vencedor não pôde avançar automaticamente porque a próxima chave mudou.',
        );
      } else {
        invalidations.push(
          await this.invalidationForMatch(
            tx,
            plan.targetMatchId,
            advancementKind,
          ),
        );
      }
    }

    if (
      source.loserRegistrationId &&
      source.loserAdvancesToId &&
      source.loserAdvancesToSide
    ) {
      const currentLoserTargetRegistrationId =
        source.loserAdvancesToSide === SportsBracketSide.HOME
          ? source.loserAdvancesTo?.homeRegistrationId
          : source.loserAdvancesTo?.awayRegistrationId;
      if (
        currentLoserTargetRegistrationId &&
        currentLoserTargetRegistrationId !== source.loserRegistrationId
      ) {
        invalidations.push(
          await this.clearSourceAssignment(
            tx,
            source.id,
            source.loserAdvancesToId,
            source.loserAdvancesToSide,
            [
              source.homeRegistrationId,
              source.awayRegistrationId,
            ].filter((id): id is string => Boolean(id)),
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
      throw new ConflictException(
        'A vaga automática não pôde avançar porque a próxima chave mudou.',
      );
    }
    return this.invalidationForMatch(
      tx,
      plan.targetMatchId,
      'STRUCTURAL_BYE_ADVANCED',
    );
  }

  private async assignRegistration(
    tx: Prisma.TransactionClient,
    matchId: string,
    side: SportsBracketSide,
    registrationId: string,
    actorId: string,
    kind: SportsStructuralInvalidationKind,
  ): Promise<SportsStructuralInvalidation[]> {
    const slot =
      side === SportsBracketSide.HOME
        ? { homeRegistrationId: registrationId }
        : { awayRegistrationId: registrationId };
    const emptySlotWhere =
      side === SportsBracketSide.HOME
        ? { homeRegistrationId: null }
        : { awayRegistrationId: null };
    const updated = await tx.sportsMatch.updateMany({
      where: {
        id: matchId,
        canonicalState: SportsMatchState.SCHEDULED,
        ...emptySlotWhere,
      },
      data: {
        ...slot,
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    const current = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        stage: true,
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
    if (updated.count !== 1) {
      const currentRegistrationId =
        side === SportsBracketSide.HOME
          ? current.homeRegistrationId
          : current.awayRegistrationId;
      if (currentRegistrationId !== registrationId) {
        throw new ConflictException(
          'A vaga da chave foi alterada e exige revisão de um administrador.',
        );
      }
    }
    await syncSportsMatchEventName(tx, matchId, actorId);
    return mergeSportsStructuralInvalidations(
      [this.toInvalidation(current, kind)],
      await this.settleStructuralByeIfReady(tx, current, actorId),
    );
  }

  private async clearSourceAssignment(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    targetMatchId: string,
    side: SportsBracketSide,
    sourceRegistrationIds: readonly string[],
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const target = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: targetMatchId },
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
    const currentRegistrationId =
      side === SportsBracketSide.HOME
        ? target.homeRegistrationId
        : target.awayRegistrationId;
    if (
      !currentRegistrationId ||
      !sourceRegistrationIds.includes(currentRegistrationId)
    ) {
      return [];
    }
    if (target.canonicalState !== SportsMatchState.SCHEDULED) {
      throw new ConflictException(
        'A correção exige redefinir primeiro a partida seguinte já iniciada.',
      );
    }
    const cleared = await tx.sportsMatch.updateMany({
      where: {
        id: target.id,
        canonicalState: SportsMatchState.SCHEDULED,
        ...(side === SportsBracketSide.HOME
          ? { homeRegistrationId: currentRegistrationId }
          : { awayRegistrationId: currentRegistrationId }),
      },
      data: {
        ...(side === SportsBracketSide.HOME
          ? { homeRegistrationId: null }
          : { awayRegistrationId: null }),
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    if (cleared.count !== 1) {
      throw new ConflictException(
        'A partida seguinte mudou durante a reconciliação da chave.',
      );
    }
    await tx.sportsMatchRoster.updateMany({
      where: {
        matchId: target.id,
        deletedAt: null,
        copiedFromRoster: {
          is: { matchId: sourceMatchId },
        },
      },
      data: {
        deletedAt: new Date(),
        updatedById: actorId,
      },
    });
    await syncSportsMatchEventName(tx, target.id, actorId);
    return [this.toInvalidation(target, 'BRACKET_ADVANCEMENT')];
  }

  private async settleStructuralByeIfReady(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      revision: number;
      state: SportsMatchState;
      canonicalState: SportsMatchState;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      winnerRegistrationId: string | null;
      stageId: string | null;
      stage: { settings: Prisma.JsonValue } | null;
      categoryId: string;
      category: { tournamentId: string };
      event: {
        deletedAt: Date | null;
        publiclyVisible: boolean;
        publicationState: PublicationState;
      };
    },
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const settings = this.readRecord(match.stage?.settings);
    const byeSides = this.readRecord(settings['structuralByeSides']);
    const byeSide = byeSides[match.id];
    if (byeSide !== SportsBracketSide.HOME && byeSide !== SportsBracketSide.AWAY) {
      return [];
    }
    const winnerRegistrationId =
      byeSide === SportsBracketSide.HOME
        ? match.awayRegistrationId
        : match.homeRegistrationId;
    const byeSlotIsEmpty =
      byeSide === SportsBracketSide.HOME
        ? match.homeRegistrationId === null
        : match.awayRegistrationId === null;
    if (!winnerRegistrationId || !byeSlotIsEmpty) {
      return [];
    }
    const settled = await tx.sportsMatch.updateMany({
      where: {
        id: match.id,
        revision: match.revision,
        state: SportsMatchState.SCHEDULED,
        canonicalState: SportsMatchState.SCHEDULED,
        winnerRegistrationId: null,
      },
      data: {
        state: SportsMatchState.FINISHED,
        canonicalState: SportsMatchState.FINISHED,
        reviewStatus: SportsReviewStatus.APPROVED,
        winnerRegistrationId,
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    if (settled.count === 1) {
      return mergeSportsStructuralInvalidations(
        [this.toInvalidation(match, 'STRUCTURAL_BYE_ADVANCED')],
        await this.advanceBye(tx, match.id, actorId),
      );
    }
    return [];
  }

  private async reconcileGrandFinalResetMatch(
    tx: Prisma.TransactionClient,
    source: {
      id: string;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
    },
    resetMatchId: string,
    desiredHomeRegistrationId: string | null,
    desiredAwayRegistrationId: string | null,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]> {
    const resetMatch = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: resetMatchId },
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
    const sourceRegistrationIds = new Set(
      [source.homeRegistrationId, source.awayRegistrationId].filter(
        (id): id is string => Boolean(id),
      ),
    );
    const hasForeignParticipant = [
      resetMatch.homeRegistrationId,
      resetMatch.awayRegistrationId,
    ].some((id) => id !== null && !sourceRegistrationIds.has(id));
    if (hasForeignParticipant) {
      throw new ConflictException(
        'Os participantes da partida de desempate foram alterados. Redefina-a explicitamente antes de corrigir a grande final.',
      );
    }
    const hasIndependentEvidence =
      resetMatch.operationSequence > 0 ||
      resetMatch.winnerRegistrationId !== null ||
      resetMatch.loserRegistrationId !== null ||
      resetMatch.state !== resetMatch.canonicalState ||
      (resetMatch.canonicalState !== SportsMatchState.SCHEDULED &&
        resetMatch.canonicalState !== SportsMatchState.CANCELED);
    if (hasIndependentEvidence) {
      throw new ConflictException(
        'A partida de desempate já possui check-in, placar ou resultado. Redefina-a explicitamente antes de corrigir a grande final.',
      );
    }

    const desiredState =
      desiredHomeRegistrationId && desiredAwayRegistrationId
        ? SportsMatchState.SCHEDULED
        : SportsMatchState.CANCELED;
    const desiredReviewStatus =
      desiredState === SportsMatchState.SCHEDULED
        ? SportsReviewStatus.NOT_REQUIRED
        : SportsReviewStatus.APPROVED;
    const alreadyReconciled =
      resetMatch.state === desiredState &&
      resetMatch.canonicalState === desiredState &&
      resetMatch.homeRegistrationId === desiredHomeRegistrationId &&
      resetMatch.awayRegistrationId === desiredAwayRegistrationId;
    const kind: SportsStructuralInvalidationKind =
      desiredState === SportsMatchState.SCHEDULED
        ? 'GRAND_FINAL_RESET_ACTIVATED'
        : 'GRAND_FINAL_RESET_CANCELED';
    if (alreadyReconciled) {
      return [this.toInvalidation(resetMatch, kind)];
    }

    const updated = await tx.sportsMatch.updateMany({
      where: {
        id: resetMatchId,
        revision: resetMatch.revision,
        state: resetMatch.state,
        canonicalState: resetMatch.canonicalState,
        homeRegistrationId: resetMatch.homeRegistrationId,
        awayRegistrationId: resetMatch.awayRegistrationId,
        winnerRegistrationId: null,
        loserRegistrationId: null,
        operationSequence: 0,
      },
      data: {
        state: desiredState,
        canonicalState: desiredState,
        reviewStatus: desiredReviewStatus,
        homeRegistrationId: desiredHomeRegistrationId,
        awayRegistrationId: desiredAwayRegistrationId,
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'A partida de desempate mudou durante a correção. Recarregue os dados antes de tentar novamente.',
      );
    }

    if (
      resetMatch.homeRegistrationId !== null ||
      resetMatch.awayRegistrationId !== null
    ) {
      await tx.sportsMatchRoster.updateMany({
        where: {
          matchId: resetMatch.id,
          deletedAt: null,
          copiedFromRoster: {
            is: { matchId: source.id },
          },
        },
        data: {
          deletedAt: new Date(),
          updatedById: actorId,
        },
      });
    }
    await syncSportsMatchEventName(tx, resetMatch.id, actorId);
    if (desiredHomeRegistrationId) {
      await this.rosters.copyApprovedRosterForWinner(
        tx,
        source.id,
        resetMatch.id,
        desiredHomeRegistrationId,
        actorId,
      );
    }
    return [this.toInvalidation(resetMatch, kind)];
  }

  private async invalidationForMatch(
    tx: Prisma.TransactionClient,
    matchId: string,
    kind: SportsStructuralInvalidationKind,
  ): Promise<SportsStructuralInvalidation[]> {
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
    return [this.toInvalidation(match, kind)];
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
        publicationState: PublicationState;
      };
    },
    kind: SportsStructuralInvalidationKind,
  ): SportsStructuralInvalidation {
    const isPublic =
      match.event.deletedAt === null &&
      match.event.publiclyVisible &&
      match.event.publicationState === PublicationState.PUBLISHED;
    return {
      kind,
      tournamentId: match.category.tournamentId,
      categoryId: match.categoryId,
      stageIds: match.stageId ? [match.stageId] : [],
      matchIds: [match.id],
      publicMatchIds: isPublic ? [match.id] : [],
    };
  }

  private readResetRule(
    value: unknown,
  ): { sourceMatchId: string; resetMatchId: string } | null {
    const rule = this.readRecord(this.readRecord(value)['resetRule']);
    return typeof rule['sourceMatchId'] === 'string' &&
      typeof rule['resetMatchId'] === 'string'
      ? {
          sourceMatchId: rule['sourceMatchId'],
          resetMatchId: rule['resetMatchId'],
        }
      : null;
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

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
