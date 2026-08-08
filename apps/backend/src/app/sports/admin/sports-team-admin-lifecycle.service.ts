import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  SportsEligibilityStatus,
  SportsMatchState,
  SportsParticipantSource,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsAdminBaseService } from './sports-admin-base.service';

export abstract class SportsTeamAdminLifecycleService extends SportsAdminBaseService {
  async createTeamMember(teamId: string, personId: string, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    const team = await this.prisma.sportsTeam.findFirst({
      where: { id: teamId, deletedAt: null },
      select: {
        id: true,
        name: true,
        tournamentId: true,
        tournament: { select: { majorEventId: true } },
      },
    });
    if (!team) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(team.tournament.majorEventId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const person = await tx.people.findFirst({
        where: { id: personId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!person) {
        throw new NotFoundException(`Person ${personId} was not found.`);
      }
      const participant = await this.payments.ensureParticipant(tx, {
        tournamentId: team.tournamentId,
        personId,
        source: SportsParticipantSource.TEAM_ASSIGNMENT,
        actorId,
        approved: true,
      });
      const existing = await tx.sportsTeamMember.findFirst({
        where: { teamId, participantId: participant.id },
      });
      const member = existing
        ? await tx.sportsTeamMember.update({
            where: { id: existing.id },
            data: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              approvedAt: existing.approvedAt ?? new Date(),
              approvedById: existing.approvedById ?? actorId,
              rejectedAt: null,
              rejectedById: null,
              rejectionReason: null,
              revision: { increment: 1 },
              updatedById: actorId,
            },
          })
        : await tx.sportsTeamMember.create({
            data: {
              teamId,
              participantId: participant.id,
              status: SportsTeamMemberStatus.APPROVED,
              approvedAt: new Date(),
              approvedById: actorId,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      await tx.sportsTeam.update({
        where: { id: teamId },
        data: { revision: { increment: 1 }, updatedById: actorId },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
          entityId: member.id,
          entityLabel: `${person.name} - ${team.name}`,
          operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor,
          before: existing,
          after: member,
          summary: 'Integrante incluído diretamente por administrador.',
          scope: {
            permission: Permission.SportsTeam.Update,
            majorEventId: team.tournament.majorEventId,
          },
        },
        tx,
      );
      return member;
    });
  }

  async updateTeamMember(
    memberId: string,
    expectedRevision: number,
    status: SportsTeamMemberStatus,
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTeamMember.findFirst({
      where: { id: memberId, deletedAt: null },
      include: {
        participant: { select: { person: { select: { name: true } } } },
        team: {
          select: {
            id: true,
            name: true,
            tournament: { select: { majorEventId: true } },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Sports team member ${memberId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(existing.team.tournament.majorEventId, actor, 'edit');
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const updated = await tx.sportsTeamMember.updateMany({
        where: { id: memberId, revision: expectedRevision, deletedAt: null },
        data: {
          status,
          ...(status === SportsTeamMemberStatus.APPROVED
            ? {
                approvedAt: existing.approvedAt ?? new Date(),
                approvedById: existing.approvedById ?? actorId,
                rejectedAt: null,
                rejectedById: null,
                rejectionReason: null,
              }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O integrante mudou. Recarregue e tente novamente.');
      }
      if (status !== SportsTeamMemberStatus.APPROVED) {
        await tx.sportsRegistrationMember.updateMany({
          where: { teamMemberId: memberId, deletedAt: null },
          data: {
            eligibility: SportsEligibilityStatus.INELIGIBLE,
            rejectionReason: 'Integrante suspenso ou removido por administrador.',
            updatedById: actorId,
          },
        });
      }
      await tx.sportsTeam.update({
        where: { id: existing.team.id },
        data: { revision: { increment: 1 }, updatedById: actorId },
      });
      const member = await tx.sportsTeamMember.findUniqueOrThrow({ where: { id: memberId } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
          entityId: member.id,
          entityLabel: `${existing.participant.person.name} - ${existing.team.name}`,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: existing,
          after: member,
          summary: 'Status do integrante alterado diretamente por administrador.',
          scope: {
            permission: Permission.SportsTeam.Update,
            majorEventId: existing.team.tournament.majorEventId,
          },
        },
        tx,
      );
      return member;
    });
  }

  async assignRepresentative(teamId: string, personId: string, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [team, person] = await Promise.all([
        tx.sportsTeam.findFirst({
          where: { id: teamId, deletedAt: null },
          select: {
            id: true,
            name: true,
            tournament: { select: { majorEventId: true } },
          },
        }),
        tx.people.findFirst({
          where: { id: personId, deletedAt: null },
          select: { id: true, userId: true },
        }),
      ]);
      if (!team) {
        throw new NotFoundException(`Sports team ${teamId} was not found.`);
      }
      if (!person?.userId) {
        throw new BadRequestException('O representante precisa possuir uma conta vinculada.');
      }
      await this.frozen.assertMajorEventMutable(team.tournament.majorEventId, actor, 'edit');

      const assignment = await tx.sportsTeamRepresentative.upsert({
        where: {
          teamId_personId: { teamId, personId },
        },
        create: {
          teamId,
          personId,
          assignedById: actorId,
        },
        update: {
          active: true,
          assignedAt: new Date(),
          assignedById: actorId,
          revokedAt: null,
          revokedById: null,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: team.id,
          entityLabel: team.name,
          operation: AuditLogOperation.ASSIGN,
          actor,
          after: { representativePersonId: person.id },
          summary: 'Representante atribuído à equipe.',
          scope: { majorEventId: team.tournament.majorEventId },
          force: true,
        },
        tx,
      );
      return assignment;
    });
  }

  async revokeRepresentative(representativeId: string, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    const representative = await this.prisma.sportsTeamRepresentative.findUnique({
      where: { id: representativeId },
      include: {
        team: {
          include: { tournament: { select: { majorEventId: true } } },
        },
      },
    });
    if (!representative) {
      throw new NotFoundException(`Sports representative ${representativeId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(representative.team.tournament.majorEventId, actor, 'edit');
    if (!representative.active) {
      return representative;
    }
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const changed = await tx.sportsTeamRepresentative.updateMany({
        where: { id: representative.id, active: true },
        data: {
          active: false,
          revokedAt: new Date(),
          revokedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A atribuição de representante mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsTeamRepresentative.findUniqueOrThrow({
        where: { id: representative.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: representative.teamId,
          entityLabel: representative.team.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: {
            representativeId: representative.id,
            personId: representative.personId,
            active: true,
          },
          after: {
            representativeId: result.id,
            personId: result.personId,
            active: false,
            revokedAt: result.revokedAt,
          },
          summary: 'Representante removido da equipe.',
          scope: {
            majorEventId: representative.team.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
      return result;
    });
  }

  async deleteTeam(teamId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const team = await this.prisma.sportsTeam.findFirst({
      where: { id: teamId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!team) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(team.tournament.majorEventId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const activeMatch = await tx.sportsMatch.findFirst({
        where: {
          deletedAt: null,
          state: {
            notIn: [SportsMatchState.FINISHED, SportsMatchState.DRAW, SportsMatchState.CANCELED],
          },
          OR: [{ homeRegistration: { teamId, deletedAt: null } }, { awayRegistration: { teamId, deletedAt: null } }],
        },
        select: { id: true },
      });
      if (activeMatch) {
        throw new ConflictException(
          'A equipe participa de uma partida em aberto. Remova ou cancele a partida primeiro.',
        );
      }
      const deletedAt = new Date();
      const changed = await tx.sportsTeam.updateMany({
        where: { id: teamId, revision: expectedRevision, deletedAt: null },
        data: {
          status: SportsTeamStatus.WITHDRAWN,
          deletedAt,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A equipe mudou. Recarregue e tente novamente.');
      }
      await Promise.all([
        tx.sportsRegistration.updateMany({
          where: { teamId, deletedAt: null },
          data: {
            status: SportsRegistrationStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsTeamMember.updateMany({
          where: { teamId, deletedAt: null },
          data: {
            status: SportsTeamMemberStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsTeamRepresentative.updateMany({
          where: { teamId, active: true },
          data: {
            active: false,
            revokedAt: deletedAt,
            revokedById: actorId,
          },
        }),
        tx.sportsTournamentScoreEntry.updateMany({
          where: { teamId, deletedAt: null },
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
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: team.id,
          entityLabel: team.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.teamAuditSnapshot(team),
          after: {
            ...this.teamAuditSnapshot(team),
            status: SportsTeamStatus.WITHDRAWN,
            deletedAt,
          },
          summary: 'Equipe esportiva excluída.',
          scope: {
            permission: Permission.SportsTeam.Delete,
            majorEventId: team.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
