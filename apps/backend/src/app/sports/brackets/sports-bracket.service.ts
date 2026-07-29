import { createHash } from 'node:crypto';
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
  SportsBracketSide,
  SportsFormat,
  SportsMatchState,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsStageType,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateSingleEliminationBracket,
  SportsBracketMatchPlan,
} from '../domain/sports-brackets';
import {
  generateSportsDoubleEliminationBracket,
} from '../domain/sports-double-elimination';
import {
  planSportsGroupElimination,
  planSportsGroupStage,
} from '../domain/sports-groups';
import { generateSportsRoundRobin } from '../domain/sports-round-robin';
import { generateSportsSwissRound } from '../domain/sports-swiss';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsBracketAdvancementService } from './sports-bracket-advancement.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import {
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';

export interface SportsBracketParticipant {
  registrationId: string;
  seed?: number | null;
}

interface BackedCategory {
  id: string;
  name: string;
  eventGroupId: string;
  eventGroup: { emoji: string };
  bracketRules: Prisma.JsonValue;
  standingsRules: Prisma.JsonValue;
  tournament: {
    majorEventId: string;
    majorEvent: {
      startDate: Date;
      endDate: Date;
      publicationState: PublicationState;
    };
  };
}

@Injectable()
export class SportsBracketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advancement: SportsBracketAdvancementService,
    private readonly auditLog: AuditLogService,
    private readonly realtime: SportsRealtimeService,
    private readonly frozen: FrozenResourceService = {
      assertEventGroupMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {}

  async generate(
    input: {
      categoryId: string;
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
      replaceExistingDraft?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const registrationIds = input.participants.map((item) => item.registrationId.trim());
    if (
      registrationIds.some((id) => !id) ||
      new Set(registrationIds).size !== registrationIds.length
    ) {
      throw new BadRequestException('As equipes da chave devem ser únicas e válidas.');
    }

    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const category = await tx.sportsCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: { include: { majorEvent: true } },
          registrations: {
            where: {
              id: { in: registrationIds },
              deletedAt: null,
              status: {
                in: [
                  SportsRegistrationStatus.APPROVED,
                  SportsRegistrationStatus.ACTIVE,
                ],
              },
            },
            include: { team: { select: { name: true } } },
          },
          stages: {
            where: { deletedAt: null },
            include: {
              matches: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  eventId: true,
                  state: true,
                  operationSequence: true,
                  event: { select: { publicationState: true } },
                },
              },
            },
          },
        },
      });
      if (!category) {
        throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
      }
      await this.frozen.assertEventGroupMutable(
        category.eventGroupId,
        actor,
        'edit',
      );
      if (category.registrations.length !== registrationIds.length) {
        throw new BadRequestException(
          'Uma ou mais equipes não estão aprovadas nesta modalidade.',
        );
      }
      const generationKey = this.generationKey(category, input);
      if (
        category.stages.length > 0 &&
        category.stages.every(
          (stage) =>
            this.readRecord(stage.settings)['generationKey'] === generationKey,
        )
      ) {
        const stages = await this.loadGeneratedStages(
          tx,
          category.stages.map((stage) => stage.id),
        );
        return {
          stages,
          invalidations: [
            this.generationInvalidation(
              'BRACKET_GENERATED',
              category.tournament.id,
              category.id,
              stages,
            ),
          ],
        };
      }
      await this.replaceDraftIfRequested(
        tx,
        category.stages,
        Boolean(input.replaceExistingDraft),
        actorId,
      );
      if (
        !input.replaceExistingDraft &&
        category.stages.length > 0
      ) {
        throw new ConflictException(
          'A modalidade já possui uma chave. Confirme a substituição do rascunho.',
        );
      }

      const teamNameByRegistration = new Map(
        category.registrations.map((registration) => [
          registration.id,
          registration.team.name,
        ]),
      );
      let stageIds: string[];
      switch (category.format) {
        case SportsFormat.SINGLE_ELIMINATION:
          stageIds = [
            await this.persistSingleElimination(
              tx,
              category,
              input,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.ROUND_ROBIN:
          stageIds = [
            await this.persistRoundRobin(
              tx,
              category,
              registrationIds,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.GROUP_STAGE_ELIMINATION:
          stageIds = await this.persistGroupStageElimination(
            tx,
            category,
            input.participants,
            teamNameByRegistration,
            actorId,
          );
          break;
        case SportsFormat.DOUBLE_ELIMINATION:
          stageIds = await this.persistDoubleElimination(
            tx,
            category,
            input,
            teamNameByRegistration,
            actorId,
          );
          break;
        case SportsFormat.SWISS:
          stageIds = [
            await this.persistInitialSwissRound(
              tx,
              category,
              input.participants,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.CUSTOM:
          stageIds = [
            (
              await tx.sportsStage.create({
                data: {
                  categoryId: category.id,
                  name: 'Etapa personalizada',
                  type: SportsStageType.FINAL,
                  displayOrder: 1,
                  settings: { format: SportsFormat.CUSTOM },
                  createdById: actorId,
                  updatedById: actorId,
                },
              })
            ).id,
          ];
          break;
      }
      const generatedStages = await tx.sportsStage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, settings: true },
      });
      for (const stage of generatedStages) {
        await tx.sportsStage.update({
          where: { id: stage.id },
          data: {
            settings: this.toJson({
              ...this.readRecord(stage.settings),
              generationKey,
            }),
          },
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: category.id,
          entityLabel: category.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          after: {
            format: category.format,
            stageIds,
            participantCount: registrationIds.length,
          },
          summary: 'Chave esportiva gerada.',
          scope: {
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
          },
          force: true,
        },
        tx,
      );
      const stages = await this.loadGeneratedStages(tx, stageIds);
      return {
        stages,
        invalidations: [
          this.generationInvalidation(
            'BRACKET_GENERATED',
            category.tournament.id,
            category.id,
            stages,
          ),
        ],
      };
    });
    await this.realtime.publishStructuralInvalidations(result.invalidations);
    return result.stages;
  }

  private async persistSingleElimination(
    tx: Prisma.TransactionClient,
    category: {
      id: string;
      name: string;
      eventGroupId: string;
      eventGroup: { emoji: string };
      tournament: {
        majorEventId: string;
        majorEvent: {
          startDate: Date;
          endDate: Date;
          publicationState: PublicationState;
        };
      };
    },
    input: {
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
    },
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<string> {
    const seed = input.randomSeed?.trim() || `${category.id}:single-elimination`;
    const plan = generateSingleEliminationBracket({
      entrants: input.participants,
      seedingMode: input.randomizeUnseeded ? 'RANDOM' : 'MANUAL',
      random: this.seededRandom(seed),
    });
    const stage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Eliminatórias',
        type: SportsStageType.ELIMINATION,
        displayOrder: 1,
        settings: {
          format: SportsFormat.SINGLE_ELIMINATION,
          randomSeed: input.randomizeUnseeded ? seed : null,
          bracketSize: plan.bracketSize,
        },
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const matchIdByKey = new Map<string, string>();
    const matchPlanByKey = new Map<string, SportsBracketMatchPlan>();
    for (const round of plan.rounds) {
      for (const matchPlan of round.matches) {
        const homeRegistrationId =
          matchPlan.home.type === 'REGISTRATION'
            ? matchPlan.home.registrationId
            : null;
        const awayRegistrationId =
          matchPlan.away.type === 'REGISTRATION'
            ? matchPlan.away.registrationId
            : null;
        const automaticWinnerRegistrationId = matchPlan.automaticWinnerRegistrationId;
        const match = await this.createBackedMatch(tx, {
          category,
          stageId: stage.id,
          name: this.matchName(
            category.name,
            homeRegistrationId
              ? teamNameByRegistration.get(homeRegistrationId)
              : undefined,
            awayRegistrationId
              ? teamNameByRegistration.get(awayRegistrationId)
              : undefined,
          ),
          homeRegistrationId,
          awayRegistrationId,
          roundNumber: matchPlan.roundNumber,
          bracketPosition: matchPlan.position,
          automaticWinnerRegistrationId,
          actorId,
        });
        matchIdByKey.set(matchPlan.key, match.id);
        matchPlanByKey.set(matchPlan.key, matchPlan);
      }
    }
    for (const [key, matchId] of matchIdByKey) {
      const matchPlan = matchPlanByKey.get(key);
      if (!matchPlan?.winnerAdvancesToKey || !matchPlan.winnerAdvancesToSide) {
        continue;
      }
      await tx.sportsMatch.update({
        where: { id: matchId },
        data: {
          winnerAdvancesToId:
            matchIdByKey.get(matchPlan.winnerAdvancesToKey) ?? null,
          winnerAdvancesToSide:
            matchPlan.winnerAdvancesToSide === 'HOME'
              ? SportsBracketSide.HOME
              : SportsBracketSide.AWAY,
        },
      });
    }
    for (const automatic of plan.automaticAdvancements) {
      const sourceId = matchIdByKey.get(automatic.sourceMatchKey);
      if (sourceId) {
        await this.advancement.advanceBye(tx, sourceId, actorId);
      }
    }
    return stage.id;
  }

  private async persistRoundRobin(
    tx: Prisma.TransactionClient,
    category: {
      id: string;
      name: string;
      eventGroupId: string;
      eventGroup: { emoji: string };
      standingsRules: Prisma.JsonValue;
      tournament: {
        majorEventId: string;
        majorEvent: {
          startDate: Date;
          endDate: Date;
          publicationState: PublicationState;
        };
      };
    },
    registrationIds: string[],
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<string> {
    const standingsRules = this.readRecord(category.standingsRules);
    const doubleRoundRobin = standingsRules['doubleRoundRobin'] === true;
    const rounds = generateSportsRoundRobin({
      registrationIds,
      doubleRoundRobin,
    });
    const stage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Todos contra todos',
        type: SportsStageType.GROUP,
        displayOrder: 1,
        settings: {
          format: SportsFormat.ROUND_ROBIN,
          doubleRoundRobin,
        },
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await tx.sportsStanding.createMany({
      data: registrationIds.map((registrationId) => ({
        stageId: stage.id,
        registrationId,
      })),
    });
    for (const round of rounds) {
      for (const plan of round.matches) {
        await this.createBackedMatch(tx, {
          category,
          stageId: stage.id,
          name: this.matchName(
            category.name,
            teamNameByRegistration.get(plan.homeRegistrationId),
            teamNameByRegistration.get(plan.awayRegistrationId),
          ),
          homeRegistrationId: plan.homeRegistrationId,
          awayRegistrationId: plan.awayRegistrationId,
          roundNumber: plan.roundNumber,
          bracketPosition: plan.position,
          automaticWinnerRegistrationId: null,
          actorId,
        });
      }
    }
    return stage.id;
  }

  private async persistDoubleElimination(
    tx: Prisma.TransactionClient,
    category: BackedCategory,
    input: {
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
    },
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<string[]> {
    const seed = input.randomSeed?.trim() || `${category.id}:double-elimination`;
    const plan = generateSportsDoubleEliminationBracket({
      entrants: input.participants,
      seedingMode: input.randomizeUnseeded ? 'RANDOM' : 'MANUAL',
      random: this.seededRandom(seed),
    });
    const winnersStage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Chave dos vencedores',
        type: SportsStageType.WINNERS_BRACKET,
        displayOrder: 1,
        settings: {
          format: SportsFormat.DOUBLE_ELIMINATION,
          bracketSize: plan.bracketSize,
          randomSeed: input.randomizeUnseeded ? seed : null,
        },
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const losersStage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Chave de repescagem',
        type: SportsStageType.LOSERS_BRACKET,
        displayOrder: 2,
        settings: { format: SportsFormat.DOUBLE_ELIMINATION },
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const finalStage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Grande final',
        type: SportsStageType.FINAL,
        displayOrder: 3,
        settings: this.toJson({
          format: SportsFormat.DOUBLE_ELIMINATION,
          resetRule: plan.grandFinalReset,
        }),
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const allPlans = [
      ...plan.winnersRounds.flat(),
      ...plan.losersRounds.flat(),
      plan.grandFinal,
    ];
    const matchIdByKey = new Map<string, string>();
    for (const matchPlan of allPlans) {
      const homeRegistrationId =
        matchPlan.home.type === 'REGISTRATION'
          ? matchPlan.home.registrationId
          : null;
      const awayRegistrationId =
        matchPlan.away.type === 'REGISTRATION'
          ? matchPlan.away.registrationId
          : null;
      const stageId =
        matchPlan.stage === 'WINNERS'
          ? winnersStage.id
          : matchPlan.stage === 'LOSERS'
            ? losersStage.id
            : finalStage.id;
      const match = await this.createBackedMatch(tx, {
        category,
        stageId,
        name: this.matchName(
          category.name,
          homeRegistrationId
            ? teamNameByRegistration.get(homeRegistrationId)
            : undefined,
          awayRegistrationId
            ? teamNameByRegistration.get(awayRegistrationId)
            : undefined,
        ),
        homeRegistrationId,
        awayRegistrationId,
        roundNumber: matchPlan.roundNumber,
        bracketPosition: matchPlan.position,
        automaticWinnerRegistrationId:
          matchPlan.automaticWinnerRegistrationId,
        actorId,
      });
      matchIdByKey.set(matchPlan.key, match.id);
    }
    const resetMatch = await this.createBackedMatch(tx, {
      category,
      stageId: finalStage.id,
      name: `Partida de desempate — ${category.name}`,
      homeRegistrationId: null,
      awayRegistrationId: null,
      roundNumber: 2,
      bracketPosition: 1,
      automaticWinnerRegistrationId: null,
      actorId,
    });
    const grandFinalId = matchIdByKey.get(plan.grandFinal.key);
    if (!grandFinalId) {
      throw new ConflictException('A grande final não pôde ser persistida.');
    }
    for (const matchPlan of allPlans) {
      const sourceId = matchIdByKey.get(matchPlan.key);
      if (!sourceId) {
        continue;
      }
      const winnerRoute = matchPlan.advancements.find(
        (route) => route.outcome === 'WINNER',
      );
      const loserRoute = matchPlan.advancements.find(
        (route) => route.outcome === 'LOSER',
      );
      await tx.sportsMatch.update({
        where: { id: sourceId },
        data: {
          winnerAdvancesToId: winnerRoute
            ? matchIdByKey.get(winnerRoute.targetMatchKey) ?? null
            : null,
          winnerAdvancesToSide: winnerRoute
            ? this.toBracketSide(winnerRoute.targetSide)
            : null,
          loserAdvancesToId: loserRoute
            ? matchIdByKey.get(loserRoute.targetMatchKey) ?? null
            : null,
          loserAdvancesToSide: loserRoute
            ? this.toBracketSide(loserRoute.targetSide)
            : null,
        },
      });
    }
    await tx.sportsMatch.update({
      where: { id: grandFinalId },
      data: {
        winnerAdvancesToId: resetMatch.id,
        winnerAdvancesToSide: SportsBracketSide.HOME,
        loserAdvancesToId: resetMatch.id,
        loserAdvancesToSide: SportsBracketSide.AWAY,
      },
    });
    const structuralByeSides: Record<string, SportsBracketSide> = {};
    for (const matchPlan of allPlans) {
      const matchId = matchIdByKey.get(matchPlan.key);
      if (!matchId) {
        continue;
      }
      if (matchPlan.home.type === 'BYE' && matchPlan.away.type !== 'BYE') {
        structuralByeSides[matchId] = SportsBracketSide.HOME;
      } else if (
        matchPlan.away.type === 'BYE' &&
        matchPlan.home.type !== 'BYE'
      ) {
        structuralByeSides[matchId] = SportsBracketSide.AWAY;
      }
    }
    await tx.sportsStage.update({
      where: { id: winnersStage.id },
      data: {
        settings: this.toJson({
          format: SportsFormat.DOUBLE_ELIMINATION,
          bracketSize: plan.bracketSize,
          randomSeed: input.randomizeUnseeded ? seed : null,
          structuralByeSides,
        }),
      },
    });
    await tx.sportsStage.update({
      where: { id: losersStage.id },
      data: {
        settings: this.toJson({
          format: SportsFormat.DOUBLE_ELIMINATION,
          structuralByeSides,
        }),
      },
    });
    await tx.sportsStage.update({
      where: { id: finalStage.id },
      data: {
        settings: this.toJson({
          format: SportsFormat.DOUBLE_ELIMINATION,
          resetRule: {
            ...plan.grandFinalReset,
            sourceMatchId: grandFinalId,
            resetMatchId: resetMatch.id,
          },
        }),
      },
    });
    for (const automatic of plan.automaticAdvancements) {
      const sourceId = matchIdByKey.get(automatic.sourceMatchKey);
      if (sourceId) {
        await this.advancement.advanceBye(tx, sourceId, actorId);
      }
    }
    return [winnersStage.id, losersStage.id, finalStage.id];
  }

  private async persistGroupStageElimination(
    tx: Prisma.TransactionClient,
    category: BackedCategory,
    participants: SportsBracketParticipant[],
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<string[]> {
    const rules = this.readRecord(category.bracketRules);
    const groupCount = this.readPositiveInteger(
      rules['groupCount'],
      Math.max(2, Math.floor(Math.sqrt(participants.length))),
    );
    const qualifiersPerGroup = this.readPositiveInteger(
      rules['qualifiersPerGroup'],
      2,
    );
    const doubleRoundRobin = rules['doubleRoundRobin'] === true;
    const groupPlan = planSportsGroupStage({
      entrants: participants,
      groupCount,
      doubleRoundRobin,
    });
    const smallestGroupSize = Math.min(
      ...groupPlan.groups.map((group) => group.entrants.length),
    );
    if (qualifiersPerGroup > smallestGroupSize) {
      throw new BadRequestException(
        'A quantidade de classificados por grupo não pode superar o menor grupo.',
      );
    }
    const stageIds: string[] = [];
    for (const group of groupPlan.groups) {
      const stage = await tx.sportsStage.create({
        data: {
          categoryId: category.id,
          name: `Grupo ${group.key}`,
          type: SportsStageType.GROUP,
          displayOrder: group.displayOrder,
          settings: {
            format: SportsFormat.GROUP_STAGE_ELIMINATION,
            groupKey: group.key,
            qualifiersPerGroup,
            doubleRoundRobin,
          },
          createdById: actorId,
          updatedById: actorId,
        },
      });
      stageIds.push(stage.id);
      await tx.sportsStanding.createMany({
        data: group.entrants.map((entrant) => ({
          stageId: stage.id,
          registrationId: entrant.registrationId,
        })),
      });
      for (const round of group.rounds) {
        for (const matchPlan of round.matches) {
          await this.createBackedMatch(tx, {
            category,
            stageId: stage.id,
            name: this.matchName(
              category.name,
              teamNameByRegistration.get(matchPlan.homeRegistrationId),
              teamNameByRegistration.get(matchPlan.awayRegistrationId),
            ),
            homeRegistrationId: matchPlan.homeRegistrationId,
            awayRegistrationId: matchPlan.awayRegistrationId,
            roundNumber: matchPlan.roundNumber,
            bracketPosition: matchPlan.position,
            automaticWinnerRegistrationId: null,
            actorId,
          });
        }
      }
    }

    const elimination = planSportsGroupElimination({
      groups: groupPlan.groups.map((group) => ({ key: group.key })),
      qualifiersPerGroup,
    });
    const eliminationStage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Eliminatórias',
        type: SportsStageType.ELIMINATION,
        displayOrder: groupPlan.groups.length + 1,
        settings: this.toJson({
          format: SportsFormat.GROUP_STAGE_ELIMINATION,
          qualifiers: elimination.qualifiers,
          bracketSize: elimination.bracketSize,
        }),
        createdById: actorId,
        updatedById: actorId,
      },
    });
    stageIds.push(eliminationStage.id);
    const matchIdByKey = new Map<string, string>();
    const qualifierSlotsByMatch = new Map<
      string,
      { home: unknown; away: unknown }
    >();
    for (const round of elimination.rounds) {
      for (const matchPlan of round) {
        const match = await this.createBackedMatch(tx, {
          category,
          stageId: eliminationStage.id,
          name: this.matchName(category.name),
          homeRegistrationId: null,
          awayRegistrationId: null,
          roundNumber: matchPlan.roundNumber,
          bracketPosition: matchPlan.position,
          automaticWinnerRegistrationId: null,
          actorId,
        });
        matchIdByKey.set(matchPlan.key, match.id);
        if (
          matchPlan.home.type === 'GROUP_POSITION' ||
          matchPlan.away.type === 'GROUP_POSITION'
        ) {
          qualifierSlotsByMatch.set(match.id, {
            home: matchPlan.home,
            away: matchPlan.away,
          });
        }
      }
    }
    for (const round of elimination.rounds) {
      for (const matchPlan of round) {
        if (!matchPlan.winnerAdvancesToKey || !matchPlan.winnerAdvancesToSide) {
          continue;
        }
        const sourceMatchId = matchIdByKey.get(matchPlan.key);
        if (!sourceMatchId) {
          throw new ConflictException(
            'Uma partida eliminatória não pôde ser persistida.',
          );
        }
        await tx.sportsMatch.update({
          where: { id: sourceMatchId },
          data: {
            winnerAdvancesToId:
              matchIdByKey.get(matchPlan.winnerAdvancesToKey) ?? null,
            winnerAdvancesToSide: this.toBracketSide(
              matchPlan.winnerAdvancesToSide,
            ),
          },
        });
      }
    }
    await tx.sportsStage.update({
      where: { id: eliminationStage.id },
      data: {
        settings: this.toJson({
          format: SportsFormat.GROUP_STAGE_ELIMINATION,
          qualifiers: elimination.qualifiers,
          bracketSize: elimination.bracketSize,
          qualifierSlotsByMatch: Object.fromEntries(qualifierSlotsByMatch),
        }),
      },
    });
    return stageIds;
  }

  private async persistInitialSwissRound(
    tx: Prisma.TransactionClient,
    category: BackedCategory,
    participants: SportsBracketParticipant[],
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<string> {
    const rules = this.readRecord(category.bracketRules);
    const maximumRounds = this.readPositiveInteger(
      rules['maximumRounds'],
      Math.ceil(Math.log2(participants.length)) + 1,
    );
    const stage = await tx.sportsStage.create({
      data: {
        categoryId: category.id,
        name: 'Sistema suíço',
        type: SportsStageType.SWISS,
        displayOrder: 1,
        settings: {
          format: SportsFormat.SWISS,
          maximumRounds,
        },
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await tx.sportsStanding.createMany({
      data: participants.map((participant) => ({
        stageId: stage.id,
        registrationId: participant.registrationId,
        tiebreakData: {
          byeCount: 0,
          seed: participant.seed ?? null,
        },
      })),
    });
    const round = generateSportsSwissRound({
      roundNumber: 1,
      standings: participants.map((participant) => ({
        registrationId: participant.registrationId,
        points: 0,
        seed: participant.seed,
        byeCount: 0,
      })),
      matchHistory: [],
    });
    await this.persistSwissRound(
      tx,
      category,
      stage.id,
      round,
      teamNameByRegistration,
      actorId,
    );
    return stage.id;
  }

  async generateNextSwissRound(
    categoryId: string,
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const category = await tx.sportsCategory.findFirst({
        where: {
          id: categoryId,
          format: SportsFormat.SWISS,
          deletedAt: null,
        },
        include: {
          eventGroup: true,
          tournament: { include: { majorEvent: true } },
          stages: {
            where: { type: SportsStageType.SWISS, deletedAt: null },
            include: {
              standings: { include: { registration: { include: { team: true } } } },
              matches: {
                where: { deletedAt: null },
                include: { event: true },
              },
            },
            take: 1,
          },
        },
      });
      const stage = category?.stages[0];
      if (!category || !stage) {
        throw new NotFoundException('Etapa suíça não encontrada.');
      }
      await this.frozen.assertEventGroupMutable(
        category.eventGroupId,
        actor,
        'edit',
      );
      const currentRound = stage.matches.reduce(
        (maximum, match) => Math.max(maximum, match.roundNumber ?? 0),
        0,
      );
      const unfinished = stage.matches.some(
        (match) =>
          match.roundNumber === currentRound &&
          !(
            match.reviewStatus === SportsReviewStatus.APPROVED &&
            (
              [
                SportsMatchState.FINISHED,
                SportsMatchState.DRAW,
              ] as SportsMatchState[]
            ).includes(match.canonicalState)
          ),
      );
      if (unfinished) {
        throw new ConflictException(
          'A rodada atual precisa ser concluída e aprovada antes da próxima.',
        );
      }
      const settings = this.readRecord(stage.settings);
      const maximumRounds = this.readPositiveInteger(
        settings['maximumRounds'],
        Math.ceil(Math.log2(stage.standings.length)) + 1,
      );
      if (currentRound >= maximumRounds) {
        throw new ConflictException('A etapa atingiu o número máximo de rodadas.');
      }
      const round = generateSportsSwissRound({
        roundNumber: currentRound + 1,
        standings: stage.standings.map((standing) => {
          const tie = this.readRecord(standing.tiebreakData);
          return {
            registrationId: standing.registrationId,
            points: standing.points,
            tiebreakers: [
              this.readNumber(tie['buchholz'], 0),
              standing.scoreFor - standing.scoreAgainst,
            ],
            seed: this.readOptionalPositiveInteger(tie['seed']),
            byeCount: this.readPositiveInteger(tie['byeCount'], 0, true),
          };
        }),
        matchHistory: stage.matches.flatMap((match) =>
          match.homeRegistrationId &&
          match.awayRegistrationId &&
          !(
            match.canonicalState === SportsMatchState.DRAW &&
            match.drawWillReschedule === true
          )
            ? [
                {
                  homeRegistrationId: match.homeRegistrationId,
                  awayRegistrationId: match.awayRegistrationId,
                },
              ]
            : [],
        ),
      });
      await this.persistSwissRound(
        tx,
        category,
        stage.id,
        round,
        new Map(
          stage.standings.map((standing) => [
            standing.registrationId,
            standing.registration.team.name,
          ]),
        ),
        actorId,
      );
      await tx.sportsStage.update({
        where: { id: stage.id },
        data: {
          generationRevision: { increment: 1 },
          updatedById: actorId,
        },
      });
      const matches = await tx.sportsMatch.findMany({
        where: {
          stageId: stage.id,
          roundNumber: round.roundNumber,
          deletedAt: null,
        },
        include: { event: true },
        orderBy: { bracketPosition: 'asc' },
      });
      return {
        matches,
        invalidations: [
          this.generationInvalidation(
            'SWISS_ROUND_GENERATED',
            category.tournament.id,
            category.id,
            [{ id: stage.id, matches }],
          ),
        ],
      };
    });
    await this.realtime.publishStructuralInvalidations(result.invalidations);
    return result.matches;
  }

  private async persistSwissRound(
    tx: Prisma.TransactionClient,
    category: BackedCategory,
    stageId: string,
    round: ReturnType<typeof generateSportsSwissRound>,
    teamNameByRegistration: Map<string, string>,
    actorId: string,
  ): Promise<void> {
    for (const pairing of round.pairings) {
      await this.createBackedMatch(tx, {
        category,
        stageId,
        name: this.matchName(
          category.name,
          teamNameByRegistration.get(pairing.homeRegistrationId),
          teamNameByRegistration.get(pairing.awayRegistrationId),
        ),
        homeRegistrationId: pairing.homeRegistrationId,
        awayRegistrationId: pairing.awayRegistrationId,
        roundNumber: round.roundNumber,
        bracketPosition: pairing.position,
        automaticWinnerRegistrationId: null,
        actorId,
      });
    }
    if (round.byeRegistrationId) {
      const byePoints = this.readNumber(
        this.readRecord(category.standingsRules)['byePoints'],
        1,
      );
      const standing = await tx.sportsStanding.findUniqueOrThrow({
        where: {
          stageId_registrationId: {
            stageId,
            registrationId: round.byeRegistrationId,
          },
        },
      });
      const tie = this.readRecord(standing.tiebreakData);
      await tx.sportsStanding.update({
        where: { id: standing.id },
        data: {
          played: { increment: 1 },
          wins: { increment: 1 },
          points: { increment: byePoints },
          tiebreakData: {
            ...tie,
            byeCount: this.readPositiveInteger(tie['byeCount'], 0, true) + 1,
          },
          revision: { increment: 1 },
        },
      });
    }
  }

  private async createBackedMatch(
    tx: Prisma.TransactionClient,
    input: {
      category: {
        id: string;
        eventGroupId: string;
        eventGroup: { emoji: string };
        tournament: {
          majorEventId: string;
          majorEvent: {
            startDate: Date;
            endDate: Date;
            publicationState: PublicationState;
          };
        };
      };
      stageId: string;
      name: string;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      roundNumber: number;
      bracketPosition: number;
      automaticWinnerRegistrationId: string | null;
      actorId: string;
    },
  ) {
    const major = input.category.tournament.majorEvent;
    const event = await tx.event.create({
      data: {
        name: input.name,
        emoji: input.category.eventGroup.emoji,
        startDate: major.startDate,
        endDate: major.endDate,
        type: 'OTHER',
        majorEventId: input.category.tournament.majorEventId,
        eventGroupId: input.category.eventGroupId,
        allowSubscription: false,
        shouldCollectAttendance: true,
        publiclyVisible: false,
        publicationState: PublicationState.DRAFT,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
    const automatic = Boolean(input.automaticWinnerRegistrationId);
    return tx.sportsMatch.create({
      data: {
        eventId: event.id,
        categoryId: input.category.id,
        stageId: input.stageId,
        homeRegistrationId: input.homeRegistrationId,
        awayRegistrationId: input.awayRegistrationId,
        roundNumber: input.roundNumber,
        bracketPosition: input.bracketPosition,
        state: automatic ? SportsMatchState.FINISHED : SportsMatchState.SCHEDULED,
        canonicalState: automatic
          ? SportsMatchState.FINISHED
          : SportsMatchState.SCHEDULED,
        reviewStatus: automatic
          ? SportsReviewStatus.APPROVED
          : SportsReviewStatus.NOT_REQUIRED,
        winnerRegistrationId: input.automaticWinnerRegistrationId,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }

  private async replaceDraftIfRequested(
    tx: Prisma.TransactionClient,
    stages: Array<{
      id: string;
      matches: Array<{
        id: string;
        eventId: string;
        state: SportsMatchState;
        operationSequence: number;
        event: { publicationState: PublicationState };
      }>;
    }>,
    replace: boolean,
    actorId: string,
  ): Promise<void> {
    if (!replace || stages.length === 0) {
      return;
    }
    const matches = stages.flatMap((stage) => stage.matches);
    if (
      matches.some(
        (match) =>
          match.operationSequence > 0 ||
          match.event.publicationState !== PublicationState.DRAFT,
      )
    ) {
      throw new ConflictException(
        'Uma chave com partidas iniciadas não pode ser substituída automaticamente.',
      );
    }
    const now = new Date();
    await tx.sportsMatch.updateMany({
      where: { id: { in: matches.map((match) => match.id) } },
      data: { deletedAt: now, updatedById: actorId },
    });
    await tx.event.updateMany({
      where: { id: { in: matches.map((match) => match.eventId) } },
      data: { deletedAt: now, updatedById: actorId },
    });
    await tx.sportsStage.updateMany({
      where: { id: { in: stages.map((stage) => stage.id) } },
      data: { deletedAt: now, updatedById: actorId },
    });
  }

  private loadGeneratedStages(
    tx: Prisma.TransactionClient,
    stageIds: string[],
  ) {
    return tx.sportsStage.findMany({
      where: { id: { in: stageIds } },
      include: {
        matches: {
          where: { deletedAt: null },
          include: {
            event: true,
            homeRegistration: { include: { team: true } },
            awayRegistration: { include: { team: true } },
          },
          orderBy: [{ roundNumber: 'asc' }, { bracketPosition: 'asc' }],
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  private generationInvalidation(
    kind: SportsStructuralInvalidationKind,
    tournamentId: string,
    categoryId: string,
    stages: Array<{
      id: string;
      matches: Array<{
        id: string;
        event: {
          deletedAt: Date | null;
          publiclyVisible: boolean;
          publicationState: PublicationState;
        };
      }>;
    }>,
  ): SportsStructuralInvalidation {
    const matches = stages.flatMap((stage) => stage.matches);
    return {
      kind,
      tournamentId,
      categoryId,
      stageIds: stages.map((stage) => stage.id),
      matchIds: matches.map((match) => match.id),
      publicMatchIds: matches
        .filter(
          (match) =>
            match.event.deletedAt === null &&
            match.event.publiclyVisible &&
            match.event.publicationState === PublicationState.PUBLISHED,
        )
        .map((match) => match.id),
    };
  }

  private generationKey(
    category: {
      id: string;
      format: SportsFormat;
      bracketRules: Prisma.JsonValue;
      standingsRules: Prisma.JsonValue;
    },
    input: {
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
    },
  ): string {
    const effectiveRandomSeed = input.randomizeUnseeded
      ? input.randomSeed?.trim() ||
        `${category.id}:${category.format.toLowerCase().replace(/_/g, '-')}`
      : null;
    return createHash('sha256')
      .update(
        this.stableJson({
          format: category.format,
          participants: input.participants.map((participant) => ({
            registrationId: participant.registrationId.trim(),
            seed: participant.seed ?? null,
          })),
          randomizeUnseeded: input.randomizeUnseeded === true,
          randomSeed: effectiveRandomSeed,
          bracketRules: category.bracketRules,
          standingsRules: category.standingsRules,
        }),
      )
      .digest('hex');
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.stableJson(record[key])}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private seededRandom(seed: string): () => number {
    let counter = 0;
    return () => {
      const digest = createHash('sha256')
        .update(`${seed}:${counter++}`)
        .digest();
      return digest.readUInt32BE(0) / 0x1_0000_0000;
    };
  }

  private matchName(
    categoryName: string,
    homeName?: string,
    awayName?: string,
  ): string {
    return `${homeName ?? 'A definir'} × ${awayName ?? 'A definir'} — ${categoryName}`;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toBracketSide(side: 'HOME' | 'AWAY'): SportsBracketSide {
    return side === 'HOME' ? SportsBracketSide.HOME : SportsBracketSide.AWAY;
  }

  private readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readPositiveInteger(
    value: unknown,
    fallback: number,
    allowZero = false,
  ): number {
    const minimum = allowZero ? 0 : 1;
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= minimum
      ? value
      : fallback;
  }

  private readOptionalPositiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1
      ? value
      : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O administrador autenticado não possui identificador.');
    }
    return actor.sub;
  }
}
