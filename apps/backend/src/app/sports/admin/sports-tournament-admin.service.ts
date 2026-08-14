import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  PublicationState,
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsScoringMode,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CreateSportsTournamentInput, UpdateSportsTournamentInput } from '../sports-admin.types';
import { softDeleteSportsMatchBackingEvents } from '../sports-match-event-sync';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsTournamentAdminService extends SportsAdminBaseService {
  async attachTournament(
    input: {
      majorEventId: string;
      status?: SportsTournamentStatus;
      registrationStartDate?: Date | null;
      registrationEndDate?: Date | null;
      selfSubscriptionEnabled?: boolean;
      selfSubscriptionAllowNoTeam?: boolean;
      selfSubscriptionAllowNoCategory?: boolean;
      allowPlayerMultipleTeams?: boolean;
      scoringMode?: SportsScoringMode;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    await this.frozen.assertMajorEventMutable(input.majorEventId, actor, 'edit');
    this.assertOptionalDateRange(input.registrationStartDate, input.registrationEndDate, 'inscrições do torneio');
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const majorEvent = await tx.majorEvent.findFirst({
        where: { id: input.majorEventId, deletedAt: null },
      });
      if (!majorEvent) {
        throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
      }
      const existing = await tx.sportsTournament.findUnique({
        where: { majorEventId: majorEvent.id },
      });
      if (existing && !existing.deletedAt) {
        return existing;
      }
      const tournament = existing
        ? await tx.sportsTournament.update({
            where: { id: existing.id },
            data: {
              deletedAt: null,
              status: input.status ?? SportsTournamentStatus.DRAFT,
              registrationStartDate: input.registrationStartDate ?? null,
              registrationEndDate: input.registrationEndDate ?? null,
              selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
              selfSubscriptionAllowNoTeam: input.selfSubscriptionAllowNoTeam ?? false,
              selfSubscriptionAllowNoCategory: input.selfSubscriptionAllowNoCategory ?? false,
              allowPlayerMultipleTeams: input.allowPlayerMultipleTeams ?? false,
              scoringMode: input.scoringMode ?? SportsScoringMode.PER_SPORT,
              revision: { increment: 1 },
              updatedById: actorId,
            },
          })
        : await tx.sportsTournament.create({
            data: {
              majorEventId: majorEvent.id,
              status: input.status ?? SportsTournamentStatus.DRAFT,
              registrationStartDate: input.registrationStartDate ?? null,
              registrationEndDate: input.registrationEndDate ?? null,
              selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
              selfSubscriptionAllowNoTeam: input.selfSubscriptionAllowNoTeam ?? false,
              selfSubscriptionAllowNoCategory: input.selfSubscriptionAllowNoCategory ?? false,
              allowPlayerMultipleTeams: input.allowPlayerMultipleTeams ?? false,
              scoringMode: input.scoringMode ?? SportsScoringMode.PER_SPORT,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT,
          entityId: tournament.id,
          entityLabel: majorEvent.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.tournamentAuditSnapshot(tournament),
          summary: 'Modo esportivo habilitado para o grande evento.',
          scope: { majorEventId: majorEvent.id },
        },
        tx,
      );
      return tournament;
    });
  }

  async createTournament(input: CreateSportsTournamentInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    this.assertDateRange(input.startDate, input.endDate, 'torneio');
    this.assertOptionalDateRange(input.registrationStartDate, input.registrationEndDate, 'inscrições do torneio');
    const name = this.requireText(input.name, 'nome do torneio', 2, 160);

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const majorEvent = await tx.majorEvent.create({
        data: {
          name,
          emoji: input.emoji?.trim() || '🏆',
          startDate: input.startDate,
          endDate: input.endDate,
          description: input.description?.trim() || null,
          subscriptionStartDate: input.registrationStartDate ?? null,
          subscriptionEndDate: input.registrationEndDate ?? null,
          publicationState: PublicationState.DRAFT,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const tournament = await tx.sportsTournament.create({
        data: {
          majorEventId: majorEvent.id,
          status: SportsTournamentStatus.DRAFT,
          registrationStartDate: input.registrationStartDate ?? null,
          registrationEndDate: input.registrationEndDate ?? null,
          selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
          selfSubscriptionAllowNoTeam: input.selfSubscriptionAllowNoTeam ?? false,
          selfSubscriptionAllowNoCategory: input.selfSubscriptionAllowNoCategory ?? false,
          allowPlayerMultipleTeams: input.allowPlayerMultipleTeams ?? false,
          scoringMode: input.scoringMode ?? SportsScoringMode.PER_SPORT,
          createdById: actorId,
          updatedById: actorId,
        },
        include: { majorEvent: true },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT,
          entityId: tournament.id,
          entityLabel: name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.tournamentAuditSnapshot(tournament),
          summary: 'Torneio esportivo criado.',
          scope: { majorEventId: majorEvent.id },
        },
        tx,
      );
      return tournament;
    });
  }

  async updateTournament(tournamentId: string, input: UpdateSportsTournamentInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { majorEvent: true },
    });
    if (!existing) {
      throw new NotFoundException(`Sports tournament ${tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(existing.majorEventId, actor, 'edit');
    if (input.registrationStartDate !== undefined || input.registrationEndDate !== undefined) {
      this.assertOptionalDateRange(
        input.registrationStartDate === undefined ? existing.registrationStartDate : input.registrationStartDate,
        input.registrationEndDate === undefined ? existing.registrationEndDate : input.registrationEndDate,
        'inscrições do torneio',
      );
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      if (
        input.allowPlayerMultipleTeams === false &&
        existing.allowPlayerMultipleTeams &&
        (await this.hasCrossTeamParticipants(tx, tournamentId))
      ) {
        throw new ConflictException(
          'Não é possível desativar múltiplas equipes enquanto houver participantes em mais de uma equipe.',
        );
      }

      const updated = await tx.sportsTournament.updateMany({
        where: {
          id: tournamentId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.registrationStartDate !== undefined
            ? { registrationStartDate: input.registrationStartDate }
            : {}),
          ...(input.registrationEndDate !== undefined ? { registrationEndDate: input.registrationEndDate } : {}),
          ...(input.selfSubscriptionEnabled !== undefined
            ? { selfSubscriptionEnabled: input.selfSubscriptionEnabled }
            : {}),
          ...(input.selfSubscriptionAllowNoTeam !== undefined
            ? {
                selfSubscriptionAllowNoTeam: input.selfSubscriptionAllowNoTeam,
              }
            : {}),
          ...(input.selfSubscriptionAllowNoCategory !== undefined
            ? {
                selfSubscriptionAllowNoCategory: input.selfSubscriptionAllowNoCategory,
              }
            : {}),
          ...(input.allowPlayerMultipleTeams !== undefined
            ? { allowPlayerMultipleTeams: input.allowPlayerMultipleTeams }
            : {}),
          ...(input.scoringMode !== undefined ? { scoringMode: input.scoringMode } : {}),
          ...(input.finishedAt !== undefined
            ? { finishedAt: input.finishedAt }
            : input.status === SportsTournamentStatus.FINISHED
              ? { finishedAt: new Date() }
              : input.status !== undefined
                ? { finishedAt: null }
                : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O torneio mudou. Recarregue os dados e tente novamente.');
      }
      const result = await tx.sportsTournament.findUniqueOrThrow({
        where: { id: tournamentId },
        include: { majorEvent: true },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT,
          entityId: result.id,
          entityLabel: result.majorEvent.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.tournamentAuditSnapshot(existing),
          after: this.tournamentAuditSnapshot(result),
          summary: 'Torneio esportivo atualizado.',
          scope: { majorEventId: result.majorEventId },
        },
        tx,
      );
      return result;
    });
  }

  async deleteTournament(tournamentId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const tournament = await this.prisma.sportsTournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { majorEvent: true },
    });
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const deletedAt = new Date();
      const categories = await tx.sportsCategory.findMany({
        where: { tournamentId, deletedAt: null },
        select: { id: true, eventGroupId: true },
      });
      const categoryIds = categories.map((category) => category.id);
      const matches = await tx.sportsMatch.findMany({
        where: { categoryId: { in: categoryIds }, deletedAt: null },
        select: { id: true, eventId: true },
      });
      const matchIds = matches.map((match) => match.id);
      const eventIds = matches.map((match) => match.eventId);
      const teamIds = (
        await tx.sportsTeam.findMany({
          where: { tournamentId, deletedAt: null },
          select: { id: true },
        })
      ).map((team) => team.id);

      const changed = await tx.sportsTournament.updateMany({
        where: {
          id: tournamentId,
          revision: expectedRevision,
          deletedAt: null,
        },
        data: {
          status: SportsTournamentStatus.CANCELED,
          deletedAt,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O torneio mudou. Recarregue e tente novamente.');
      }

      await Promise.all([
        softDeleteSportsMatchBackingEvents(tx, eventIds, deletedAt, actorId),
        tx.sportsMatch.updateMany({
          where: { id: { in: matchIds }, deletedAt: null },
          data: { deletedAt, revision: { increment: 1 }, updatedById: actorId },
        }),
        tx.sportsStage.updateMany({
          where: { categoryId: { in: categoryIds }, deletedAt: null },
          data: { deletedAt, updatedById: actorId },
        }),
        tx.sportsRegistration.updateMany({
          where: { categoryId: { in: categoryIds }, deletedAt: null },
          data: {
            status: SportsRegistrationStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsCategory.updateMany({
          where: { id: { in: categoryIds }, deletedAt: null },
          data: {
            status: SportsCategoryStatus.CANCELED,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.eventGroup.updateMany({
          where: {
            id: { in: categories.map((category) => category.eventGroupId) },
            deletedAt: null,
          },
          data: { deletedAt, updatedById: actorId },
        }),
        tx.sportsTeamMember.updateMany({
          where: { teamId: { in: teamIds }, deletedAt: null },
          data: {
            status: SportsTeamMemberStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsTeamRepresentative.updateMany({
          where: { teamId: { in: teamIds }, active: true },
          data: {
            active: false,
            revokedAt: deletedAt,
            revokedById: actorId,
          },
        }),
        tx.sportsTeam.updateMany({
          where: { id: { in: teamIds }, deletedAt: null },
          data: {
            status: SportsTeamStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsVenue.updateMany({
          where: { tournamentId, deletedAt: null },
          data: { deletedAt, revision: { increment: 1 }, updatedById: actorId },
        }),
        tx.sportsOfficialAssignment.updateMany({
          where: { tournamentId, active: true },
          data: {
            active: false,
            revokedAt: deletedAt,
            revokedById: actorId,
            revision: { increment: 1 },
          },
        }),
        tx.sportsTournamentParticipant.updateMany({
          where: { tournamentId, deletedAt: null },
          data: {
            status: 'WITHDRAWN',
            deletedAt,
            updatedById: actorId,
          },
        }),
        tx.sportsPlayerApplication.updateMany({
          where: { tournamentId, deletedAt: null },
          data: {
            status: 'WITHDRAWN',
            deletedAt,
          },
        }),
        tx.sportsTournamentScoreEntry.updateMany({
          where: { tournamentId, deletedAt: null },
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
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT,
          entityId: tournament.id,
          entityLabel: tournament.majorEvent.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.tournamentAuditSnapshot(tournament),
          after: {
            ...this.tournamentAuditSnapshot(tournament),
            status: SportsTournamentStatus.CANCELED,
            deletedAt,
          },
          summary: 'Modo esportivo removido do grande evento.',
          scope: {
            permission: Permission.SportsTournament.Delete,
            majorEventId: tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
