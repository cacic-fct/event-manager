import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  SportsBracketSide,
  SportsLivestreamProvider,
  SportsMatchState,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import {
  softDeleteSportsMatchBackingEvents,
  syncSportsMatchEventName,
  updateSportsMatchBackingEvent,
} from '../sports-match-event-sync';
import { SportsAdminBaseService } from './sports-admin-base.service';

export abstract class SportsMatchAdminLifecycleService extends SportsAdminBaseService {
  async updateMatch(
    matchId: string,
    input: {
      expectedRevision: number;
      name?: string;
      startDate?: Date;
      endDate?: Date;
      stageId?: string | null;
      venueId?: string | null;
      homeRegistrationId?: string | null;
      awayRegistrationId?: string | null;
      state?: SportsMatchState;
      roundNumber?: number | null;
      bracketPosition?: number | null;
      groupKey?: string | null;
      notes?: string | null;
      livestreamProvider?: SportsLivestreamProvider | null;
      livestreamUrl?: string | null;
      winnerAdvancesToId?: string | null;
      winnerAdvancesToSide?: SportsBracketSide | null;
      loserAdvancesToId?: string | null;
      loserAdvancesToSide?: SportsBracketSide | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    if (input.state !== undefined) {
      throw new BadRequestException(
        'Altere o estado pela operação administrativa da partida para manter chave e classificação consistentes.',
      );
    }
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const match = await tx.sportsMatch.findFirst({
        where: { id: matchId, deletedAt: null },
        include: {
          event: true,
          category: {
            select: {
              id: true,
              eventGroupId: true,
              tournamentId: true,
              tournament: { select: { majorEventId: true } },
            },
          },
        },
      });
      if (!match) {
        throw new NotFoundException(`Sports match ${matchId} was not found.`);
      }
      await this.frozen.assertEventMutable(match.eventId, actor, 'edit');
      const startDate = input.startDate ?? match.event.startDate;
      const endDate = input.endDate ?? match.event.endDate;
      this.assertDateRange(startDate, endDate, 'partida');
      const [home, away, venue, stage] = await Promise.all([
        input.homeRegistrationId === undefined
          ? null
          : this.findRegistration(tx, input.homeRegistrationId, match.categoryId),
        input.awayRegistrationId === undefined
          ? null
          : this.findRegistration(tx, input.awayRegistrationId, match.categoryId),
        input.venueId === undefined ? null : this.findVenue(tx, input.venueId, match.category.tournamentId),
        input.stageId === undefined ? null : this.findStage(tx, input.stageId, match.categoryId),
      ]);
      const homeId = input.homeRegistrationId === undefined ? match.homeRegistrationId : (home?.id ?? null);
      const awayId = input.awayRegistrationId === undefined ? match.awayRegistrationId : (away?.id ?? null);
      if (homeId && homeId === awayId) {
        throw new BadRequestException('Uma equipe não pode jogar contra si mesma.');
      }
      await this.assertAdvancementTargets(tx, match.categoryId, match.id, [
        input.winnerAdvancesToId === undefined ? match.winnerAdvancesToId : input.winnerAdvancesToId,
        input.loserAdvancesToId === undefined ? match.loserAdvancesToId : input.loserAdvancesToId,
      ]);
      const livestreamProvider =
        input.livestreamProvider === undefined ? match.livestreamProvider : input.livestreamProvider;
      const requestedLivestreamUrl =
        input.livestreamProvider === null && input.livestreamUrl === undefined
          ? null
          : input.livestreamUrl === undefined
            ? match.livestreamUrl
            : input.livestreamUrl;
      const livestreamUrl =
        input.livestreamProvider !== undefined || input.livestreamUrl !== undefined
          ? this.normalizeLivestreamUrl(livestreamProvider, requestedLivestreamUrl)
          : match.livestreamUrl;
      const updated = await tx.sportsMatch.updateMany({
        where: {
          id: match.id,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.stageId !== undefined ? { stageId: stage?.id ?? null } : {}),
          ...(input.venueId !== undefined ? { venueId: venue?.id ?? null } : {}),
          ...(input.homeRegistrationId !== undefined ? { homeRegistrationId: homeId } : {}),
          ...(input.awayRegistrationId !== undefined ? { awayRegistrationId: awayId } : {}),
          ...(input.roundNumber !== undefined ? { roundNumber: input.roundNumber } : {}),
          ...(input.bracketPosition !== undefined ? { bracketPosition: input.bracketPosition } : {}),
          ...(input.groupKey !== undefined ? { groupKey: input.groupKey?.trim() || null } : {}),
          ...(input.notes !== undefined
            ? {
                notes: this.optionalText(input.notes, 'observações da partida', 4000),
              }
            : {}),
          ...(input.livestreamProvider !== undefined ? { livestreamProvider: input.livestreamProvider } : {}),
          ...(input.livestreamProvider !== undefined || input.livestreamUrl !== undefined ? { livestreamUrl } : {}),
          ...(input.winnerAdvancesToId !== undefined ? { winnerAdvancesToId: input.winnerAdvancesToId } : {}),
          ...(input.winnerAdvancesToSide !== undefined ? { winnerAdvancesToSide: input.winnerAdvancesToSide } : {}),
          ...(input.loserAdvancesToId !== undefined ? { loserAdvancesToId: input.loserAdvancesToId } : {}),
          ...(input.loserAdvancesToSide !== undefined ? { loserAdvancesToSide: input.loserAdvancesToSide } : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A partida mudou. Recarregue e tente novamente.');
      }
      await updateSportsMatchBackingEvent(tx, match.eventId, {
        ...(input.name !== undefined ? { name: this.requireText(input.name, 'nome da partida', 2, 160) } : {}),
        startDate,
        endDate,
        venue,
        venueChanged: input.venueId !== undefined,
        youtubeCode: this.youtubeCodeForLivestream(livestreamProvider, livestreamUrl),
        livestreamChanged: input.livestreamProvider !== undefined || input.livestreamUrl !== undefined,
        actorId,
      });
      if (
        input.name === undefined &&
        (input.homeRegistrationId !== undefined || input.awayRegistrationId !== undefined)
      ) {
        await syncSportsMatchEventName(tx, match.id, actorId);
      }
      const result = await tx.sportsMatch.findUniqueOrThrow({
        where: { id: match.id },
        include: { event: true },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH,
          entityId: result.id,
          entityLabel: result.event.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.matchAuditSnapshot(match),
          after: this.matchAuditSnapshot(result),
          summary: 'Partida atualizada.',
          scope: {
            majorEventId: match.category.tournament.majorEventId,
            eventGroupId: match.category.eventGroupId,
            eventId: match.eventId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async getMatchEventId(matchId: string): Promise<string> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      select: { eventId: true },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    return match.eventId;
  }

  async deleteMatch(matchId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const match = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      include: {
        event: true,
        category: {
          select: {
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    await this.frozen.assertEventMutable(match.eventId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const deletedAt = new Date();
      const changed = await tx.sportsMatch.updateMany({
        where: { id: matchId, revision: expectedRevision, deletedAt: null },
        data: {
          deletedAt,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A partida mudou. Recarregue e tente novamente.');
      }
      await Promise.all([
        softDeleteSportsMatchBackingEvents(tx, match.eventId, deletedAt, actorId),
        tx.sportsMatch.updateMany({
          where: { winnerAdvancesToId: matchId, deletedAt: null },
          data: {
            winnerAdvancesToId: null,
            winnerAdvancesToSide: null,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsMatch.updateMany({
          where: { loserAdvancesToId: matchId, deletedAt: null },
          data: {
            loserAdvancesToId: null,
            loserAdvancesToSide: null,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsOfficialAssignment.updateMany({
          where: { matchId, active: true },
          data: {
            active: false,
            revokedAt: deletedAt,
            revokedById: actorId,
            revision: { increment: 1 },
          },
        }),
        tx.sportsTournamentScoreEntry.updateMany({
          where: { sourceMatchId: matchId, deletedAt: null },
          data: {
            deletedAt,
            deletedById: actorId,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
      ]);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH,
          entityId: match.id,
          entityLabel: match.event.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.matchAuditSnapshot(match),
          after: {
            ...this.matchAuditSnapshot(match),
            deletedAt,
          },
          summary: 'Partida excluída.',
          scope: {
            permission: Permission.SportsMatch.Delete,
            majorEventId: match.category.tournament.majorEventId,
            eventGroupId: match.category.eventGroupId,
            eventId: match.eventId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
