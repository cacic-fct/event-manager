import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsCategoryStatus,
  SportsRegistrationStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { CreateSportsCategoryInput } from '../sports-admin.types';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsCategoryAdminService extends SportsAdminBaseService {
  async createCategory(input: CreateSportsCategoryInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    this.validateRosterLimits(input);
    this.assertOptionalDateRange(input.registrationStartDate, input.registrationEndDate, 'inscrições da modalidade');
    const name = this.requireText(input.name, 'nome da modalidade', 2, 160);

    const tournament = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'edit');
    if (input.eventGroupId) {
      await this.frozen.assertEventGroupMutable(input.eventGroupId, actor, 'edit');
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertRegistrationFormForMajorEvent(tx, input.registrationFormId, tournament.majorEventId);
      const duplicate = await tx.sportsCategory.findFirst({
        where: {
          tournamentId: input.tournamentId,
          name: { equals: name, mode: 'insensitive' },
          division: input.division?.trim() || null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Já existe uma modalidade com este nome e divisão no torneio.');
      }

      const eventGroup = input.eventGroupId
        ? await tx.eventGroup.findFirst({
            where: {
              id: input.eventGroupId,
              deletedAt: null,
              sportsCategory: { is: null },
            },
          })
        : await tx.eventGroup.create({
            data: {
              name,
              emoji: input.emoji?.trim() || this.defaultSportEmoji(input.sport),
              createdById: actorId,
              updatedById: actorId,
            },
          });
      if (!eventGroup) {
        throw new ConflictException('O grupo de eventos não existe ou já pertence a outra modalidade.');
      }
      if (input.eventGroupId) {
        await tx.eventGroup.update({
          where: { id: eventGroup.id },
          data: {
            name,
            ...(input.emoji?.trim() ? { emoji: input.emoji.trim() } : {}),
            updatedById: actorId,
          },
        });
      }
      const category = await tx.sportsCategory.create({
        data: {
          tournamentId: input.tournamentId,
          eventGroupId: eventGroup.id,
          name,
          sport: input.sport,
          customSportName: input.customSportName?.trim() || null,
          division: input.division?.trim() || null,
          format: input.format,
          status: input.status ?? SportsCategoryStatus.DRAFT,
          registrationStartDate: input.registrationStartDate ?? null,
          registrationEndDate: input.registrationEndDate ?? null,
          minimumRosterSize: input.minimumRosterSize ?? null,
          maximumRosterSize: input.maximumRosterSize ?? null,
          maximumCaptains: input.maximumCaptains ?? null,
          maximumCoaches: input.maximumCoaches ?? null,
          allowPlayerMultipleTeams: input.allowPlayerMultipleTeams ?? null,
          periodsEnabled: input.periodsEnabled ?? false,
          maximumPeriods: input.maximumPeriods ?? null,
          periodLabel: input.periodLabel?.trim() || null,
          timerRules: input.timerRules ?? {},
          scoreRules: input.scoreRules,
          rosterRules: input.rosterRules,
          bracketRules: input.bracketRules,
          standingsRules: input.standingsRules,
          rulesText: input.rulesText?.trim() || null,
          registrationFormId: input.registrationFormId ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
        include: { eventGroup: true },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: category.id,
          entityLabel: name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.categoryAuditSnapshot(category),
          summary: 'Modalidade esportiva criada.',
          scope: {
            majorEventId: tournament.majorEventId,
            eventGroupId: eventGroup.id,
          },
        },
        tx,
      );
      return category;
    });
  }

  async updateCategory(
    categoryId: string,
    input: Partial<Omit<CreateSportsCategoryInput, 'tournamentId'>> & {
      expectedRevision: number;
      status?: SportsCategoryStatus;
      finishedAt?: Date | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      include: {
        eventGroup: true,
        tournament: { select: { majorEventId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Sports category ${categoryId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(existing.eventGroupId, actor, 'edit');
    if (
      input.minimumRosterSize !== undefined ||
      input.maximumRosterSize !== undefined ||
      input.maximumCaptains !== undefined ||
      input.maximumCoaches !== undefined ||
      input.maximumPeriods !== undefined ||
      input.sport !== undefined ||
      input.customSportName !== undefined
    ) {
      this.validateRosterLimits({
        ...existing,
        ...input,
        scoreRules: input.scoreRules ?? (existing.scoreRules as Prisma.InputJsonValue),
        timerRules:
          input.timerRules ?? (existing.timerRules === null ? {} : (existing.timerRules as Prisma.InputJsonValue)),
        rosterRules: input.rosterRules ?? (existing.rosterRules as Prisma.InputJsonValue),
        bracketRules: input.bracketRules ?? (existing.bracketRules as Prisma.InputJsonValue),
        standingsRules: input.standingsRules ?? (existing.standingsRules as Prisma.InputJsonValue),
      });
    }
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertRegistrationFormForMajorEvent(tx, input.registrationFormId, existing.tournament.majorEventId);
      const name = input.name !== undefined ? this.requireText(input.name, 'nome da modalidade', 2, 160) : undefined;
      const duplicate = await tx.sportsCategory.findFirst({
        where: {
          id: { not: categoryId },
          tournamentId: existing.tournamentId,
          name: {
            equals: name ?? existing.name,
            mode: 'insensitive',
          },
          division: input.division === undefined ? existing.division : input.division?.trim() || null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Já existe uma modalidade com este nome e divisão no torneio.');
      }
      const updated = await tx.sportsCategory.updateMany({
        where: {
          id: categoryId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.sport !== undefined ? { sport: input.sport } : {}),
          ...(input.customSportName !== undefined ? { customSportName: input.customSportName?.trim() || null } : {}),
          ...(input.division !== undefined ? { division: input.division?.trim() || null } : {}),
          ...(input.format !== undefined ? { format: input.format } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.registrationStartDate !== undefined ? { registrationStartDate: input.registrationStartDate } : {}),
          ...(input.registrationEndDate !== undefined ? { registrationEndDate: input.registrationEndDate } : {}),
          ...(input.minimumRosterSize !== undefined ? { minimumRosterSize: input.minimumRosterSize } : {}),
          ...(input.maximumRosterSize !== undefined ? { maximumRosterSize: input.maximumRosterSize } : {}),
          ...(input.maximumCaptains !== undefined ? { maximumCaptains: input.maximumCaptains } : {}),
          ...(input.maximumCoaches !== undefined ? { maximumCoaches: input.maximumCoaches } : {}),
          ...(input.allowPlayerMultipleTeams !== undefined
            ? { allowPlayerMultipleTeams: input.allowPlayerMultipleTeams }
            : {}),
          ...(input.periodsEnabled !== undefined ? { periodsEnabled: input.periodsEnabled } : {}),
          ...(input.maximumPeriods !== undefined ? { maximumPeriods: input.maximumPeriods } : {}),
          ...(input.periodLabel !== undefined ? { periodLabel: input.periodLabel?.trim() || null } : {}),
          ...(input.timerRules !== undefined ? { timerRules: input.timerRules } : {}),
          ...(input.scoreRules !== undefined ? { scoreRules: input.scoreRules } : {}),
          ...(input.rosterRules !== undefined ? { rosterRules: input.rosterRules } : {}),
          ...(input.bracketRules !== undefined ? { bracketRules: input.bracketRules } : {}),
          ...(input.standingsRules !== undefined ? { standingsRules: input.standingsRules } : {}),
          ...(input.rulesText !== undefined ? { rulesText: input.rulesText?.trim() || null } : {}),
          ...(input.registrationFormId !== undefined ? { registrationFormId: input.registrationFormId } : {}),
          ...(input.finishedAt !== undefined
            ? { finishedAt: input.finishedAt }
            : input.status === SportsCategoryStatus.FINISHED
              ? { finishedAt: new Date() }
              : input.status !== undefined
                ? { finishedAt: null }
                : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A modalidade mudou. Recarregue e tente novamente.');
      }
      if (name !== undefined || input.emoji !== undefined) {
        await tx.eventGroup.update({
          where: { id: existing.eventGroupId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(input.emoji !== undefined
              ? {
                  emoji: input.emoji.trim() || this.defaultSportEmoji(input.sport ?? existing.sport),
                }
              : {}),
            updatedById: actorId,
          },
        });
      }
      const result = await tx.sportsCategory.findUniqueOrThrow({
        where: { id: categoryId },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: result.id,
          entityLabel: result.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.categoryAuditSnapshot(existing),
          after: this.categoryAuditSnapshot(result),
          summary: 'Modalidade esportiva atualizada.',
          scope: {
            majorEventId: existing.tournament.majorEventId,
            eventGroupId: existing.eventGroupId,
          },
        },
        tx,
      );
      return result;
    });
  }

  async deleteCategory(categoryId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const category = await this.prisma.sportsCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      include: {
        eventGroup: true,
        tournament: { select: { majorEventId: true } },
      },
    });
    if (!category) {
      throw new NotFoundException(`Sports category ${categoryId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(category.eventGroupId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const deletedAt = new Date();
      const matches = await tx.sportsMatch.findMany({
        where: { categoryId, deletedAt: null },
        select: { id: true, eventId: true },
      });
      const changed = await tx.sportsCategory.updateMany({
        where: { id: categoryId, revision: expectedRevision, deletedAt: null },
        data: {
          status: SportsCategoryStatus.CANCELED,
          deletedAt,
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A modalidade mudou. Recarregue e tente novamente.');
      }
      await Promise.all([
        tx.event.updateMany({
          where: {
            id: { in: matches.map((match) => match.eventId) },
            deletedAt: null,
          },
          data: { deletedAt, updatedById: actorId },
        }),
        tx.sportsMatch.updateMany({
          where: { categoryId, deletedAt: null },
          data: { deletedAt, revision: { increment: 1 }, updatedById: actorId },
        }),
        tx.sportsStage.updateMany({
          where: { categoryId, deletedAt: null },
          data: { deletedAt, updatedById: actorId },
        }),
        tx.sportsRegistration.updateMany({
          where: { categoryId, deletedAt: null },
          data: {
            status: SportsRegistrationStatus.WITHDRAWN,
            deletedAt,
            revision: { increment: 1 },
            updatedById: actorId,
          },
        }),
        tx.sportsOfficialAssignment.updateMany({
          where: {
            active: true,
            OR: [{ categoryId }, { matchId: { in: matches.map((match) => match.id) } }],
          },
          data: {
            active: false,
            revokedAt: deletedAt,
            revokedById: actorId,
            revision: { increment: 1 },
          },
        }),
        tx.eventGroup.updateMany({
          where: { id: category.eventGroupId, deletedAt: null },
          data: { deletedAt, updatedById: actorId },
        }),
        tx.sportsTournamentScoreEntry.updateMany({
          where: { categoryId, deletedAt: null },
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
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: category.id,
          entityLabel: category.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.categoryAuditSnapshot(category),
          after: {
            ...this.categoryAuditSnapshot(category),
            status: SportsCategoryStatus.CANCELED,
            deletedAt,
          },
          summary: 'Modalidade esportiva excluída.',
          scope: {
            permission: Permission.SportsCategory.Delete,
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
          },
          force: true,
        },
        tx,
      );
    });
  }
}
