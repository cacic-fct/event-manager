import { ConflictException } from '@nestjs/common';
import { Prisma, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
} from '../realtime/sports-structural-invalidation';
import { syncSportsMatchEventName } from '../sports-match-event-sync';

import { SportsStandingsComputation } from './sports-standings-computation';

export abstract class SportsStandingsQualifiers extends SportsStandingsComputation {
  protected async refreshGroupQualifiers(
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
            !([SportsMatchState.FINISHED, SportsMatchState.DRAW] as SportsMatchState[]).includes(match.canonicalState),
        ),
      )
    ) {
      return elimination ? this.clearGroupQualifierAssignments(tx, elimination, groupStages, actorId) : [];
    }
    if (!elimination) {
      return [];
    }
    const standingByGroupPosition = new Map<string, string>();
    const groupRegistrationIds = new Set<string>();
    for (const stage of groupStages) {
      const groupKey = this.readRecord(stage.settings)['groupKey'];
      if (typeof groupKey !== 'string') {
        continue;
      }
      for (const standing of stage.standings) {
        groupRegistrationIds.add(standing.registrationId);
        if (standing.rank) {
          standingByGroupPosition.set(`${groupKey}:${standing.rank}`, standing.registrationId);
        }
      }
    }
    const slots = this.readRecord(this.readRecord(elimination.settings)['qualifierSlotsByMatch']);
    for (const [matchId, rawSides] of Object.entries(slots)) {
      const sides = this.readRecord(rawSides);
      const home = this.readRecord(sides['home']);
      const away = this.readRecord(sides['away']);
      const homeRegistrationId = this.registrationForGroupSlot(home, standingByGroupPosition);
      const awayRegistrationId = this.registrationForGroupSlot(away, standingByGroupPosition);
      const match = await tx.sportsMatch.findFirst({
        where: { id: matchId, deletedAt: null },
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
      if (!match) {
        continue;
      }
      if (match.canonicalState !== SportsMatchState.SCHEDULED) {
        continue;
      }
      const slotChanges: { homeRegistrationId?: string | null; awayRegistrationId?: string | null } = {};
      for (const [field, desiredRegistrationId, currentRegistrationId] of [
        ['homeRegistrationId', homeRegistrationId, match.homeRegistrationId],
        ['awayRegistrationId', awayRegistrationId, match.awayRegistrationId],
      ] as const) {
        const currentIsGroupQualifier =
          currentRegistrationId !== null && groupRegistrationIds.has(currentRegistrationId);
        if (
          (currentRegistrationId === null && desiredRegistrationId !== null) ||
          (currentIsGroupQualifier && currentRegistrationId !== desiredRegistrationId)
        ) {
          slotChanges[field] = desiredRegistrationId;
        }
      }
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
      invalidations.push([this.toInvalidation(match, 'GROUP_QUALIFIERS_ASSIGNED')]);
      const automaticWinner =
        home['type'] === 'BYE' ? awayRegistrationId : away['type'] === 'BYE' ? homeRegistrationId : null;
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
          invalidations.push(await this.advancement.advanceBye(tx, match.id, actorId));
        }
      }
    }
    return mergeSportsStructuralInvalidations(...invalidations);
  }

  protected registrationForGroupSlot(
    slot: Record<string, unknown>,
    standingByGroupPosition: ReadonlyMap<string, string>,
  ): string | null {
    return slot['type'] === 'GROUP_POSITION' &&
      typeof slot['groupKey'] === 'string' &&
      typeof slot['groupPosition'] === 'number'
      ? (standingByGroupPosition.get(`${slot['groupKey']}:${slot['groupPosition']}`) ?? null)
      : null;
  }

  protected async clearGroupQualifierAssignments(
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
      Object.keys(this.readRecord(this.readRecord(elimination.settings)['qualifierSlotsByMatch'])),
    );
    const groupRegistrationIds = new Set(
      groupStages.flatMap((stage) => stage.standings.map((standing) => standing.registrationId)),
    );
    const invalidations: SportsStructuralInvalidation[] = [];
    for (const match of elimination.matches) {
      if (!qualifierMatchIds.has(match.id)) {
        continue;
      }
      const clearHome = match.homeRegistrationId !== null && groupRegistrationIds.has(match.homeRegistrationId);
      const clearAway = match.awayRegistrationId !== null && groupRegistrationIds.has(match.awayRegistrationId);
      if (!clearHome && !clearAway) {
        continue;
      }
      if (match.canonicalState !== SportsMatchState.SCHEDULED) {
        throw new ConflictException('Redefina a eliminatória iniciada antes de corrigir a fase de grupos.');
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
        throw new ConflictException('A chave eliminatória mudou durante a reconciliação.');
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
      invalidations.push(this.toInvalidation(current, 'GROUP_QUALIFIERS_ASSIGNED'));
    }
    return invalidations;
  }
}
