import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsAthleteIdentifierMode,
  SportsEligibilityStatus,
  SportsMatchState,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { normalizeSportsAthleteProfilePatch, SportsAthleteProfilePatch } from '../domain/sports-athlete-profile';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsRegistrationAdminService extends SportsAdminBaseService {
  async createRegistration(
    input: {
      teamId: string;
      categoryId: string;
      formAnswers?: Prisma.InputJsonValue | null;
      seed?: number | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const categoryScope = await this.prisma.sportsCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { eventGroupId: true },
    });
    if (!categoryScope) {
      throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(categoryScope.eventGroupId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [team, category] = await Promise.all([
        tx.sportsTeam.findFirst({
          where: { id: input.teamId, deletedAt: null },
          select: { tournamentId: true, name: true },
        }),
        tx.sportsCategory.findFirst({
          where: { id: input.categoryId, deletedAt: null },
          select: {
            tournamentId: true,
            eventGroupId: true,
            name: true,
            registrationFormId: true,
            registrationForm: {
              select: {
                id: true,
                name: true,
                elements: true,
                updatedAt: true,
                deletedAt: true,
              },
            },
            tournament: { select: { majorEventId: true } },
          },
        }),
      ]);
      if (!team || !category) {
        throw new NotFoundException('Equipe ou modalidade não encontrada.');
      }
      if (team.tournamentId !== category.tournamentId) {
        throw new BadRequestException('A equipe e a modalidade precisam pertencer ao mesmo torneio.');
      }
      const existing = await tx.sportsRegistration.findFirst({
        where: {
          teamId: input.teamId,
          categoryId: input.categoryId,
          deletedAt: null,
        },
      });
      if (existing) {
        return existing;
      }
      const formData = this.buildRegistrationFormData(category, input.formAnswers);
      const registration = await tx.sportsRegistration.create({
        data: {
          teamId: input.teamId,
          categoryId: input.categoryId,
          status: SportsRegistrationStatus.APPROVED,
          formAnswers: formData.formAnswers,
          formSchemaSnapshot: formData.formSchemaSnapshot,
          seed: input.seed ?? null,
          approvedAt: new Date(),
          approvedById: actorId,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_REGISTRATION,
          entityId: registration.id,
          entityLabel: `${team.name} · ${category.name}`,
          operation: AuditLogOperation.CREATE,
          actor,
          after: {
            teamId: registration.teamId,
            categoryId: registration.categoryId,
            status: registration.status,
            seed: registration.seed,
          },
          summary: 'Equipe inscrita na modalidade.',
          scope: {
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
          },
        },
        tx,
      );
      return registration;
    });
  }

  async updateRegistration(
    registrationId: string,
    input: {
      expectedRevision: number;
      status?: SportsRegistrationStatus;
      seed?: number | null;
      formAnswers?: Prisma.InputJsonValue | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: { id: registrationId, deletedAt: null },
      include: {
        category: {
          select: {
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
          },
        },
      },
    });
    if (!registration) {
      throw new NotFoundException(`Sports registration ${registrationId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(registration.category.eventGroupId, actor, 'edit');
    const normalizedFormAnswers =
      input.formAnswers === undefined
        ? undefined
        : this.normalizeRegistrationUpdateAnswers(registration.formSchemaSnapshot, input.formAnswers);
    const approved =
      input.status === SportsRegistrationStatus.APPROVED || input.status === SportsRegistrationStatus.ACTIVE;
    const rejected = input.status === SportsRegistrationStatus.REJECTED;
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const updated = await tx.sportsRegistration.updateMany({
        where: {
          id: registration.id,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
          ...(normalizedFormAnswers !== undefined ? { formAnswers: normalizedFormAnswers } : {}),
          ...(approved
            ? {
                approvedAt: new Date(),
                approvedById: actorId,
                rejectedAt: null,
                rejectedById: null,
                rejectionReason: null,
              }
            : {}),
          ...(rejected
            ? {
                rejectedAt: new Date(),
                rejectedById: actorId,
              }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A inscrição mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsRegistration.findUniqueOrThrow({
        where: { id: registration.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_REGISTRATION,
          entityId: result.id,
          entityLabel: result.id,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.registrationAuditSnapshot(registration),
          after: this.registrationAuditSnapshot(result),
          summary: 'Inscrição esportiva atualizada.',
          scope: {
            majorEventId: registration.category.tournament.majorEventId,
            eventGroupId: registration.category.eventGroupId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async assignCategoryRole(
    input: {
      registrationId: string;
      teamMemberId: string;
      role: SportsRosterRole;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const registrationScope = await this.prisma.sportsRegistration.findFirst({
      where: { id: input.registrationId, deletedAt: null },
      select: {
        category: { select: { eventGroupId: true } },
      },
    });
    if (!registrationScope) {
      throw new NotFoundException(`Sports registration ${input.registrationId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(registrationScope.category.eventGroupId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const registration = await tx.sportsRegistration.findFirst({
        where: { id: input.registrationId, deletedAt: null },
        include: {
          category: true,
          team: {
            select: { name: true },
          },
        },
      });
      const member = await tx.sportsTeamMember.findFirst({
        where: {
          id: input.teamMemberId,
          teamId: registration?.teamId,
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
        },
        include: {
          participant: true,
        },
      });
      if (!registration || !member) {
        throw new NotFoundException('Inscrição ou integrante da equipe não encontrado.');
      }
      const existing = await tx.sportsRegistrationMember.findFirst({
        where: {
          registrationId: registration.id,
          teamMemberId: member.id,
          deletedAt: null,
        },
      });
      if (existing?.role === input.role) {
        return existing;
      }
      await this.assertRoleLimit(tx, registration.category, registration.id, input.role);
      if (existing) {
        const assignment = await tx.sportsRegistrationMember.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            updatedById: actorId,
          },
        });
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
            entityId: assignment.id,
            entityLabel: `${registration.team.name} · ${registration.category.name}`,
            operation: AuditLogOperation.UPDATE,
            actor,
            before: {
              registrationId: existing.registrationId,
              teamMemberId: existing.teamMemberId,
              role: existing.role,
            },
            after: {
              registrationId: assignment.registrationId,
              teamMemberId: assignment.teamMemberId,
              role: assignment.role,
            },
            summary: 'Função esportiva atualizada.',
            scope: { eventGroupId: registration.category.eventGroupId },
          },
          tx,
        );
        return assignment;
      }
      const assignment = await tx.sportsRegistrationMember.create({
        data: {
          registrationId: registration.id,
          categoryId: registration.categoryId,
          teamMemberId: member.id,
          role: input.role,
          eligibility:
            member.participant.status === 'ACTIVE' ? SportsEligibilityStatus.ELIGIBLE : SportsEligibilityStatus.PENDING,
          approvedAt: new Date(),
          approvedById: actorId,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
          entityId: assignment.id,
          entityLabel: `${registration.team.name} · ${registration.category.name}`,
          operation: AuditLogOperation.ASSIGN,
          actor,
          after: {
            registrationId: assignment.registrationId,
            teamMemberId: assignment.teamMemberId,
            role: assignment.role,
          },
          summary: 'Função esportiva atribuída.',
          scope: { eventGroupId: registration.category.eventGroupId },
        },
        tx,
      );
      return assignment;
    });
  }

  async updateAthleteProfile(
    registrationMemberId: string,
    input: Pick<SportsAthleteProfilePatch, 'shirtNumber' | 'gameNickname' | 'gameAccountName' | 'gameAccountUrl'>,
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const profile = normalizeSportsAthleteProfilePatch(input);
    const scope = await this.prisma.sportsRegistrationMember.findFirst({
      where: { id: registrationMemberId, deletedAt: null },
      select: { category: { select: { eventGroupId: true } } },
    });
    if (!scope) {
      throw new NotFoundException(`Sports registration member ${registrationMemberId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(scope.category.eventGroupId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const member = await tx.sportsRegistrationMember.findFirst({
        where: { id: registrationMemberId, deletedAt: null },
        include: {
          registration: {
            select: { id: true, team: { select: { name: true } } },
          },
          category: {
            select: {
              name: true,
              eventGroupId: true,
              tournament: { select: { majorEventId: true } },
            },
          },
          teamMember: {
            select: {
              participant: { select: { person: { select: { name: true } } } },
            },
          },
        },
      });
      if (!member) {
        throw new NotFoundException(`Sports registration member ${registrationMemberId} was not found.`);
      }

      const updated = await tx.sportsRegistrationMember.updateMany({
        where: { id: member.id, deletedAt: null },
        data: {
          ...profile,
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A identificação do atleta mudou. Recarregue e tente novamente.');
      }

      const result = await tx.sportsRegistrationMember.findUniqueOrThrow({
        where: { id: member.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
          entityId: member.id,
          entityLabel: `${member.teamMember.participant.person.name} · ${member.category.name}`,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: {
            shirtNumber: member.shirtNumber,
            gameNickname: member.gameNickname,
            gameAccountName: member.gameAccountName,
            gameAccountUrl: member.gameAccountUrl,
          },
          after: {
            shirtNumber: result.shirtNumber,
            gameNickname: result.gameNickname,
            gameAccountName: result.gameAccountName,
            gameAccountUrl: result.gameAccountUrl,
          },
          summary: 'Identificação do atleta atualizada por administrador.',
          scope: {
            majorEventId: member.category.tournament.majorEventId,
            eventGroupId: member.category.eventGroupId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async updateOwnAthleteProfile(
    registrationMemberId: string,
    personId: string,
    input: SportsAthleteProfilePatch,
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const profile = normalizeSportsAthleteProfilePatch(input);

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const member = await tx.sportsRegistrationMember.findFirst({
        where: {
          id: registrationMemberId,
          deletedAt: null,
          eligibility: SportsEligibilityStatus.ELIGIBLE,
          category: {
            deletedAt: null,
            athleteIdentifierMode: SportsAthleteIdentifierMode.GAME_ACCOUNT,
          },
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
          teamMember: {
            deletedAt: null,
            status: SportsTeamMemberStatus.APPROVED,
            participant: {
              personId,
              deletedAt: null,
              status: 'ACTIVE',
            },
          },
        },
        include: {
          registration: {
            select: { id: true, team: { select: { name: true } } },
          },
          category: {
            select: {
              name: true,
              eventGroupId: true,
              tournament: { select: { majorEventId: true } },
            },
          },
          teamMember: {
            select: {
              participant: { select: { person: { select: { name: true } } } },
            },
          },
        },
      });
      if (!member) {
        throw new NotFoundException('Perfil de atleta não encontrado ou indisponível para edição.');
      }

      const updated = await tx.sportsRegistrationMember.updateMany({
        where: { id: member.id, deletedAt: null },
        data: {
          ...profile,
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O perfil de atleta mudou. Recarregue e tente novamente.');
      }

      const result = await tx.sportsRegistrationMember.findUniqueOrThrow({
        where: { id: member.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_MEMBER,
          entityId: member.id,
          entityLabel: `${member.teamMember.participant.person.name} · ${member.category.name}`,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: {
            gameNickname: member.gameNickname,
            gameAccountName: member.gameAccountName,
            gameAccountUrl: member.gameAccountUrl,
          },
          after: {
            gameNickname: result.gameNickname,
            gameAccountName: result.gameAccountName,
            gameAccountUrl: result.gameAccountUrl,
          },
          summary: 'Perfil de jogo atualizado pelo atleta.',
          scope: {
            majorEventId: member.category.tournament.majorEventId,
            eventGroupId: member.category.eventGroupId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async deleteRegistration(registrationId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: { id: registrationId, deletedAt: null },
      include: {
        team: { select: { name: true } },
        category: {
          select: {
            name: true,
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
          },
        },
      },
    });
    if (!registration) {
      throw new NotFoundException(`Sports registration ${registrationId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(registration.category.eventGroupId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const activeMatch = await tx.sportsMatch.findFirst({
        where: {
          deletedAt: null,
          state: {
            notIn: [SportsMatchState.FINISHED, SportsMatchState.DRAW, SportsMatchState.CANCELED],
          },
          OR: [{ homeRegistrationId: registrationId }, { awayRegistrationId: registrationId }],
        },
        select: { id: true },
      });
      if (activeMatch) {
        throw new ConflictException(
          'A inscrição participa de uma partida em aberto. Remova ou cancele a partida primeiro.',
        );
      }
      const deletedAt = new Date();
      const changed = await tx.sportsRegistration.updateMany({
        where: {
          id: registrationId,
          revision: expectedRevision,
          deletedAt: null,
        },
        data: {
          status: SportsRegistrationStatus.WITHDRAWN,
          deletedAt,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A inscrição mudou. Recarregue e tente novamente.');
      }
      await tx.sportsRegistrationMember.updateMany({
        where: { registrationId, deletedAt: null },
        data: { deletedAt, updatedById: actorId },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_REGISTRATION,
          entityId: registration.id,
          entityLabel: `${registration.team.name} · ${registration.category.name}`,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.registrationAuditSnapshot(registration),
          after: {
            ...this.registrationAuditSnapshot(registration),
            status: SportsRegistrationStatus.WITHDRAWN,
            deletedAt,
          },
          summary: 'Inscrição esportiva excluída.',
          scope: {
            permission: Permission.SportsRegistration.Delete,
            majorEventId: registration.category.tournament.majorEventId,
            eventGroupId: registration.category.eventGroupId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
