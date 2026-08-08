import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  PublicationState,
  SportsBracketSide,
  SportsMatchState,
  SportsReviewStatus,
} from '@prisma/client';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';
import { syncSportsMatchEventName } from '../sports-match-event-sync';

import { SportsBracketAdvancementSupport } from './sports-bracket-advancement-support';

export abstract class SportsBracketAdvancementAssignments extends SportsBracketAdvancementSupport {
  protected abstract advanceBye(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    actorId: string,
  ): Promise<SportsStructuralInvalidation[]>;

  protected async assignRegistration(
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

  protected async clearSourceAssignment(
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

  protected async settleStructuralByeIfReady(
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

}



