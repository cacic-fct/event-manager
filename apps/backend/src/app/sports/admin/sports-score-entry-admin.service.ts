import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, SportsScoreEntrySource } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsScoreEntryAdminService extends SportsAdminBaseService {
  async createTournamentScoreEntry(
    input: {
      tournamentId: string;
      categoryId?: string | null;
      teamId: string;
      sourceMatchId?: string | null;
      source: SportsScoreEntrySource;
      points: number;
      reason: string;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const tournament = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'edit');
    this.assertManualScoreEntry(input);

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertScoreEntryTargets(tx, input.tournamentId, input.teamId, input.categoryId);
      const entry = await tx.sportsTournamentScoreEntry.create({
        data: {
          tournamentId: input.tournamentId,
          categoryId: input.categoryId ?? null,
          teamId: input.teamId,
          source: input.source,
          points: input.points,
          reason: this.requireText(input.reason, 'motivo do ajuste', 2, 240),
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT_SCORE,
          entityId: entry.id,
          entityLabel: entry.reason,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.scoreEntryAuditSnapshot(entry),
          summary: 'Ajuste manual da pontuação geral criado.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: tournament.majorEventId,
          },
        },
        tx,
      );
      return entry;
    });
  }

  async updateTournamentScoreEntry(
    entryId: string,
    input: {
      tournamentId: string;
      expectedRevision: number;
      categoryId?: string | null;
      teamId?: string;
      source?: SportsScoreEntrySource;
      points?: number;
      reason?: string;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTournamentScoreEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Sports score entry ${entryId} was not found.`);
    }
    if (existing.tournamentId !== input.tournamentId) {
      throw new BadRequestException('O ajuste não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(existing.tournament.majorEventId, actor, 'edit');
    const source = input.source ?? existing.source;
    const points = input.points ?? existing.points;
    this.assertManualScoreEntry({ source, points, sourceMatchId: null });

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const teamId = input.teamId ?? existing.teamId;
      const categoryId = input.categoryId === undefined ? existing.categoryId : input.categoryId;
      await this.assertScoreEntryTargets(tx, existing.tournamentId, teamId, categoryId);
      const changed = await tx.sportsTournamentScoreEntry.updateMany({
        where: {
          id: entryId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.points !== undefined ? { points: input.points } : {}),
          ...(input.reason !== undefined
            ? {
                reason: this.requireText(input.reason, 'motivo do ajuste', 2, 240),
              }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O ajuste de pontuação mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsTournamentScoreEntry.findUniqueOrThrow({
        where: { id: entryId },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT_SCORE,
          entityId: result.id,
          entityLabel: result.reason,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.scoreEntryAuditSnapshot(existing),
          after: this.scoreEntryAuditSnapshot(result),
          summary: 'Ajuste manual da pontuação geral atualizado.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: existing.tournament.majorEventId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async deleteTournamentScoreEntry(
    entryId: string,
    tournamentId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTournamentScoreEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Sports score entry ${entryId} was not found.`);
    }
    if (existing.tournamentId !== tournamentId) {
      throw new BadRequestException('O ajuste não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(existing.tournament.majorEventId, actor, 'delete');
    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const deletedAt = new Date();
      const changed = await tx.sportsTournamentScoreEntry.updateMany({
        where: {
          id: entryId,
          revision: expectedRevision,
          deletedAt: null,
        },
        data: {
          deletedAt,
          deletedById: actorId,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O ajuste de pontuação mudou. Recarregue e tente novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT_SCORE,
          entityId: existing.id,
          entityLabel: existing.reason,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.scoreEntryAuditSnapshot(existing),
          after: {
            ...this.scoreEntryAuditSnapshot(existing),
            deletedAt,
          },
          summary: 'Ajuste manual da pontuação geral excluído.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: existing.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
