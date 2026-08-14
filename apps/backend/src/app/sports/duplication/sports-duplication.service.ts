import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { sportsDuplicationEmoji } from './sports-duplication.utils';
import { SportsTeamDuplicationService } from './sports-team-duplication.service';

@Injectable()
export class SportsDuplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly frozen: FrozenResourceService,
    private readonly teamDuplicator: SportsTeamDuplicationService,
  ) {}

  async cloneTournament(
    input: {
      sourceTournamentId: string;
      destinationMajorEventId: string;
      parts?: {
        categories?: boolean;
        teams?: boolean;
        registrations?: boolean;
        venues?: boolean;
        officials?: boolean;
        rules?: boolean;
      };
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    await this.frozen.assertMajorEventMutable(input.destinationMajorEventId, actor, 'edit');
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [source, destinationMajorEvent] = await Promise.all([
        tx.sportsTournament.findFirst({
          where: { id: input.sourceTournamentId, deletedAt: null },
          include: {
            majorEvent: true,
            categories: {
              where: { deletedAt: null },
              include: {
                registrations: { where: { deletedAt: null } },
              },
            },
            teams: { where: { deletedAt: null } },
            venues: { where: { deletedAt: null } },
            officials: {
              where: { active: true, revokedAt: null, matchId: null },
            },
          },
        }),
        tx.majorEvent.findFirst({
          where: { id: input.destinationMajorEventId, deletedAt: null },
          include: { sportsTournament: true },
        }),
      ]);
      if (!source || !destinationMajorEvent) {
        throw new NotFoundException('Torneio de origem ou grande evento de destino não encontrado.');
      }
      if (destinationMajorEvent.sportsTournament && !destinationMajorEvent.sportsTournament.deletedAt) {
        throw new ConflictException('O grande evento de destino já possui um torneio.');
      }
      const parts = input.parts ?? {
        categories: true,
        teams: true,
        registrations: true,
        venues: true,
        officials: true,
        rules: true,
      };
      if (parts.registrations && (!parts.categories || !parts.teams)) {
        throw new BadRequestException('Copiar inscrições exige copiar modalidades e equipes.');
      }
      const tournament = await tx.sportsTournament.create({
        data: {
          majorEventId: destinationMajorEvent.id,
          status: SportsTournamentStatus.DRAFT,
          registrationStartDate: null,
          registrationEndDate: null,
          scoringMode: source.scoringMode,
          selfSubscriptionEnabled: false,
          allowPlayerMultipleTeams: source.allowPlayerMultipleTeams,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const categoryIdMap = new Map<string, string>();
      if (parts.categories) {
        for (const category of source.categories) {
          const eventGroup = await tx.eventGroup.create({
            data: {
              name: category.name,
              emoji: sportsDuplicationEmoji(category.sport),
              createdById: actorId,
              updatedById: actorId,
            },
          });
          const cloned = await tx.sportsCategory.create({
            data: {
              tournamentId: tournament.id,
              eventGroupId: eventGroup.id,
              name: category.name,
              sport: category.sport,
              customSportName: category.customSportName,
              division: category.division,
              format: category.format,
              status: 'DRAFT',
              registrationStartDate: null,
              registrationEndDate: null,
              minimumRosterSize: category.minimumRosterSize,
              maximumRosterSize: category.maximumRosterSize,
              maximumCaptains: category.maximumCaptains,
              maximumCoaches: category.maximumCoaches,
              allowPlayerMultipleTeams: category.allowPlayerMultipleTeams,
              athleteIdentifierMode: category.athleteIdentifierMode,
              joiningInstructions: parts.rules ? category.joiningInstructions : null,
              periodsEnabled: category.periodsEnabled,
              maximumPeriods: category.maximumPeriods,
              periodLabel: category.periodLabel,
              scoreRules: parts.rules ? this.toJson(category.scoreRules) : {},
              overallScoringRules: parts.rules ? this.toJson(category.overallScoringRules) : {},
              rosterRules: parts.rules ? this.toJson(category.rosterRules) : {},
              bracketRules: parts.rules ? this.toJson(category.bracketRules) : {},
              standingsRules: parts.rules ? this.toJson(category.standingsRules) : {},
              rulesText: parts.rules ? category.rulesText : null,
              registrationFormId: null,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          categoryIdMap.set(category.id, cloned.id);
        }
      }
      const teamIdMap = new Map<string, string>();
      if (parts.teams) {
        for (const team of source.teams) {
          const cloned = await tx.sportsTeam.create({
            data: {
              tournamentId: tournament.id,
              name: team.name,
              institution: team.institution,
              status: SportsTeamStatus.DRAFT,
              logoObjectKey: team.logoObjectKey,
              logoSha256: team.logoSha256,
              logoMimeType: team.logoMimeType,
              logoSizeBytes: team.logoSizeBytes,
              fieldRevisions: { name: 1, institution: 1, logo: 1 },
              createdById: actorId,
              updatedById: actorId,
            },
          });
          teamIdMap.set(team.id, cloned.id);
        }
      }
      if (parts.registrations) {
        for (const category of source.categories) {
          for (const registration of category.registrations) {
            const teamId = teamIdMap.get(registration.teamId);
            const categoryId = categoryIdMap.get(category.id);
            if (!teamId || !categoryId) {
              continue;
            }
            await tx.sportsRegistration.create({
              data: {
                teamId,
                categoryId,
                status: SportsRegistrationStatus.DRAFT,
                seed: registration.seed,
                formAnswers: registration.formAnswers ? this.toJson(registration.formAnswers) : undefined,
                formSchemaSnapshot: registration.formSchemaSnapshot
                  ? this.toJson(registration.formSchemaSnapshot)
                  : undefined,
                createdById: actorId,
                updatedById: actorId,
              },
            });
          }
        }
      }
      if (parts.venues) {
        const pendingParents: Array<{
          id: string;
          sourceParentId: string | null;
        }> = [];
        const venueIdMap = new Map<string, string>();
        for (const venue of source.venues) {
          const cloned = await tx.sportsVenue.create({
            data: {
              tournamentId: tournament.id,
              placePresetId: venue.placePresetId,
              name: venue.name,
              courtLabel: venue.courtLabel,
              capacity: venue.capacity,
              notes: venue.notes,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          venueIdMap.set(venue.id, cloned.id);
          pendingParents.push({
            id: cloned.id,
            sourceParentId: venue.parentVenueId,
          });
        }
        for (const venue of pendingParents) {
          const parentVenueId = venue.sourceParentId ? venueIdMap.get(venue.sourceParentId) : null;
          if (parentVenueId) {
            await tx.sportsVenue.update({
              where: { id: venue.id },
              data: { parentVenueId },
            });
          }
        }
      }
      if (parts.officials) {
        for (const official of source.officials) {
          await tx.sportsOfficialAssignment.create({
            data: {
              tournamentId: tournament.id,
              categoryId: official.categoryId ? (categoryIdMap.get(official.categoryId) ?? null) : null,
              personId: official.personId,
              role: official.role,
              assignedById: actorId,
            },
          });
        }
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TOURNAMENT,
          entityId: tournament.id,
          entityLabel: destinationMajorEvent.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: {
            sourceTournamentId: source.id,
            copiedParts: parts,
          },
          summary: 'Torneio esportivo duplicado.',
          scope: { majorEventId: destinationMajorEvent.id },
          force: true,
        },
        tx,
      );
      return tournament;
    });
  }

  async cloneCategory(
    input: {
      sourceCategoryId: string;
      destinationTournamentId: string;
      name?: string;
      includeRegistrations?: boolean;
      includeStages?: boolean;
      includeOfficials?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const destinationScope = await this.prisma.sportsTournament.findFirst({
      where: { id: input.destinationTournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!destinationScope) {
      throw new NotFoundException('Torneio esportivo de destino não encontrado.');
    }
    await this.frozen.assertMajorEventMutable(destinationScope.majorEventId, actor, 'edit');
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [source, destination] = await Promise.all([
        tx.sportsCategory.findFirst({
          where: { id: input.sourceCategoryId, deletedAt: null },
          include: {
            eventGroup: true,
            registrations: {
              where: { deletedAt: null },
              include: { team: true },
            },
            stages: {
              where: { deletedAt: null },
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            },
            officialAssignments: {
              where: {
                active: true,
                revokedAt: null,
                matchId: null,
              },
            },
          },
        }),
        tx.sportsTournament.findFirst({
          where: { id: input.destinationTournamentId, deletedAt: null },
        }),
      ]);
      if (!source || !destination) {
        throw new NotFoundException('Modalidade de origem ou torneio de destino não encontrado.');
      }
      const name = input.name?.trim() || source.name;
      const eventGroup = await tx.eventGroup.create({
        data: {
          name,
          emoji: source.eventGroup.emoji,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const category = await tx.sportsCategory.create({
        data: {
          tournamentId: destination.id,
          eventGroupId: eventGroup.id,
          name,
          sport: source.sport,
          customSportName: source.customSportName,
          division: source.division,
          format: source.format,
          status: SportsCategoryStatus.DRAFT,
          registrationStartDate: null,
          registrationEndDate: null,
          minimumRosterSize: source.minimumRosterSize,
          maximumRosterSize: source.maximumRosterSize,
          maximumCaptains: source.maximumCaptains,
          maximumCoaches: source.maximumCoaches,
          allowPlayerMultipleTeams: source.allowPlayerMultipleTeams,
          athleteIdentifierMode: source.athleteIdentifierMode,
          joiningInstructions: source.joiningInstructions,
          periodsEnabled: source.periodsEnabled,
          maximumPeriods: source.maximumPeriods,
          periodLabel: source.periodLabel,
          scoreRules: this.toJson(source.scoreRules),
          overallScoringRules: this.toJson(source.overallScoringRules),
          rosterRules: this.toJson(source.rosterRules),
          bracketRules: this.toJson(source.bracketRules),
          standingsRules: this.toJson(source.standingsRules),
          rulesText: source.rulesText,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      if (input.includeRegistrations) {
        const destinationTeams = await tx.sportsTeam.findMany({
          where: { tournamentId: destination.id, deletedAt: null },
        });
        for (const registration of source.registrations) {
          const team = destinationTeams.find(
            (candidate) =>
              candidate.name.toLocaleLowerCase('pt-BR') === registration.team.name.toLocaleLowerCase('pt-BR') &&
              candidate.institution === registration.team.institution,
          );
          if (team) {
            await tx.sportsRegistration.create({
              data: {
                teamId: team.id,
                categoryId: category.id,
                status: SportsRegistrationStatus.DRAFT,
                seed: registration.seed,
                createdById: actorId,
                updatedById: actorId,
              },
            });
          }
        }
      }
      if (input.includeStages) {
        for (const stage of source.stages) {
          await tx.sportsStage.create({
            data: {
              categoryId: category.id,
              name: stage.name,
              type: stage.type,
              displayOrder: stage.displayOrder,
              settings: this.sanitizeStageSettings(stage.settings),
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }
      if (input.includeOfficials && source.officialAssignments.length > 0) {
        await tx.sportsOfficialAssignment.createMany({
          data: source.officialAssignments.map((official) => ({
            tournamentId: destination.id,
            categoryId: category.id,
            personId: official.personId,
            role: official.role,
            assignedById: actorId,
          })),
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: category.id,
          entityLabel: category.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: {
            sourceCategoryId: source.id,
            includeRegistrations: input.includeRegistrations ?? false,
            includeStages: input.includeStages ?? false,
            includeOfficials: input.includeOfficials ?? false,
          },
          summary: 'Modalidade esportiva duplicada.',
          scope: { majorEventId: destination.majorEventId },
          force: true,
        },
        tx,
      );
      return category;
    });
  }

  async cloneTeam(
    ...args: Parameters<SportsTeamDuplicationService['cloneTeam']>
  ): ReturnType<SportsTeamDuplicationService['cloneTeam']> {
    return this.teamDuplicator.cloneTeam(...args);
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O administrador autenticado não possui identificador.');
    }
    return actor.sub;
  }

  private toJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private sanitizeStageSettings(value: Prisma.JsonValue): Prisma.InputJsonValue {
    const settings = this.toJson(value);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return {};
    }
    const result = { ...settings } as Record<string, Prisma.InputJsonValue>;
    delete result['qualifierSlotsByMatch'];
    delete result['structuralByeSides'];
    delete result['resetRule'];
    delete result['generationFingerprint'];
    return result;
  }
}
