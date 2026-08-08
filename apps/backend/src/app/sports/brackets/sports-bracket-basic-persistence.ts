import {
  Prisma,
  PublicationState,
  SportsBracketSide,
  SportsFormat,
  SportsStageType
} from '@prisma/client';
import {
  generateSingleEliminationBracket,
  SportsBracketMatchPlan,
} from '../domain/sports-brackets';
import { generateSportsRoundRobin } from '../domain/sports-round-robin';

export interface SportsBracketParticipant {
  registrationId: string;
  seed?: number | null;
}

import { SportsBracketEliminationPersistence } from './sports-bracket-elimination-persistence';

export abstract class SportsBracketBasicPersistence extends SportsBracketEliminationPersistence {
  protected async persistSingleElimination(
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

  protected async persistRoundRobin(
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

}




