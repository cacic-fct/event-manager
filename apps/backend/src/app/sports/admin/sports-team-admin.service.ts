import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, SportsRegistrationStatus, SportsTeamStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';

import { SportsTeamAdminLifecycleService } from './sports-team-admin-lifecycle.service';

export class SportsTeamAdminService extends SportsTeamAdminLifecycleService {
  async createTeam(
    input: {
      tournamentId: string;
      name: string;
      institution?: string | null;
      status?: SportsTeamStatus;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const name = this.requireText(input.name, 'nome da equipe', 2, 120);
    const tournament = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const duplicate = await tx.sportsTeam.findFirst({
        where: {
          tournamentId: input.tournamentId,
          name: { equals: name, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Já existe uma equipe com este nome no torneio.');
      }
      const team = await tx.sportsTeam.create({
        data: {
          tournamentId: input.tournamentId,
          name,
          institution: input.institution?.trim() || null,
          status: input.status ?? SportsTeamStatus.ACTIVE,
          fieldRevisions: { name: 1, institution: 1, logo: 1 },
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const categories = await tx.sportsCategory.findMany({
        where: { tournamentId: input.tournamentId, deletedAt: null },
        select: { id: true },
      });
      if (categories.length > 0) {
        const now = new Date();
        await tx.sportsRegistration.createMany({
          data: categories.map((category) => ({
            teamId: team.id,
            categoryId: category.id,
            status: SportsRegistrationStatus.APPROVED,
            approvedAt: now,
            approvedById: actorId,
            createdById: actorId,
            updatedById: actorId,
          })),
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: team.id,
          entityLabel: team.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: team,
          summary: 'Equipe esportiva criada.',
          scope: { majorEventId: tournament.majorEventId },
        },
        tx,
      );
      return team;
    });
  }

  async updateTeam(
    teamId: string,
    input: {
      expectedRevision: number;
      name?: string;
      institution?: string | null;
      status?: SportsTeamStatus;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTeam.findFirst({
      where: { id: teamId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(existing.tournament.majorEventId, actor, 'edit');
    const nextRevision = existing.revision + 1;
    const fields = this.readRevisionMap(existing.fieldRevisions);
    const name = input.name === undefined ? undefined : this.requireText(input.name, 'nome da equipe', 2, 120);
    if (name !== undefined) {
      fields['name'] = nextRevision;
    }
    if (input.institution !== undefined) {
      fields['institution'] = nextRevision;
    }
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const duplicate = await tx.sportsTeam.findFirst({
        where: {
          id: { not: teamId },
          tournamentId: existing.tournamentId,
          name: {
            equals: name ?? existing.name,
            mode: 'insensitive',
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Já existe uma equipe com este nome no torneio.');
      }
      const updated = await tx.sportsTeam.updateMany({
        where: { id: teamId, revision: input.expectedRevision, deletedAt: null },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.institution !== undefined ? { institution: input.institution?.trim() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          fieldRevisions: fields,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A equipe mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsTeam.findUniqueOrThrow({
        where: { id: teamId },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: result.id,
          entityLabel: result.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.teamAuditSnapshot(existing),
          after: this.teamAuditSnapshot(result),
          summary: 'Equipe esportiva atualizada.',
          scope: {
            permission: Permission.SportsTeam.Update,
            majorEventId: existing.tournament.majorEventId,
          },
        },
        tx,
      );
      return result;
    });
  }
}
