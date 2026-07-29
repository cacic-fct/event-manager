import { type FormElement } from '@cacic-fct/form-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  PublicationState,
  SportsCategoryStatus,
  SportsBracketSide,
  SportsEligibilityStatus,
  SportsFormat,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsScoringMode,
  SportsScoreEntrySource,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { normalizeAnswers } from '../event-forms/event-form-answer-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableSportsTransaction } from './sports-transaction';
import { syncSportsMatchEventName } from './sports-match-event-sync';

export interface CreateSportsTournamentInput {
  name: string;
  emoji?: string;
  startDate: Date;
  endDate: Date;
  description?: string | null;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  selfSubscriptionEnabled?: boolean;
  allowPlayerMultipleTeams?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface UpdateSportsTournamentInput {
  expectedRevision: number;
  status?: SportsTournamentStatus;
  finishedAt?: Date | null;
  selfSubscriptionEnabled?: boolean;
  allowPlayerMultipleTeams?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface CreateSportsCategoryInput {
  tournamentId: string;
  eventGroupId?: string;
  name: string;
  emoji?: string;
  sport: SportsPreset;
  customSportName?: string | null;
  division?: string | null;
  format: SportsFormat;
  status?: SportsCategoryStatus;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  minimumRosterSize?: number | null;
  maximumRosterSize?: number | null;
  maximumCaptains?: number | null;
  maximumCoaches?: number | null;
  allowPlayerMultipleTeams?: boolean | null;
  periodsEnabled?: boolean;
  maximumPeriods?: number | null;
  periodLabel?: string | null;
  scoreRules: Prisma.InputJsonValue;
  rosterRules: Prisma.InputJsonValue;
  bracketRules: Prisma.InputJsonValue;
  standingsRules: Prisma.InputJsonValue;
  rulesText?: string | null;
  registrationFormId?: string | null;
}

export interface CreateSportsMatchInput {
  categoryId: string;
  eventId?: string;
  name?: string;
  stageId?: string | null;
  venueId?: string | null;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  startDate?: Date;
  endDate?: Date;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  publishImmediately?: boolean;
  winnerAdvancesToId?: string | null;
  winnerAdvancesToSide?: SportsBracketSide | null;
  loserAdvancesToId?: string | null;
  loserAdvancesToSide?: SportsBracketSide | null;
}

@Injectable()
export class SportsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frozen: FrozenResourceService,
    private readonly auditLog: AuditLogService,
  ) {}

