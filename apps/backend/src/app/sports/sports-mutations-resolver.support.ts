import { CommitSportsMatchActionsInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { SportsPlayerApplicationService } from './applications/sports-player-application.service';
import { SportsBracketService } from './brackets/sports-bracket.service';
import { SportsDuplicationService } from './duplication/sports-duplication.service';
import { SportsMatchOperationService } from './operations/sports-match-operation.service';
import { SportsMutationEntity, SportsMutationEventsService } from './realtime/sports-mutation-events.service';
import { SportsMatchRosterService } from './rosters/sports-match-roster.service';
import { SportsAccessService } from './security/sports-access.service';
import { SportsAdminService } from './sports-admin.service';
import { SportsTeamChangeService } from './teams/sports-team-change.service';
import { assertSportsOverallScoringRules } from './domain/sports-overall-scoring';

@Injectable()
export abstract class SportsMutationsResolverSupport {
  protected readonly logger = new Logger(SportsMutationsResolverSupport.name);

  constructor(
    protected readonly policy: AuthorizationPolicyService,
    protected readonly frozen: FrozenResourceService,
    protected readonly prisma: PrismaService,
    protected readonly currentUser: CurrentUserContextService,
    protected readonly admin: SportsAdminService,
    protected readonly access: SportsAccessService,
    protected readonly teamChanges: SportsTeamChangeService,
    protected readonly applications: SportsPlayerApplicationService,
    protected readonly rosters: SportsMatchRosterService,
    protected readonly operations: SportsMatchOperationService,
    protected readonly brackets: SportsBracketService,
    protected readonly duplication: SportsDuplicationService,
    protected readonly mutationEvents: SportsMutationEventsService,
  ) {}

  protected authenticated(context: GraphqlContext): AuthenticatedUser {
    return this.currentUser.getAuthenticatedUser(context);
  }

  protected async assertTeamChangeReviewMutable(requestId: string, actor: AuthenticatedUser): Promise<void> {
    const request = await this.prisma.sportsTeamChangeRequest.findUnique({
      where: { id: requestId },
      select: {
        team: {
          select: {
            tournament: {
              select: { majorEventId: true },
            },
          },
        },
      },
    });
    if (request) {
      await this.frozen.assertMajorEventMutable(request.team.tournament.majorEventId, actor, 'edit');
    }
  }

  protected async assertPlayerApplicationReviewMutable(applicationId: string, actor: AuthenticatedUser): Promise<void> {
    const application = await this.prisma.sportsPlayerApplication.findUnique({
      where: { id: applicationId },
      select: {
        tournament: {
          select: { majorEventId: true },
        },
        categoryChoices: {
          select: { categoryId: true },
        },
      },
    });
    if (application) {
      for (const choice of application.categoryChoices) {
        await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Approve], {
          sportsCategoryId: choice.categoryId,
        });
      }
      await this.frozen.assertMajorEventMutable(application.tournament.majorEventId, actor, 'edit');
    }
  }

  protected async assertMatchActionReviewMutable(actionId: string, actor: AuthenticatedUser): Promise<void> {
    const action = await this.prisma.sportsMatchAction.findUnique({
      where: { id: actionId },
      select: { matchId: true },
    });
    if (action) {
      await this.assertMatchMutable(action.matchId, actor);
    }
  }

  protected async assertRosterReviewMutable(rosterId: string, actor: AuthenticatedUser): Promise<void> {
    const roster = await this.prisma.sportsMatchRoster.findUnique({
      where: { id: rosterId },
      select: { matchId: true },
    });
    if (roster) {
      await this.assertMatchMutable(roster.matchId, actor);
    }
  }

  protected async assertMatchMutable(matchId: string, actor: AuthenticatedUser): Promise<void> {
    const match = await this.prisma.sportsMatch.findUnique({
      where: { id: matchId },
      select: { eventId: true },
    });
    if (match) {
      await this.frozen.assertEventMutable(match.eventId, actor, 'edit');
    }
  }

  protected async publishMutation<T extends { id: string }>(
    entity: SportsMutationEntity,
    mutation: Promise<T>,
    includePublic: boolean,
  ): Promise<T> {
    const result = await mutation;
    try {
      await this.mutationEvents.publishForEntity(entity, result.id, includePublic);
    } catch (error) {
      this.logger.warn(
        `Could not publish sports mutation event for ${entity} ${result.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return result;
  }

  protected singleMatchId(input: CommitSportsMatchActionsInput): string {
    if (input.actions.length === 0) {
      throw new BadRequestException('Envie ao menos uma ação.');
    }
    const ids = new Set(input.actions.map((action) => action.matchId));
    if (ids.size !== 1) {
      throw new BadRequestException('O lote deve pertencer a uma única partida.');
    }
    return input.actions[0].matchId;
  }

  protected parseJson(value: string, label: string): Prisma.InputJsonValue {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException(`JSON inválido em ${label}.`);
    }
  }

  protected parseTimerRules(value: string | undefined): Prisma.InputJsonValue {
    if (value === undefined || !value.trim()) {
      return {};
    }
    const rules = this.parseObject(value, 'regras do cronômetro');
    const allowed = new Set([
      'overallEnabled',
      'periodEnabled',
      'periodDurationMs',
      'allowOvertime',
      'periodStartOffsetsMs',
    ]);
    const unknownKeys = Object.keys(rules).filter((key) => !allowed.has(key));
    if (unknownKeys.length) {
      throw new BadRequestException(`Campos desconhecidos nas regras do cronômetro: ${unknownKeys.join(', ')}.`);
    }
    for (const key of ['overallEnabled', 'periodEnabled', 'allowOvertime']) {
      if (rules[key] !== undefined && typeof rules[key] !== 'boolean') {
        throw new BadRequestException(`${key} deve ser booleano.`);
      }
    }
    if (
      rules['periodDurationMs'] !== undefined &&
      (!Number.isSafeInteger(rules['periodDurationMs']) ||
        (rules['periodDurationMs'] as number) < 0 ||
        (rules['periodDurationMs'] as number) > 24 * 60 * 60 * 1000)
    ) {
      throw new BadRequestException('periodDurationMs deve ser um inteiro entre 0 e 86400000.');
    }
    if (rules['periodStartOffsetsMs'] !== undefined) {
      if (
        !Array.isArray(rules['periodStartOffsetsMs']) ||
        rules['periodStartOffsetsMs'].some(
          (offset) => !Number.isSafeInteger(offset) || offset < 0 || offset > 7 * 24 * 60 * 60 * 1000,
        )
      ) {
        throw new BadRequestException('periodStartOffsetsMs deve conter deslocamentos inteiros não negativos.');
      }
    }
    return rules as Prisma.InputJsonValue;
  }

  protected parseObject(value: string, label: string): Record<string, unknown> {
    const parsed = this.parseJson(value, label);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException(`${label} deve ser um objeto JSON.`);
    }
    return parsed as Record<string, unknown>;
  }

  protected parseOverallScoringRules(value: string | undefined): Prisma.InputJsonValue {
    if (value === undefined || !value.trim()) {
      return {};
    }
    const rules = this.parseObject(value, 'regras de pontuação geral');
    try {
      assertSportsOverallScoringRules(rules);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Regras de pontuação geral inválidas.');
    }
    return rules as Prisma.InputJsonValue;
  }

  protected readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
