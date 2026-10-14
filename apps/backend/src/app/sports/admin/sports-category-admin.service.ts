import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsAthleteIdentifierMode,
  SportsCategoryStatus,
  SportsRegistrationStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { eventContentAuditSnapshot } from '../../events/event-content-audit';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import {
  normalizeEventCertificateSettings,
  type EventCertificateSettings,
} from '../../events/event-certificate-settings';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../../audiences/audience-context';
import { PrismaService } from '../../prisma/prisma.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { SportsPaymentService } from '../sports-payment.service';
import { assertSportsOverallScoringRules } from '../domain/sports-overall-scoring';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { CreateSportsCategoryInput } from '../sports-admin.types';
import { softDeleteSportsMatchBackingEvents } from '../sports-match-event-sync';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsCategoryAdminService extends SportsAdminBaseService {
  constructor(
    prisma: PrismaService,
    frozen: FrozenResourceService,
    auditLog: AuditLogService,
    payments: SportsPaymentService,
    private readonly attendanceCategories = new AttendanceCategoryService(prisma),
  ) {
    super(prisma, frozen, auditLog, payments);
  }

  async createCategory(input: CreateSportsCategoryInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    this.validateRosterLimits(input);
    this.assertOverallScoringRules(input.overallScoringRules);
    this.assertOptionalDateRange(input.registrationStartDate, input.registrationEndDate, 'inscrições da modalidade');
    const name = this.requireText(input.name, 'nome da modalidade', 2, 160);
    const joiningInstructions = this.normalizeJoiningInstructions(input.joiningInstructions);

    const tournament = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true, shouldIssueCertificate: true, majorEvent: { select: { name: true } } },
    });
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'edit');
    if (input.eventGroupId) {
      const existingEventGroup = await this.prisma.eventGroup.findFirst({
        where: { id: input.eventGroupId, deletedAt: null },
        select: { id: true },
      });
      if (existingEventGroup || !input.id) {
        await this.frozen.assertEventGroupMutable(input.eventGroupId, actor, 'edit');
      }
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertRegistrationFormForMajorEvent(tx, input.registrationFormId, tournament.majorEventId);
      if (input.id) {
        const claimedCategoryId = await tx.sportsCategory.findUnique({
          where: { id: input.id },
          select: { id: true },
        });
        if (claimedCategoryId) {
          throw new ConflictException('O ID da modalidade já está em uso.');
        }
      }
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

      const existingEventGroup = input.eventGroupId
        ? await tx.eventGroup.findFirst({
            where: {
              id: input.eventGroupId,
              deletedAt: null,
              sportsCategory: { is: null },
            },
          })
        : null;
      let eventGroup = existingEventGroup
        ? existingEventGroup
        : input.eventGroupId && input.id
          ? await this.createImportedBackingEventGroup(tx, input, tournament, name, actorId)
          : input.eventGroupId
            ? null
            : await tx.eventGroup.create({
                data: {
                  name: this.backingEventGroupName(
                    tournament.majorEvent?.name ?? 'Torneio esportivo',
                    name,
                    input.division,
                  ),
                  emoji: input.emoji?.trim() || this.defaultSportEmoji(input.sport),
                  shouldIssueCertificate: input.shouldIssueCertificate ?? tournament.shouldIssueCertificate ?? false,
                  ...(input.backingEventGroup ?? {}),
                  createdById: actorId,
                  updatedById: actorId,
                },
              });
      if (!eventGroup) {
        throw new ConflictException('O grupo de eventos não existe ou já pertence a outra modalidade.');
      }
      if (input.eventGroupId) {
        await this.assertBackingEventGroupsHaveNoOrdinaryEvents(tx, eventGroup.id);
        const backingGroupData = {
          name: this.backingEventGroupName(tournament.majorEvent?.name ?? 'Torneio esportivo', name, input.division),
          ...(input.emoji?.trim() ? { emoji: input.emoji.trim() } : {}),
          shouldIssueCertificate: input.shouldIssueCertificate ?? tournament.shouldIssueCertificate ?? false,
          ...(input.backingEventGroup ?? {}),
          updatedById: actorId,
        };
        eventGroup =
          (await tx.eventGroup.update({ where: { id: eventGroup.id }, data: backingGroupData })) ??
          ({ ...eventGroup, ...backingGroupData } as typeof eventGroup);
      }
      const category = await tx.sportsCategory.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
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
          shouldIssueCertificate: input.shouldIssueCertificate ?? null,
          athleteIdentifierMode: input.athleteIdentifierMode ?? SportsAthleteIdentifierMode.SHIRT_NUMBER,
          joiningInstructions: joiningInstructions ?? null,
          periodsEnabled: input.periodsEnabled ?? false,
          maximumPeriods: input.maximumPeriods ?? null,
          periodLabel: input.periodLabel?.trim() || null,
          timerRules: input.timerRules ?? {},
          scoreRules: input.scoreRules,
          overallScoringRules: input.overallScoringRules ?? {},
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
      if (input.initializeTeamRegistrations !== false) {
        const teams = await tx.sportsTeam.findMany({
          where: { tournamentId: input.tournamentId, deletedAt: null },
          select: { id: true },
        });
        if (teams.length > 0) {
          const now = new Date();
          await tx.sportsRegistration.createMany({
            data: teams.map((team) => ({
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
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: eventGroup.id,
          entityLabel: eventGroup.name,
          operation: existingEventGroup ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor,
          ...(existingEventGroup ? { before: eventContentAuditSnapshot(existingEventGroup) } : {}),
          after: eventContentAuditSnapshot(eventGroup),
          summary: existingEventGroup
            ? 'Grupo de apoio da modalidade atualizado.'
            : 'Grupo de apoio da modalidade criado.',
          scope: {
            permission: existingEventGroup ? Permission.EventGroup.Update : Permission.EventGroup.Create,
            majorEventId: tournament.majorEventId,
            eventGroupId: eventGroup.id,
          },
        },
        tx,
      );
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
    input: Partial<Omit<CreateSportsCategoryInput, 'tournamentId' | 'id' | 'initializeTeamRegistrations'>> & {
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
        tournament: { select: { majorEventId: true, majorEvent: { select: { name: true } } } },
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
        overallScoringRules: input.overallScoringRules ?? (existing.overallScoringRules as Prisma.InputJsonValue),
      });
    }
    if (input.overallScoringRules !== undefined) {
      this.assertOverallScoringRules(input.overallScoringRules);
    }
    if (input.registrationStartDate !== undefined || input.registrationEndDate !== undefined) {
      this.assertOptionalDateRange(
        input.registrationStartDate === undefined ? existing.registrationStartDate : input.registrationStartDate,
        input.registrationEndDate === undefined ? existing.registrationEndDate : input.registrationEndDate,
        'inscrições da modalidade',
      );
    }
    const joiningInstructions = this.normalizeJoiningInstructions(input.joiningInstructions);
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
          ...(input.shouldIssueCertificate !== undefined
            ? { shouldIssueCertificate: input.shouldIssueCertificate }
            : {}),
          ...(input.athleteIdentifierMode !== undefined ? { athleteIdentifierMode: input.athleteIdentifierMode } : {}),
          ...(joiningInstructions !== undefined ? { joiningInstructions } : {}),
          ...(input.periodsEnabled !== undefined ? { periodsEnabled: input.periodsEnabled } : {}),
          ...(input.maximumPeriods !== undefined ? { maximumPeriods: input.maximumPeriods } : {}),
          ...(input.periodLabel !== undefined ? { periodLabel: input.periodLabel?.trim() || null } : {}),
          ...(input.timerRules !== undefined ? { timerRules: input.timerRules } : {}),
          ...(input.scoreRules !== undefined ? { scoreRules: input.scoreRules } : {}),
          ...(input.overallScoringRules !== undefined ? { overallScoringRules: input.overallScoringRules } : {}),
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
      if (
        name !== undefined ||
        input.division !== undefined ||
        input.emoji !== undefined ||
        input.shouldIssueCertificate !== undefined ||
        input.backingEventGroup !== undefined
      ) {
        const tournamentPolicy =
          input.shouldIssueCertificate === null
            ? await tx.sportsTournament.findUniqueOrThrow({
                where: { id: existing.tournamentId },
                select: { shouldIssueCertificate: true },
              })
            : null;
        const effectiveCertificatePolicy =
          input.shouldIssueCertificate === undefined
            ? false
            : (input.shouldIssueCertificate ?? tournamentPolicy?.shouldIssueCertificate ?? false);
        const certificatePatch: EventCertificateSettings = normalizeEventCertificateSettings({
          ...(input.shouldIssueCertificate !== undefined ? { shouldIssueCertificate: effectiveCertificatePolicy } : {}),
          ...(input.backingEventGroup?.shouldIssueCertificateForNonPayingAttendees === false
            ? { shouldIssueCertificateForNonPayingAttendees: false }
            : {}),
          ...(input.backingEventGroup?.shouldIssueCertificateForNonSubscribedAttendees === false
            ? { shouldIssueCertificateForNonSubscribedAttendees: false }
            : {}),
        });
        const backingGroupData = {
          ...(name !== undefined || input.division !== undefined
            ? {
                name: this.backingEventGroupName(
                  existing.tournament.majorEvent?.name ?? 'Torneio esportivo',
                  name ?? existing.name,
                  input.division === undefined ? existing.division : input.division,
                ),
              }
            : {}),
          ...(input.emoji !== undefined
            ? {
                emoji: input.emoji.trim() || this.defaultSportEmoji(input.sport ?? existing.sport),
              }
            : {}),
          ...(input.shouldIssueCertificate !== undefined ? { shouldIssueCertificate: effectiveCertificatePolicy } : {}),
          ...(input.backingEventGroup ?? {}),
          ...(certificatePatch.shouldIssueCertificate === false
            ? {
                shouldIssueCertificateForNonPayingAttendees: false,
                shouldIssueCertificateForNonSubscribedAttendees: false,
                shouldIssueCertificateForEachEvent: false,
                shouldIssuePartialCertificate: false,
              }
            : {}),
          updatedById: actorId,
        };
        const updatedEventGroup =
          (await tx.eventGroup.update({ where: { id: existing.eventGroupId }, data: backingGroupData })) ??
          ({ ...existing.eventGroup, ...backingGroupData } as typeof existing.eventGroup);
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.EVENT_GROUP,
            entityId: updatedEventGroup.id,
            entityLabel: updatedEventGroup.name,
            operation: AuditLogOperation.UPDATE,
            actor,
            before: eventContentAuditSnapshot(existing.eventGroup),
            after: eventContentAuditSnapshot(updatedEventGroup),
            summary: 'Grupo de apoio da modalidade atualizado.',
            scope: {
              permission: Permission.EventGroup.Update,
              majorEventId: existing.tournament.majorEventId,
              eventGroupId: existing.eventGroupId,
            },
          },
          tx,
        );
        if (Object.keys(certificatePatch).length > 0) {
          await tx.event.updateMany({
            where: { eventGroupId: existing.eventGroupId, sportsMatch: { isNot: null }, deletedAt: null },
            data: { ...certificatePatch, updatedById: actorId },
          });
        }
        if (
          input.backingEventGroup?.attendanceEligibility !== undefined ||
          input.backingEventGroup?.audience !== undefined ||
          input.backingEventGroup?.audienceCourseCodes !== undefined
        ) {
          await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
            const events = await tx.event.findMany({
              where: { eventGroupId: existing.eventGroupId, deletedAt: null },
              select: { id: true },
            });
            for (const event of events) await this.attendanceCategories.refreshForEvent(event.id, tx);
          });
        }
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

  private backingEventGroupName(majorEventName: string, categoryName: string, division?: string | null): string {
    return [majorEventName, categoryName, division?.trim() || null].filter(Boolean).join(' — ');
  }

  private async createImportedBackingEventGroup(
    tx: Prisma.TransactionClient,
    input: CreateSportsCategoryInput,
    tournament: {
      majorEventId: string;
      shouldIssueCertificate: boolean;
      majorEvent: { name: string } | null;
    },
    categoryName: string,
    actorId: string,
  ) {
    const eventGroupId = input.eventGroupId;
    if (!eventGroupId) {
      throw new ConflictException('A modalidade importada precisa de um ID estável para o grupo de eventos.');
    }
    const claimedId = await tx.eventGroup.findUnique({
      where: { id: eventGroupId },
      select: { id: true },
    });
    if (claimedId) {
      throw new ConflictException('O ID do grupo de eventos já está em uso.');
    }

    return tx.eventGroup.create({
      data: {
        id: eventGroupId,
        majorEventId: tournament.majorEventId,
        name: this.backingEventGroupName(
          tournament.majorEvent?.name ?? 'Torneio esportivo',
          categoryName,
          input.division,
        ),
        emoji: input.emoji?.trim() || this.defaultSportEmoji(input.sport),
        shouldIssueCertificate: input.shouldIssueCertificate ?? tournament.shouldIssueCertificate,
        ...(input.backingEventGroup ?? {}),
        createdById: actorId,
        updatedById: actorId,
      },
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
      await this.assertBackingEventGroupsHaveNoOrdinaryEvents(tx, category.eventGroupId);
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
        softDeleteSportsMatchBackingEvents(
          tx,
          matches.map((match) => match.eventId),
          deletedAt,
          actorId,
        ),
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

  private assertOverallScoringRules(value: Prisma.InputJsonValue | undefined): void {
    if (value === undefined) {
      return;
    }
    try {
      assertSportsOverallScoringRules(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Regras de pontuação geral inválidas.');
    }
  }

  private normalizeJoiningInstructions(value: string | null | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    const normalized = value?.trim() || null;
    if (normalized && normalized.length > 4_000) {
      throw new BadRequestException('As instruções para atletas devem ter no máximo 4.000 caracteres.');
    }
    return normalized;
  }
}