  async attachTournament(
    input: {
      majorEventId: string;
      status?: SportsTournamentStatus;
      selfSubscriptionEnabled?: boolean;
      allowPlayerMultipleTeams?: boolean;
      scoringMode?: SportsScoringMode;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    await this.frozen.assertMajorEventMutable(input.majorEventId, actor, 'edit');
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
              selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
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
              selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
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
    this.assertOptionalDateRange(
      input.registrationStartDate,
      input.registrationEndDate,
      'inscrições do torneio',
    );
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
          selfSubscriptionEnabled: input.selfSubscriptionEnabled ?? false,
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

  async updateTournament(
    tournamentId: string,
    input: UpdateSportsTournamentInput,
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsTournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { majorEvent: true },
    });
    if (!existing) {
      throw new NotFoundException(`Sports tournament ${tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(existing.majorEventId, actor, 'edit');

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
          ...(input.selfSubscriptionEnabled !== undefined
            ? { selfSubscriptionEnabled: input.selfSubscriptionEnabled }
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

  async createCategory(input: CreateSportsCategoryInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    this.validateRosterLimits(input);
    this.assertOptionalDateRange(
      input.registrationStartDate,
      input.registrationEndDate,
      'inscrições da modalidade',
    );
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
      await this.assertRegistrationFormForMajorEvent(
        tx,
        input.registrationFormId,
        tournament.majorEventId,
      );
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
        throw new ConflictException(
          'O grupo de eventos não existe ou já pertence a outra modalidade.',
        );
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
        rosterRules: input.rosterRules ?? (existing.rosterRules as Prisma.InputJsonValue),
        bracketRules: input.bracketRules ?? (existing.bracketRules as Prisma.InputJsonValue),
        standingsRules:
          input.standingsRules ?? (existing.standingsRules as Prisma.InputJsonValue),
      });
    }
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertRegistrationFormForMajorEvent(
        tx,
        input.registrationFormId,
        existing.tournament.majorEventId,
      );
      const name =
        input.name !== undefined
          ? this.requireText(input.name, 'nome da modalidade', 2, 160)
          : undefined;
      const duplicate = await tx.sportsCategory.findFirst({
        where: {
          id: { not: categoryId },
          tournamentId: existing.tournamentId,
          name: {
            equals: name ?? existing.name,
            mode: 'insensitive',
          },
          division:
            input.division === undefined
              ? existing.division
              : input.division?.trim() || null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'Já existe uma modalidade com este nome e divisão no torneio.',
        );
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
          ...(input.customSportName !== undefined
            ? { customSportName: input.customSportName?.trim() || null }
            : {}),
          ...(input.division !== undefined
            ? { division: input.division?.trim() || null }
            : {}),
          ...(input.format !== undefined ? { format: input.format } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.registrationStartDate !== undefined
            ? { registrationStartDate: input.registrationStartDate }
            : {}),
          ...(input.registrationEndDate !== undefined
            ? { registrationEndDate: input.registrationEndDate }
            : {}),
          ...(input.minimumRosterSize !== undefined
            ? { minimumRosterSize: input.minimumRosterSize }
            : {}),
          ...(input.maximumRosterSize !== undefined
            ? { maximumRosterSize: input.maximumRosterSize }
            : {}),
          ...(input.maximumCaptains !== undefined
            ? { maximumCaptains: input.maximumCaptains }
            : {}),
          ...(input.maximumCoaches !== undefined
            ? { maximumCoaches: input.maximumCoaches }
            : {}),
          ...(input.allowPlayerMultipleTeams !== undefined
            ? { allowPlayerMultipleTeams: input.allowPlayerMultipleTeams }
            : {}),
          ...(input.periodsEnabled !== undefined
            ? { periodsEnabled: input.periodsEnabled }
            : {}),
          ...(input.maximumPeriods !== undefined
            ? { maximumPeriods: input.maximumPeriods }
            : {}),
          ...(input.periodLabel !== undefined
            ? { periodLabel: input.periodLabel?.trim() || null }
            : {}),
          ...(input.scoreRules !== undefined ? { scoreRules: input.scoreRules } : {}),
          ...(input.rosterRules !== undefined
            ? { rosterRules: input.rosterRules }
            : {}),
          ...(input.bracketRules !== undefined
            ? { bracketRules: input.bracketRules }
            : {}),
          ...(input.standingsRules !== undefined
            ? { standingsRules: input.standingsRules }
            : {}),
          ...(input.rulesText !== undefined
            ? { rulesText: input.rulesText?.trim() || null }
            : {}),
          ...(input.registrationFormId !== undefined
            ? { registrationFormId: input.registrationFormId }
            : {}),
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
      if (name !== undefined) {
        await tx.eventGroup.update({
          where: { id: existing.eventGroupId },
          data: { name, updatedById: actorId },
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
          fieldRevisions: { name: 1, institution: 1 },
          createdById: actorId,
          updatedById: actorId,
        },
      });
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
    await this.frozen.assertMajorEventMutable(
      existing.tournament.majorEventId,
      actor,
      'edit',
    );
    const nextRevision = existing.revision + 1;
    const fields = this.readRevisionMap(existing.fieldRevisions);
    const name =
      input.name === undefined
        ? undefined
        : this.requireText(input.name, 'nome da equipe', 2, 120);
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
        throw new ConflictException(
          'Já existe uma equipe com este nome no torneio.',
        );
      }
      const updated = await tx.sportsTeam.updateMany({
        where: { id: teamId, revision: input.expectedRevision, deletedAt: null },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.institution !== undefined
            ? { institution: input.institution?.trim() || null }
            : {}),
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

  async revokeRepresentative(
    representativeId: string,
    actor: AuthenticatedUser,
  ) {
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
      throw new NotFoundException(
        `Sports representative ${representativeId} was not found.`,
      );
    }
    await this.frozen.assertMajorEventMutable(
      representative.team.tournament.majorEventId,
      actor,
      'edit',
    );
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
        throw new ConflictException(
          'A atribuição de representante mudou. Recarregue e tente novamente.',
        );
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
      const formData = this.buildRegistrationFormData(
        category,
        input.formAnswers,
      );
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
      throw new NotFoundException(
        `Sports registration ${registrationId} was not found.`,
      );
    }
    await this.frozen.assertEventGroupMutable(
      registration.category.eventGroupId,
      actor,
      'edit',
    );
    const normalizedFormAnswers =
      input.formAnswers === undefined
        ? undefined
        : this.normalizeRegistrationUpdateAnswers(
            registration.formSchemaSnapshot,
            input.formAnswers,
          );
    const approved =
      input.status === SportsRegistrationStatus.APPROVED ||
      input.status === SportsRegistrationStatus.ACTIVE;
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
          ...(normalizedFormAnswers !== undefined
            ? { formAnswers: normalizedFormAnswers }
            : {}),
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
      throw new NotFoundException(
        `Sports registration ${input.registrationId} was not found.`,
      );
    }
    await this.frozen.assertEventGroupMutable(
      registrationScope.category.eventGroupId,
      actor,
      'edit',
    );

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
      await this.assertRoleLimit(tx, registration.category, registration.id, input.role);

      const existing = await tx.sportsRegistrationMember.findFirst({
        where: {
          registrationId: registration.id,
          teamMemberId: member.id,
          role: input.role,
          deletedAt: null,
        },
      });
      if (existing) {
        return existing;
      }
      const assignment = await tx.sportsRegistrationMember.create({
        data: {
          registrationId: registration.id,
          categoryId: registration.categoryId,
          teamMemberId: member.id,
          role: input.role,
          eligibility:
            member.participant.status === 'ACTIVE'
              ? SportsEligibilityStatus.ELIGIBLE
              : SportsEligibilityStatus.PENDING,
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

  async createVenue(
    input: {
      tournamentId: string;
      placePresetId: string;
      name: string;
      courtLabel?: string | null;
      capacity?: number | null;
      notes?: string | null;
      parentVenueId?: string | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    if (
      input.capacity !== undefined &&
      input.capacity !== null &&
      (!Number.isInteger(input.capacity) || input.capacity < 0)
    ) {
      throw new BadRequestException('A capacidade deve ser um número inteiro não negativo.');
    }
    const scope = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!scope) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(scope.majorEventId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [tournament, place] = await Promise.all([
        tx.sportsTournament.findFirst({
          where: { id: input.tournamentId, deletedAt: null },
          select: { majorEventId: true },
        }),
        tx.placePreset.findFirst({
          where: { id: input.placePresetId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (!tournament || !place) {
        throw new NotFoundException('Torneio ou local não encontrado.');
      }
      if (input.parentVenueId) {
        const parent = await tx.sportsVenue.findFirst({
          where: {
            id: input.parentVenueId,
            tournamentId: input.tournamentId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('O local pai não pertence ao torneio.');
        }
      }
      const venue = await tx.sportsVenue.create({
        data: {
          tournamentId: input.tournamentId,
          placePresetId: input.placePresetId,
          name: this.requireText(input.name, 'nome do local', 2, 120),
          courtLabel: input.courtLabel?.trim() || null,
          capacity: input.capacity ?? null,
          notes: input.notes?.trim() || null,
          parentVenueId: input.parentVenueId ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: venue.id,
          entityLabel: venue.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: venue,
          summary: 'Local esportivo criado.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: tournament.majorEventId,
          },
        },
        tx,
      );
      return venue;
    });
  }

  async updateVenue(
    venueId: string,
    input: {
      tournamentId: string;
      expectedRevision: number;
      placePresetId?: string;
      name?: string;
      courtLabel?: string | null;
      capacity?: number | null;
      notes?: string | null;
      parentVenueId?: string | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsVenue.findFirst({
      where: { id: venueId, deletedAt: null },
      include: {
        tournament: { select: { majorEventId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Sports venue ${venueId} was not found.`);
    }
    if (existing.tournamentId !== input.tournamentId) {
      throw new BadRequestException('O local não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(
      existing.tournament.majorEventId,
      actor,
      'edit',
    );

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      if (input.placePresetId !== undefined) {
        const place = await tx.placePreset.findFirst({
          where: { id: input.placePresetId, deletedAt: null },
          select: { id: true },
        });
        if (!place) {
          throw new NotFoundException('Local base não encontrado.');
        }
      }
      if (input.parentVenueId !== undefined && input.parentVenueId !== null) {
        if (input.parentVenueId === venueId) {
          throw new BadRequestException('Um local não pode ser pai dele mesmo.');
        }
        const parent = await tx.sportsVenue.findFirst({
          where: {
            id: input.parentVenueId,
            tournamentId: existing.tournamentId,
            deletedAt: null,
          },
          select: {
            id: true,
            parentVenueId: true,
          },
        });
        if (!parent) {
          throw new BadRequestException('O local pai não pertence ao torneio.');
        }
        await this.assertVenueParentChain(
          tx,
          venueId,
          parent.id,
          existing.tournamentId,
        );
      }
      if (
        input.capacity !== undefined &&
        input.capacity !== null &&
        (!Number.isInteger(input.capacity) || input.capacity < 0)
      ) {
        throw new BadRequestException('A capacidade deve ser um número inteiro não negativo.');
      }
      const name =
        input.name === undefined
          ? undefined
          : this.requireText(input.name, 'nome do local', 2, 120);
      const updated = await tx.sportsVenue.updateMany({
        where: {
          id: venueId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.placePresetId !== undefined
            ? { placePresetId: input.placePresetId }
            : {}),
          ...(name !== undefined ? { name } : {}),
          ...(input.courtLabel !== undefined
            ? { courtLabel: input.courtLabel?.trim() || null }
            : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.notes !== undefined
            ? { notes: input.notes?.trim() || null }
            : {}),
          ...(input.parentVenueId !== undefined
            ? { parentVenueId: input.parentVenueId }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O local mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsVenue.findUniqueOrThrow({
        where: { id: venueId },
        include: { placePreset: true },
      });

      if (
        input.placePresetId !== undefined ||
        input.name !== undefined ||
        input.courtLabel !== undefined
      ) {
        await tx.event.updateMany({
          where: {
            deletedAt: null,
            sportsMatch: {
              is: {
                venueId,
                deletedAt: null,
              },
            },
          },
          data: {
            latitude: result.placePreset.latitude,
            longitude: result.placePreset.longitude,
            locationDescription: [
              result.placePreset.locationDescription,
              result.name,
              result.courtLabel,
            ]
              .filter(Boolean)
              .join(' · '),
            updatedById: actorId,
          },
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: result.id,
          entityLabel: result.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: existing,
          after: result,
          summary: 'Local esportivo atualizado.',
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

  async createMatch(input: CreateSportsMatchInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    if ((input.startDate && !input.endDate) || (!input.startDate && input.endDate)) {
      throw new BadRequestException('Informe o início e o fim da partida.');
    }
    if (input.startDate && input.endDate) {
      this.assertDateRange(input.startDate, input.endDate, 'partida');
    }
    if (!input.eventId && (!input.startDate || !input.endDate)) {
      throw new BadRequestException(
        'Informe início e fim ao criar um novo evento para a partida.',
      );
    }

    const categoryScope = await this.prisma.sportsCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { eventGroupId: true },
    });
    if (!categoryScope) {
      throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(categoryScope.eventGroupId, actor, 'edit');
    if (input.eventId) {
      await this.frozen.assertEventMutable(input.eventId, actor, 'edit');
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const category = await tx.sportsCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: {
            include: {
              majorEvent: true,
            },
          },
        },
      });
      if (!category) {
        throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
      }
      const [home, away, venue, stage] = await Promise.all([
        this.findRegistration(tx, input.homeRegistrationId, category.id),
        this.findRegistration(tx, input.awayRegistrationId, category.id),
        this.findVenue(tx, input.venueId, category.tournamentId),
        this.findStage(tx, input.stageId, category.id),
      ]);
      if (home && away && home.id === away.id) {
        throw new BadRequestException('Uma equipe não pode jogar contra si mesma.');
      }
      await this.assertAdvancementTargets(
        tx,
        category.id,
        null,
        [input.winnerAdvancesToId, input.loserAdvancesToId],
      );

      const generatedName = this.buildMatchName(
        category.name,
        home?.team.name,
        away?.team.name,
      );
      const requestedName =
        input.name === undefined
          ? undefined
          : this.requireText(input.name, 'nome da partida', 2, 160);
      const event = input.eventId
        ? await this.attachCompatibleEvent(
            tx,
            input.eventId,
            {
              majorEventId: category.tournament.majorEventId,
              eventGroupId: category.eventGroupId,
              name: requestedName,
              startDate: input.startDate,
              endDate: input.endDate,
              venue,
            },
            actorId,
          )
        : await tx.event.create({
            data: {
              name: requestedName || generatedName,
              emoji: category.eventGroup.emoji,
              startDate: this.requireDate(input.startDate, 'início da partida'),
              endDate: this.requireDate(input.endDate, 'fim da partida'),
              type: 'OTHER',
              majorEventId: category.tournament.majorEventId,
              eventGroupId: category.eventGroupId,
              latitude: venue?.placePreset.latitude ?? null,
              longitude: venue?.placePreset.longitude ?? null,
              locationDescription: venue
                ? [
                    venue.placePreset.locationDescription,
                    venue.name,
                    venue.courtLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : null,
              allowSubscription: false,
              shouldCollectAttendance: true,
              publiclyVisible: Boolean(home && away),
              publicationState:
                input.publishImmediately === true &&
                category.tournament.majorEvent.publicationState ===
                  PublicationState.PUBLISHED
                  ? PublicationState.PUBLISHED
                  : PublicationState.DRAFT,
              publishedAt:
                input.publishImmediately === true &&
                category.tournament.majorEvent.publicationState ===
                  PublicationState.PUBLISHED
                  ? new Date()
                  : null,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      const match = await tx.sportsMatch.create({
        data: {
          eventId: event.id,
          categoryId: category.id,
          stageId: stage?.id ?? null,
          venueId: venue?.id ?? null,
          homeRegistrationId: home?.id ?? null,
          awayRegistrationId: away?.id ?? null,
          roundNumber: input.roundNumber ?? null,
          bracketPosition: input.bracketPosition ?? null,
          groupKey: input.groupKey?.trim() || null,
          winnerAdvancesToId: input.winnerAdvancesToId ?? null,
          winnerAdvancesToSide: input.winnerAdvancesToSide ?? null,
          loserAdvancesToId: input.loserAdvancesToId ?? null,
          loserAdvancesToSide: input.loserAdvancesToSide ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
        include: { event: true },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH,
          entityId: match.id,
          entityLabel: event.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.matchAuditSnapshot(match),
          summary: 'Partida criada.',
          scope: {
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
            eventId: event.id,
          },
        },
        tx,
      );
      return match;
    });
  }

  async updateMatch(
    matchId: string,
    input: {
      expectedRevision: number;
      startDate?: Date;
      endDate?: Date;
      stageId?: string | null;
      venueId?: string | null;
      homeRegistrationId?: string | null;
      awayRegistrationId?: string | null;
      state?: import('@prisma/client').SportsMatchState;
      roundNumber?: number | null;
      bracketPosition?: number | null;
      groupKey?: string | null;
      winnerAdvancesToId?: string | null;
      winnerAdvancesToSide?: import('@prisma/client').SportsBracketSide | null;
      loserAdvancesToId?: string | null;
      loserAdvancesToSide?: import('@prisma/client').SportsBracketSide | null;
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
        input.venueId === undefined
          ? null
          : this.findVenue(tx, input.venueId, match.category.tournamentId),
        input.stageId === undefined
          ? null
          : this.findStage(tx, input.stageId, match.categoryId),
      ]);
      const homeId =
        input.homeRegistrationId === undefined
          ? match.homeRegistrationId
          : home?.id ?? null;
      const awayId =
        input.awayRegistrationId === undefined
          ? match.awayRegistrationId
          : away?.id ?? null;
      if (homeId && homeId === awayId) {
        throw new BadRequestException('Uma equipe não pode jogar contra si mesma.');
      }
      await this.assertAdvancementTargets(
        tx,
        match.categoryId,
        match.id,
        [
          input.winnerAdvancesToId === undefined
            ? match.winnerAdvancesToId
            : input.winnerAdvancesToId,
          input.loserAdvancesToId === undefined
            ? match.loserAdvancesToId
            : input.loserAdvancesToId,
        ],
      );
      const updated = await tx.sportsMatch.updateMany({
        where: {
          id: match.id,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.stageId !== undefined ? { stageId: stage?.id ?? null } : {}),
          ...(input.venueId !== undefined ? { venueId: venue?.id ?? null } : {}),
          ...(input.homeRegistrationId !== undefined
            ? { homeRegistrationId: homeId }
            : {}),
          ...(input.awayRegistrationId !== undefined
            ? { awayRegistrationId: awayId }
            : {}),
          ...(input.roundNumber !== undefined
            ? { roundNumber: input.roundNumber }
            : {}),
          ...(input.bracketPosition !== undefined
            ? { bracketPosition: input.bracketPosition }
            : {}),
          ...(input.groupKey !== undefined
            ? { groupKey: input.groupKey?.trim() || null }
            : {}),
          ...(input.winnerAdvancesToId !== undefined
            ? { winnerAdvancesToId: input.winnerAdvancesToId }
            : {}),
          ...(input.winnerAdvancesToSide !== undefined
            ? { winnerAdvancesToSide: input.winnerAdvancesToSide }
            : {}),
          ...(input.loserAdvancesToId !== undefined
            ? { loserAdvancesToId: input.loserAdvancesToId }
            : {}),
          ...(input.loserAdvancesToSide !== undefined
            ? { loserAdvancesToSide: input.loserAdvancesToSide }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A partida mudou. Recarregue e tente novamente.');
      }
      await tx.event.update({
        where: { id: match.eventId },
        data: {
          startDate,
          endDate,
          ...(venue
            ? {
                latitude: venue.placePreset.latitude,
                longitude: venue.placePreset.longitude,
                locationDescription: [
                  venue.placePreset.locationDescription,
                  venue.name,
                  venue.courtLabel,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }
            : input.venueId === null
              ? {
                  latitude: null,
                  longitude: null,
                  locationDescription: null,
                }
              : {}),
          updatedById: actorId,
        },
      });
      if (
        input.homeRegistrationId !== undefined ||
        input.awayRegistrationId !== undefined
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

  async assignOfficial(
    input: {
      tournamentId: string;
      categoryId?: string | null;
      matchId?: string | null;
      personId: string;
      role: SportsOfficialRole;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [tournament, person] = await Promise.all([
        tx.sportsTournament.findFirst({
          where: { id: input.tournamentId, deletedAt: null },
          select: { majorEventId: true },
        }),
        tx.people.findFirst({
          where: { id: input.personId, deletedAt: null },
          select: { id: true, name: true, userId: true },
        }),
      ]);
      if (!tournament || !person) {
        throw new NotFoundException('Torneio ou pessoa não encontrada.');
      }
      if (!person.userId) {
        throw new BadRequestException('A pessoa designada precisa possuir uma conta vinculada.');
      }
      let eventGroupId: string | null = null;
      let eventId: string | null = null;
      if (input.categoryId) {
        const category = await tx.sportsCategory.findFirst({
          where: {
            id: input.categoryId,
            tournamentId: input.tournamentId,
            deletedAt: null,
          },
        });
        if (!category) {
          throw new BadRequestException('A modalidade não pertence ao torneio.');
        }
        eventGroupId = category.eventGroupId;
      }
      if (input.matchId) {
        const match = await tx.sportsMatch.findFirst({
          where: {
            id: input.matchId,
            category: {
              tournamentId: input.tournamentId,
            },
            deletedAt: null,
          },
          select: {
            categoryId: true,
            eventId: true,
            category: { select: { eventGroupId: true } },
          },
        });
        if (!match || (input.categoryId && match.categoryId !== input.categoryId)) {
          throw new BadRequestException('A partida não pertence ao escopo selecionado.');
        }
        eventId = match.eventId;
        eventGroupId = match.category.eventGroupId;
      }
      await this.assertOfficialScopeMutable(
        {
          majorEventId: tournament.majorEventId,
          eventGroupId,
          eventId,
        },
        actor,
        'edit',
      );

      const existing = await tx.sportsOfficialAssignment.findFirst({
        where: {
          tournamentId: input.tournamentId,
          categoryId: input.categoryId ?? null,
          matchId: input.matchId ?? null,
          personId: input.personId,
          role: input.role,
        },
      });
      const assignment = existing
        ? await tx.sportsOfficialAssignment.update({
            where: { id: existing.id },
            data: {
              active: true,
              assignedAt: new Date(),
              assignedById: actorId,
              revokedAt: null,
              revokedById: null,
              revision: { increment: 1 },
            },
          })
        : await tx.sportsOfficialAssignment.create({
            data: {
              tournamentId: input.tournamentId,
              categoryId: input.categoryId ?? null,
              matchId: input.matchId ?? null,
              personId: input.personId,
              role: input.role,
              assignedById: actorId,
            },
          });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: assignment.id,
          entityLabel: `${person.name} · ${input.role}`,
          operation: AuditLogOperation.ASSIGN,
          actor,
          after: {
            personId: person.id,
            role: input.role,
            categoryId: input.categoryId ?? null,
            matchId: input.matchId ?? null,
          },
          summary: 'Responsável de partida designado.',
          scope: { majorEventId: tournament.majorEventId },
        },
        tx,
      );
      return assignment;
    });
  }

  async updateOfficial(
    assignmentId: string,
    input: {
      expectedRevision: number;
      role?: SportsOfficialRole;
      active?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        tournament: { select: { majorEventId: true } },
        category: { select: { eventGroupId: true } },
        match: { select: { eventId: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Sports official assignment ${assignmentId} was not found.`,
      );
    }
    await this.assertOfficialScopeMutable(
      {
        majorEventId: assignment.tournament.majorEventId,
        eventGroupId: assignment.category?.eventGroupId ?? null,
        eventId: assignment.match?.eventId ?? null,
      },
      actor,
      'edit',
    );
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const active = input.active ?? assignment.active;
      const changed = await tx.sportsOfficialAssignment.updateMany({
        where: {
          id: assignment.id,
          revision: input.expectedRevision,
        },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          active,
          ...(active
            ? { revokedAt: null, revokedById: null, assignedAt: new Date() }
            : { revokedAt: new Date(), revokedById: actorId }),
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'A atribuição do responsável mudou. Recarregue e tente novamente.',
        );
      }
      const result = await tx.sportsOfficialAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: result.id,
          entityLabel: result.id,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.officialAuditSnapshot(assignment),
          after: this.officialAuditSnapshot(result),
          summary: active
            ? 'Atribuição de responsável atualizada.'
            : 'Responsável removido da partida.',
          scope: { majorEventId: assignment.tournament.majorEventId },
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
      throw new NotFoundException(
        `Sports tournament ${input.tournamentId} was not found.`,
      );
    }
    await this.frozen.assertMajorEventMutable(tournament.majorEventId, actor, 'edit');
    this.assertManualScoreEntry(input);

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      await this.assertScoreEntryTargets(
        tx,
        input.tournamentId,
        input.teamId,
        input.categoryId,
      );
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
    await this.frozen.assertMajorEventMutable(
      existing.tournament.majorEventId,
      actor,
      'edit',
    );
    const source = input.source ?? existing.source;
    const points = input.points ?? existing.points;
    this.assertManualScoreEntry({ source, points, sourceMatchId: null });

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const teamId = input.teamId ?? existing.teamId;
      const categoryId =
        input.categoryId === undefined ? existing.categoryId : input.categoryId;
      await this.assertScoreEntryTargets(
        tx,
        existing.tournamentId,
        teamId,
        categoryId,
      );
      const changed = await tx.sportsTournamentScoreEntry.updateMany({
        where: {
          id: entryId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.points !== undefined ? { points: input.points } : {}),
          ...(input.reason !== undefined
            ? {
                reason: this.requireText(
                  input.reason,
                  'motivo do ajuste',
                  2,
                  240,
                ),
              }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'O ajuste de pontuação mudou. Recarregue e tente novamente.',
        );
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
    await this.frozen.assertMajorEventMutable(
      existing.tournament.majorEventId,
      actor,
      'delete',
    );
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
        throw new ConflictException(
          'O ajuste de pontuação mudou. Recarregue e tente novamente.',
        );
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

  async deleteTournament(
    tournamentId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
        tx.event.updateMany({
          where: { id: { in: eventIds }, deletedAt: null },
          data: { deletedAt, updatedById: actorId },
        }),
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

  async deleteCategory(
    categoryId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
            OR: [
              { categoryId },
              { matchId: { in: matches.map((match) => match.id) } },
            ],
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

  async deleteTeam(
    teamId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
            notIn: [
              SportsMatchState.FINISHED,
              SportsMatchState.DRAW,
              SportsMatchState.CANCELED,
            ],
          },
          OR: [
            { homeRegistration: { teamId, deletedAt: null } },
            { awayRegistration: { teamId, deletedAt: null } },
          ],
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

  async deleteRegistration(
    registrationId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
      throw new NotFoundException(
        `Sports registration ${registrationId} was not found.`,
      );
    }
    await this.frozen.assertEventGroupMutable(
      registration.category.eventGroupId,
      actor,
      'delete',
    );

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const activeMatch = await tx.sportsMatch.findFirst({
        where: {
          deletedAt: null,
          state: {
            notIn: [
              SportsMatchState.FINISHED,
              SportsMatchState.DRAW,
              SportsMatchState.CANCELED,
            ],
          },
          OR: [
            { homeRegistrationId: registrationId },
            { awayRegistrationId: registrationId },
          ],
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

  async deleteMatch(
    matchId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
        tx.event.updateMany({
          where: { id: match.eventId, deletedAt: null },
          data: { deletedAt, updatedById: actorId },
        }),
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

  async deleteVenue(
    venueId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
    expectedTournamentId: string,
  ): Promise<void> {
    const actorId = this.requireActorId(actor);
    const venue = await this.prisma.sportsVenue.findFirst({
      where: { id: venueId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!venue) {
      throw new NotFoundException(`Sports venue ${venueId} was not found.`);
    }
    if (venue.tournamentId !== expectedTournamentId) {
      throw new BadRequestException('O local não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(venue.tournament.majorEventId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [activeMatch, childVenue] = await Promise.all([
        tx.sportsMatch.findFirst({
          where: {
            venueId,
            deletedAt: null,
            state: {
              notIn: [
                SportsMatchState.FINISHED,
                SportsMatchState.DRAW,
                SportsMatchState.CANCELED,
              ],
            },
          },
          select: { id: true },
        }),
        tx.sportsVenue.findFirst({
          where: { parentVenueId: venueId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (activeMatch) {
        throw new ConflictException(
          'O local possui uma partida em aberto. Altere a partida primeiro.',
        );
      }
      if (childVenue) {
        throw new ConflictException(
          'O local possui subdivisões ativas. Remova ou mova-as primeiro.',
        );
      }
      const deletedAt = new Date();
      const changed = await tx.sportsVenue.updateMany({
        where: { id: venueId, revision: expectedRevision, deletedAt: null },
        data: { deletedAt, revision: { increment: 1 }, updatedById: actorId },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O local mudou. Recarregue e tente novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: venue.id,
          entityLabel: venue.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: venue,
          after: { ...venue, deletedAt },
          summary: 'Local esportivo excluído.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: venue.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }

  async deleteOfficial(
    assignmentId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const actorId = this.requireActorId(actor);
    const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        tournament: { select: { majorEventId: true } },
        category: { select: { eventGroupId: true } },
        match: { select: { eventId: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Sports official assignment ${assignmentId} was not found.`,
      );
    }
    await this.assertOfficialScopeMutable(
      {
        majorEventId: assignment.tournament.majorEventId,
        eventGroupId: assignment.category?.eventGroupId ?? null,
        eventId: assignment.match?.eventId ?? null,
      },
      actor,
      'delete',
    );
    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const revokedAt = new Date();
      const changed = await tx.sportsOfficialAssignment.updateMany({
        where: {
          id: assignmentId,
          revision: expectedRevision,
          active: true,
        },
        data: {
          active: false,
          revokedAt,
          revokedById: actorId,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'A atribuição do responsável mudou. Recarregue e tente novamente.',
        );
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: assignment.id,
          entityLabel: assignment.id,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.officialAuditSnapshot(assignment),
          after: {
            ...this.officialAuditSnapshot(assignment),
            active: false,
            revokedAt,
          },
          summary: 'Responsável esportivo removido.',
          scope: {
            permission: Permission.SportsOfficial.Delete,
            majorEventId: assignment.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }

  private async attachCompatibleEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    scope: {
      majorEventId: string;
      eventGroupId: string;
      name?: string;
      startDate?: Date;
      endDate?: Date;
      venue: {
        name: string;
        courtLabel: string | null;
        placePreset: {
          latitude: number | null;
          longitude: number | null;
          locationDescription: string | null;
        };
      } | null;
    },
    actorId: string,
  ) {
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { sportsMatch: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }
    if (
      event.majorEventId !== scope.majorEventId ||
      event.eventGroupId !== scope.eventGroupId
    ) {
      throw new BadRequestException(
        'O evento precisa pertencer ao mesmo grande evento e grupo da modalidade.',
      );
    }
    if (event.sportsMatch) {
      throw new ConflictException('O evento selecionado já está vinculado a uma partida.');
    }
    if (event.allowSubscription) {
      throw new ConflictException(
        'Um evento com inscrições próprias não pode ser convertido em partida.',
      );
    }
    const startDate = scope.startDate ?? event.startDate;
    const endDate = scope.endDate ?? event.endDate;
    this.assertDateRange(startDate, endDate, 'partida');
    const name =
      scope.name === undefined
        ? event.name
        : this.requireText(scope.name, 'nome da partida', 2, 160);

    return tx.event.update({
      where: { id: event.id },
      data: {
        name,
        startDate,
        endDate,
        shouldCollectAttendance: true,
        allowSubscription: false,
        ...(scope.venue
          ? {
              latitude: scope.venue.placePreset.latitude,
              longitude: scope.venue.placePreset.longitude,
              locationDescription: [
                scope.venue.placePreset.locationDescription,
                scope.venue.name,
                scope.venue.courtLabel,
              ]
                .filter(Boolean)
                .join(' · '),
            }
          : {}),
        updatedById: actorId,
      },
    });
  }

  private async assertVenueParentChain(
    tx: Prisma.TransactionClient,
    venueId: string,
    parentVenueId: string,
    tournamentId: string,
  ): Promise<void> {
    const visited = new Set([venueId]);
    let currentId: string | null = parentVenueId;
    while (currentId) {
      if (visited.has(currentId)) {
        throw new BadRequestException('A hierarquia de locais não pode conter ciclos.');
      }
      visited.add(currentId);
      const current: { parentVenueId: string | null } | null =
        await tx.sportsVenue.findFirst({
          where: { id: currentId, tournamentId, deletedAt: null },
          select: { parentVenueId: true },
        });
      if (!current) {
        throw new BadRequestException('A hierarquia de locais contém um local inválido.');
      }
      currentId = current.parentVenueId;
    }
  }

  private async assertRegistrationFormForMajorEvent(
    tx: Prisma.TransactionClient,
    formId: string | null | undefined,
    majorEventId: string,
  ): Promise<void> {
    if (!formId) {
      return;
    }
    const form = await tx.eventForm.findFirst({
      where: {
        id: formId,
        ownerMajorEventId: majorEventId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!form) {
      throw new BadRequestException(
        'O formulário de inscrição precisa pertencer ao grande evento do torneio.',
      );
    }
  }

  private assertManualScoreEntry(input: {
    source: SportsScoreEntrySource;
    points: number;
    sourceMatchId?: string | null;
  }): void {
    if (
      input.source !== SportsScoreEntrySource.MANUAL &&
      input.source !== SportsScoreEntrySource.PENALTY
    ) {
      throw new BadRequestException(
        'Ajustes administrativos devem ser manuais ou penalidades.',
      );
    }
    if (input.sourceMatchId) {
      throw new BadRequestException(
        'Ajustes administrativos não podem se passar por pontuação de partida.',
      );
    }
    if (!Number.isInteger(input.points)) {
      throw new BadRequestException('A pontuação deve ser um número inteiro.');
    }
  }

  private async assertOfficialScopeMutable(
    scope: {
      majorEventId: string;
      eventGroupId: string | null;
      eventId: string | null;
    },
    actor: AuthenticatedUser,
    operation: 'edit' | 'delete',
  ): Promise<void> {
    if (scope.eventId) {
      await this.frozen.assertEventMutable(scope.eventId, actor, operation);
      return;
    }
    if (scope.eventGroupId) {
      await this.frozen.assertEventGroupMutable(
        scope.eventGroupId,
        actor,
        operation,
      );
      return;
    }
    await this.frozen.assertMajorEventMutable(
      scope.majorEventId,
      actor,
      operation,
    );
  }

  private buildRegistrationFormData(
    category: {
      registrationFormId: string | null;
      registrationForm: {
        id: string;
        name: string;
        elements: Prisma.JsonValue;
        updatedAt: Date;
        deletedAt: Date | null;
      } | null;
    },
    submittedAnswers: Prisma.InputJsonValue | null | undefined,
  ): {
    formAnswers?: Prisma.InputJsonValue;
    formSchemaSnapshot?: Prisma.InputJsonValue;
  } {
    if (!category.registrationFormId) {
      if (submittedAnswers !== undefined && submittedAnswers !== null) {
        throw new BadRequestException(
          'A modalidade não possui formulário de inscrição configurado.',
        );
      }
      return {};
    }
    const form = category.registrationForm;
    if (!form || form.deletedAt) {
      throw new BadRequestException(
        'O formulário de inscrição configurado não está disponível.',
      );
    }
    const elements = this.readFormElements(
      form.elements,
      'O formulário de inscrição possui uma estrutura inválida.',
    );
    const answers = normalizeAnswers(
      JSON.stringify(submittedAnswers ?? []),
      elements,
      true,
    );
    return {
      formAnswers: answers as unknown as Prisma.InputJsonValue,
      formSchemaSnapshot: {
        version: 1,
        formId: form.id,
        name: form.name,
        elements: form.elements,
        capturedAt: new Date().toISOString(),
        sourceUpdatedAt: form.updatedAt.toISOString(),
      } as Prisma.InputJsonValue,
    };
  }

  private normalizeRegistrationUpdateAnswers(
    snapshot: Prisma.JsonValue | null,
    submittedAnswers: Prisma.InputJsonValue | null,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (submittedAnswers === null && snapshot === null) {
      return Prisma.JsonNull;
    }
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new ConflictException(
        'A inscrição não possui um retrato válido do formulário. Recrie a inscrição antes de editar as respostas.',
      );
    }
    const elements = this.readFormElements(
      (snapshot as Record<string, Prisma.JsonValue>)['elements'],
      'O retrato do formulário da inscrição está inválido.',
    );
    return normalizeAnswers(
      JSON.stringify(submittedAnswers ?? []),
      elements,
      true,
    ) as unknown as Prisma.InputJsonValue;
  }

  private readFormElements(
    value: Prisma.JsonValue | undefined,
    errorMessage: string,
  ): FormElement[] {
    if (!Array.isArray(value)) {
      throw new ConflictException(errorMessage);
    }
    return value as unknown as FormElement[];
  }

  private async assertScoreEntryTargets(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    teamId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    const [team, category] = await Promise.all([
      tx.sportsTeam.findFirst({
        where: { id: teamId, tournamentId, deletedAt: null },
        select: { id: true },
      }),
      categoryId
        ? tx.sportsCategory.findFirst({
            where: { id: categoryId, tournamentId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!team) {
      throw new BadRequestException('A equipe não pertence ao torneio informado.');
    }
    if (categoryId && !category) {
      throw new BadRequestException('A modalidade não pertence ao torneio informado.');
    }
  }

  private async assertAdvancementTargets(
    tx: Prisma.TransactionClient,
    categoryId: string,
    sourceMatchId: string | null,
    targetIds: Array<string | null | undefined>,
  ): Promise<void> {
    const ids = [...new Set(targetIds.filter((id): id is string => Boolean(id)))];
    if (sourceMatchId && ids.includes(sourceMatchId)) {
      throw new BadRequestException(
        'Uma partida não pode encaminhar resultado para ela mesma.',
      );
    }
    if (ids.length === 0) {
      return;
    }
    const targets = await tx.sportsMatch.findMany({
      where: {
        id: { in: ids },
        categoryId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (targets.length !== ids.length) {
      throw new BadRequestException(
        'As partidas de destino precisam pertencer à mesma modalidade.',
      );
    }
    if (!sourceMatchId) {
      return;
    }
    for (const targetId of ids) {
      const visited = new Set<string>();
      const pending = [targetId];
      while (pending.length > 0) {
        const currentId = pending.pop();
        if (!currentId || visited.has(currentId)) {
          continue;
        }
        if (currentId === sourceMatchId) {
          throw new BadRequestException(
            'O encaminhamento criaria um ciclo inválido na chave.',
          );
        }
        visited.add(currentId);
        const current = await tx.sportsMatch.findFirst({
          where: {
            id: currentId,
            categoryId,
            deletedAt: null,
          },
          select: {
            winnerAdvancesToId: true,
            loserAdvancesToId: true,
          },
        });
        if (current?.winnerAdvancesToId) {
          pending.push(current.winnerAdvancesToId);
        }
        if (current?.loserAdvancesToId) {
          pending.push(current.loserAdvancesToId);
        }
      }
    }
  }

  private async findRegistration(
    tx: Prisma.TransactionClient,
    registrationId: string | null | undefined,
    categoryId: string,
  ) {
    if (!registrationId) {
      return null;
    }
    const registration = await tx.sportsRegistration.findFirst({
      where: {
        id: registrationId,
        categoryId,
        deletedAt: null,
        status: {
          in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
        },
      },
      include: {
        team: {
          select: { name: true },
        },
      },
    });
    if (!registration) {
      throw new BadRequestException('A equipe selecionada não está aprovada nesta modalidade.');
    }
    return registration;
  }

  private async findVenue(
    tx: Prisma.TransactionClient,
    venueId: string | null | undefined,
    tournamentId: string,
  ) {
    if (!venueId) {
      return null;
    }
    const venue = await tx.sportsVenue.findFirst({
      where: {
        id: venueId,
        tournamentId,
        deletedAt: null,
      },
      include: { placePreset: true },
    });
    if (!venue) {
      throw new BadRequestException('O local selecionado não pertence ao torneio.');
    }
    return venue;
  }

  private async findStage(
    tx: Prisma.TransactionClient,
    stageId: string | null | undefined,
    categoryId: string,
  ) {
    if (!stageId) {
      return null;
    }
    const stage = await tx.sportsStage.findFirst({
      where: { id: stageId, categoryId, deletedAt: null },
    });
    if (!stage) {
      throw new BadRequestException('A etapa selecionada não pertence à modalidade.');
    }
    return stage;
  }

  private async assertRoleLimit(
    tx: Prisma.TransactionClient,
    category: {
      id: string;
      maximumCaptains: number | null;
      maximumCoaches: number | null;
    },
    registrationId: string,
    role: SportsRosterRole,
  ): Promise<void> {
    const limit =
      role === SportsRosterRole.CAPTAIN
        ? category.maximumCaptains
        : role === SportsRosterRole.COACH
          ? category.maximumCoaches
          : null;
    if (limit === null) {
      return;
    }
    const count = await tx.sportsRegistrationMember.count({
      where: {
        registrationId,
        role,
        deletedAt: null,
      },
    });
    if (count >= limit) {
      throw new ConflictException(
        role === SportsRosterRole.CAPTAIN
          ? 'A equipe atingiu o limite de capitães.'
          : 'A equipe atingiu o limite de técnicos.',
      );
    }
  }

  private async hasCrossTeamParticipants(tx: Prisma.TransactionClient, tournamentId: string): Promise<boolean> {
    const participants = await tx.sportsTournamentParticipant.findMany({
      where: {
        tournamentId,
        deletedAt: null,
        teamMemberships: {
          some: {
            deletedAt: null,
            team: {
              deletedAt: null,
            },
          },
        },
      },
      select: {
        teamMemberships: {
          where: {
            deletedAt: null,
            team: {
              deletedAt: null,
            },
          },
          select: {
            teamId: true,
          },
        },
      },
    });
    return participants.some(
      (participant) => new Set(participant.teamMemberships.map((membership) => membership.teamId)).size > 1,
    );
  }

  private validateRosterLimits(input: CreateSportsCategoryInput): void {
    for (const [label, value] of [
      ['mínimo do elenco', input.minimumRosterSize],
      ['máximo do elenco', input.maximumRosterSize],
      ['máximo de capitães', input.maximumCaptains],
      ['máximo de técnicos', input.maximumCoaches],
      ['máximo de períodos', input.maximumPeriods],
    ] as const) {
      if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new BadRequestException(`${label} deve ser um número inteiro não negativo.`);
      }
    }
    if (
      input.minimumRosterSize !== null &&
      input.minimumRosterSize !== undefined &&
      input.maximumRosterSize !== null &&
      input.maximumRosterSize !== undefined &&
      input.minimumRosterSize > input.maximumRosterSize
    ) {
      throw new BadRequestException('O mínimo do elenco não pode superar o máximo.');
    }
    if (input.sport === SportsPreset.OTHER && !input.customSportName?.trim()) {
      throw new BadRequestException('Informe o nome do esporte personalizado.');
    }
  }

  private buildMatchName(categoryName: string, home?: string, away?: string): string {
    return `${home ?? 'A definir'} × ${away ?? 'A definir'} — ${categoryName}`;
  }

  private defaultSportEmoji(sport: SportsPreset): string {
    const emojis: Record<SportsPreset, string> = {
      SOCCER: '⚽',
      FUTSAL: '⚽',
      TENNIS: '🎾',
      BASKETBALL: '🏀',
      ESPORTS: '🎮',
      CHESS: '♟️',
      VOLLEYBALL: '🏐',
      SWIMMING: '🏊',
      TABLE_TENNIS: '🏓',
      HANDBALL: '🤾',
      OTHER: '🏅',
    };
    return emojis[sport];
  }

  private assertDateRange(startDate: Date, endDate: Date, label: string): void {
    if (!(startDate instanceof Date) || !(endDate instanceof Date) || endDate <= startDate) {
      throw new BadRequestException(`O fim do ${label} precisa ser posterior ao início.`);
    }
  }

  private assertOptionalDateRange(
    startDate: Date | null | undefined,
    endDate: Date | null | undefined,
    label: string,
  ): void {
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new BadRequestException(`Informe o início e o fim de ${label}.`);
    }
    if (startDate && endDate) {
      this.assertDateRange(startDate, endDate, label);
    }
  }

  private requireText(value: string, label: string, minimum: number, maximum: number): string {
    const normalized = value.trim();
    if (normalized.length < minimum || normalized.length > maximum) {
      throw new BadRequestException(`${label} deve ter entre ${minimum} e ${maximum} caracteres.`);
    }
    return normalized;
  }

  private requireDate(value: Date | undefined, label: string): Date {
    if (!(value instanceof Date)) {
      throw new BadRequestException(`Informe ${label}.`);
    }
    return value;
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O usuário autenticado não possui identificador.');
    }
    return actor.sub;
  }

  private readRevisionMap(value: Prisma.JsonValue): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isInteger(entry[1]),
      ),
    );
  }

  private tournamentAuditSnapshot(tournament: {
    id: string;
    majorEventId: string;
    status: SportsTournamentStatus;
    scoringMode: SportsScoringMode;
    selfSubscriptionEnabled: boolean;
    allowPlayerMultipleTeams: boolean;
    revision: number;
  }) {
    return {
      id: tournament.id,
      majorEventId: tournament.majorEventId,
      status: tournament.status,
      scoringMode: tournament.scoringMode,
      selfSubscriptionEnabled: tournament.selfSubscriptionEnabled,
      allowPlayerMultipleTeams: tournament.allowPlayerMultipleTeams,
      revision: tournament.revision,
    };
  }

  private categoryAuditSnapshot(category: {
    id: string;
    tournamentId: string;
    eventGroupId: string;
    name: string;
    sport: SportsPreset;
    division: string | null;
    format: SportsFormat;
    status: SportsCategoryStatus;
    revision: number;
  }) {
    return {
      id: category.id,
      tournamentId: category.tournamentId,
      eventGroupId: category.eventGroupId,
      name: category.name,
      sport: category.sport,
      division: category.division,
      format: category.format,
      status: category.status,
      revision: category.revision,
    };
  }

  private teamAuditSnapshot(team: {
    id: string;
    tournamentId: string;
    name: string;
    institution: string | null;
    status: SportsTeamStatus;
    revision: number;
  }) {
    return {
      id: team.id,
      tournamentId: team.tournamentId,
      name: team.name,
      institution: team.institution,
      status: team.status,
      revision: team.revision,
    };
  }

  private registrationAuditSnapshot(registration: {
    id: string;
    teamId: string;
    categoryId: string;
    status: SportsRegistrationStatus;
    seed: number | null;
    revision: number;
  }) {
    return {
      id: registration.id,
      teamId: registration.teamId,
      categoryId: registration.categoryId,
      status: registration.status,
      seed: registration.seed,
      revision: registration.revision,
    };
  }

  private officialAuditSnapshot(assignment: {
    id: string;
    tournamentId: string;
    categoryId: string | null;
    matchId: string | null;
    personId: string;
    role: SportsOfficialRole;
    active: boolean;
    revision: number;
  }) {
    return {
      id: assignment.id,
      tournamentId: assignment.tournamentId,
      categoryId: assignment.categoryId,
      matchId: assignment.matchId,
      personId: assignment.personId,
      role: assignment.role,
      active: assignment.active,
      revision: assignment.revision,
    };
  }

  private scoreEntryAuditSnapshot(entry: {
    id: string;
    tournamentId: string;
    categoryId: string | null;
    teamId: string;
    sourceMatchId: string | null;
    source: SportsScoreEntrySource;
    points: number;
    reason: string;
    revision: number;
  }) {
    return {
      id: entry.id,
      tournamentId: entry.tournamentId,
      categoryId: entry.categoryId,
      teamId: entry.teamId,
      sourceMatchId: entry.sourceMatchId,
      source: entry.source,
      points: entry.points,
      reason: entry.reason,
      revision: entry.revision,
    };
  }

  private matchAuditSnapshot(match: {
    id: string;
    eventId: string;
    categoryId: string;
    state: string;
    reviewStatus: string;
    revision: number;
  }) {
    return {
      id: match.id,
      eventId: match.eventId,
      categoryId: match.categoryId,
      state: match.state,
      reviewStatus: match.reviewStatus,
      revision: match.revision,
    };
  }
}
