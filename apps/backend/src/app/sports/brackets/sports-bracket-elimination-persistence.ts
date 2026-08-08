import {
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import {
  Prisma,
  PublicationState,
  SportsBracketSide,
  SportsFormat,
  SportsStageType
} from '@prisma/client';
import {
  generateSportsDoubleEliminationBracket,
} from '../domain/sports-double-elimination';
import {
  planSportsGroupElimination,
  planSportsGroupStage,
} from '../domain/sports-groups';

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

import { SportsBracketSwissPersistence } from './sports-bracket-swiss-persistence';

export abstract class SportsBracketEliminationPersistence extends SportsBracketSwissPersistence {
  protected async persistDoubleElimination(
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

  protected async persistGroupStageElimination(
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

}




