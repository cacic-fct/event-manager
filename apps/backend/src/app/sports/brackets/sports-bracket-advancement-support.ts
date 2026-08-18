import { ConflictException } from '@nestjs/common';
import { Prisma, PublicationState, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';
import { SportsMatchRosterService } from '../rosters/sports-match-roster.service';
import { syncSportsMatchEventName } from '../sports-match-event-sync';

export abstract class SportsBracketAdvancementSupport {
  constructor(protected readonly rosters: SportsMatchRosterService) {}

  protected async reconcileGrandFinalResetMatch(
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
            isPubliclyListed: true,
            publicationState: true,
          },
        },
      },
    });
    const sourceRegistrationIds = new Set(
      [source.homeRegistrationId, source.awayRegistrationId].filter((id): id is string => Boolean(id)),
    );
    const hasForeignParticipant = [resetMatch.homeRegistrationId, resetMatch.awayRegistrationId].some(
      (id) => id !== null && !sourceRegistrationIds.has(id),
    );
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
      desiredHomeRegistrationId && desiredAwayRegistrationId ? SportsMatchState.SCHEDULED : SportsMatchState.CANCELED;
    const desiredReviewStatus =
      desiredState === SportsMatchState.SCHEDULED ? SportsReviewStatus.NOT_REQUIRED : SportsReviewStatus.APPROVED;
    const alreadyReconciled =
      resetMatch.state === desiredState &&
      resetMatch.canonicalState === desiredState &&
      resetMatch.homeRegistrationId === desiredHomeRegistrationId &&
      resetMatch.awayRegistrationId === desiredAwayRegistrationId;
    const kind: SportsStructuralInvalidationKind =
      desiredState === SportsMatchState.SCHEDULED ? 'GRAND_FINAL_RESET_ACTIVATED' : 'GRAND_FINAL_RESET_CANCELED';
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

    if (resetMatch.homeRegistrationId !== null || resetMatch.awayRegistrationId !== null) {
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
      await this.rosters.copyApprovedRosterForWinner(tx, source.id, resetMatch.id, desiredHomeRegistrationId, actorId);
    }
    if (desiredAwayRegistrationId) {
      await this.rosters.copyApprovedRosterForWinner(tx, source.id, resetMatch.id, desiredAwayRegistrationId, actorId);
    }
    return [this.toInvalidation(resetMatch, kind)];
  }

  protected async invalidationForMatch(
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
            isPubliclyListed: true,
            publicationState: true,
          },
        },
      },
    });
    return [this.toInvalidation(match, kind)];
  }

  protected toInvalidation(
    match: {
      id: string;
      categoryId: string;
      stageId: string | null;
      category: { tournamentId: string };
      event: {
        deletedAt: Date | null;
        isPubliclyListed: boolean;
        publicationState: PublicationState;
      };
    },
    kind: SportsStructuralInvalidationKind,
  ): SportsStructuralInvalidation {
    const isPublic =
      match.event.deletedAt === null &&
      match.event.isPubliclyListed &&
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

  protected readResetRule(value: unknown): { sourceMatchId: string; resetMatchId: string } | null {
    const rule = this.readRecord(this.readRecord(value)['resetRule']);
    return typeof rule['sourceMatchId'] === 'string' && typeof rule['resetMatchId'] === 'string'
      ? {
          sourceMatchId: rule['sourceMatchId'],
          resetMatchId: rule['resetMatchId'],
        }
      : null;
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

  protected readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}
