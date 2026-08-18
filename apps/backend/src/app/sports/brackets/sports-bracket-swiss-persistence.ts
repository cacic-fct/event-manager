import { ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_SPORTS_STANDINGS_RULES } from '@cacic-fct/shared-data-types';
import {
  Prisma,
  PublicationState,
  SportsFormat,
  SportsMatchState,
  SportsReviewStatus,
  SportsStageType,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { generateSportsSwissRound } from '../domain/sports-swiss';
import { runSerializableSportsTransaction } from '../sports-transaction';

export interface SportsBracketParticipant {
  registrationId: string;
  seed?: number | null;
}

interface BackedCategory {
  id: string;
  name: string;
  eventGroupId: string;
  eventGroup: { emoji: string; shouldIssueCertificate: boolean };
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

import { SportsBracketPersistenceSupport } from './sports-bracket-persistence-support';

export abstract class SportsBracketSwissPersistence extends SportsBracketPersistenceSupport {
  protected async persistInitialSwissRound(
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
    await this.persistSwissRound(tx, category, stage.id, round, teamNameByRegistration, actorId);
    return stage.id;
  }

  async generateNextSwissRound(categoryId: string, actor: AuthenticatedUser) {
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
      await this.frozen.assertEventGroupMutable(category.eventGroupId, actor, 'edit');
      const currentRound = stage.matches.reduce((maximum, match) => Math.max(maximum, match.roundNumber ?? 0), 0);
      const unfinished = stage.matches.some(
        (match) =>
          match.roundNumber === currentRound &&
          !(
            match.reviewStatus === SportsReviewStatus.APPROVED &&
            ([SportsMatchState.FINISHED, SportsMatchState.DRAW] as SportsMatchState[]).includes(match.canonicalState)
          ),
      );
      if (unfinished) {
        throw new ConflictException('A rodada atual precisa ser concluída e aprovada antes da próxima.');
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
            tiebreakers: [this.readNumber(tie['buchholz'], 0), standing.scoreFor - standing.scoreAgainst],
            seed: this.readOptionalPositiveInteger(tie['seed']),
            byeCount: this.readPositiveInteger(tie['byeCount'], 0, true),
          };
        }),
        matchHistory: stage.matches.flatMap((match) =>
          match.homeRegistrationId &&
          match.awayRegistrationId &&
          !(match.canonicalState === SportsMatchState.DRAW && match.drawWillReschedule === true)
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
        new Map(stage.standings.map((standing) => [standing.registrationId, standing.registration.team.name])),
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
          this.generationInvalidation('SWISS_ROUND_GENERATED', category.tournament.id, category.id, [
            { id: stage.id, matches },
          ]),
        ],
      };
    });
    await this.runBestEffortPostCommitEffects([
      ['backing event synchronization', this.eventEffects.syncEvents(result.matches.map((match) => match.eventId))],
      ['realtime invalidation', this.realtime.publishStructuralInvalidations(result.invalidations)],
    ]);
    return result.matches;
  }

  protected async persistSwissRound(
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
        DEFAULT_SPORTS_STANDINGS_RULES.byePoints,
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
}
