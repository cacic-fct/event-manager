import {
  CommitSportsMatchActionsInput,
  SportsBracketGenerateInput,
  SportsCategoryCloneInput,
  SportsCategoryCreateInput,
  SportsCategoryUpdateInput,
  SportsMatchActionReviewInput,
  SportsMatchCreateInput,
  SportsMatchRosterUpsertInput,
  SportsMatchUpdateInput,
  SportsOfficialAssignInput,
  SportsOfficialUpdateInput,
  SportsPlayerApplicationCreateInput,
  SportsPlayerApplicationReviewInput,
  SportsRegistrationCreateInput,
  SportsRegistrationMemberUpsertInput,
  SportsRegistrationUpdateInput,
  SportsRepresentativeAssignInput,
  SportsRepresentativeRevokeInput,
  SportsRosterCheckInInput,
  SportsTeamChangeRequestInput,
  SportsTeamChangeReviewInput,
  SportsTeamCloneInput,
  SportsTeamCreateInput,
  SportsTeamUpdateInput,
  SportsTournamentCloneInput,
  SportsTournamentCreateInput,
  SportsTournamentScoreEntryInput,
  SportsTournamentScoreEntryUpdateInput,
  SportsTournamentUpdateInput,
  SportsVenueCreateInput,
  SportsVenueUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Resolver } from '@nestjs/graphql';
import {
  Prisma,
  SportsMatchActionType,
  SportsReviewStatus,
  SportsTeamChangeRequestStatus,
} from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { SportsPlayerApplicationService } from './applications/sports-player-application.service';
import { SportsBracketService } from './brackets/sports-bracket.service';
import { SportsDuplicationService } from './duplication/sports-duplication.service';
import {
  createSportsAuditActor,
  SportsMatchOperationService,
} from './operations/sports-match-operation.service';
import { SportsMatchRosterService } from './rosters/sports-match-roster.service';
import {
  SportsMutationEntity,
  SportsMutationEventsService,
} from './realtime/sports-mutation-events.service';
import { SportsAccessService } from './security/sports-access.service';
import { SportsAdminService } from './sports-admin.service';
import { SportsTeamChangeService } from './teams/sports-team-change.service';

@Resolver()
export class SportsMutationsResolver {
  constructor(
    private readonly policy: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly admin: SportsAdminService,
    private readonly access: SportsAccessService,
    private readonly teamChanges: SportsTeamChangeService,
    private readonly applications: SportsPlayerApplicationService,
    private readonly rosters: SportsMatchRosterService,
    private readonly operations: SportsMatchOperationService,
    private readonly brackets: SportsBracketService,
    private readonly duplication: SportsDuplicationService,
    private readonly mutationEvents: SportsMutationEventsService,
  ) {}

  @Mutation(() => String, { name: 'createSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Create)
  async createTournament(
    @Args('input', { type: () => SportsTournamentCreateInput })
    input: SportsTournamentCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Create],
      { majorEventId: input.majorEventId },
    );
    return (
      await this.publishMutation(
        'TOURNAMENT',
        this.admin.attachTournament(
        {
          majorEventId: input.majorEventId,
          status: input.status,
          scoringMode: input.scoringMode,
          selfSubscriptionEnabled: input.selfSubscriptionEnabled,
          allowPlayerMultipleTeams: input.allowPlayerMultipleTeams,
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async updateTournament(
    @Args('input', { type: () => SportsTournamentUpdateInput })
    input: SportsTournamentUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: input.id },
    );
    return (
      await this.publishMutation(
        'TOURNAMENT',
        this.admin.updateTournament(
        input.id,
        {
          expectedRevision: input.expectedRevision,
          status: input.status,
          scoringMode: input.scoringMode,
          selfSubscriptionEnabled: input.selfSubscriptionEnabled,
          allowPlayerMultipleTeams: input.allowPlayerMultipleTeams,
          finishedAt: input.finishedAt,
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'createSportsCategory' })
  @RequirePermissions(Permission.SportsCategory.Create)
  async createCategory(
    @Args('input', { type: () => SportsCategoryCreateInput })
    input: SportsCategoryCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsCategory.Create],
      { sportsTournamentId: input.tournamentId },
    );
    return (
      await this.publishMutation(
        'CATEGORY',
        this.admin.createCategory(
        {
          ...input,
          scoreRules: this.parseJson(input.scoreRulesJson, 'regras de placar'),
          rosterRules: this.parseJson(input.rosterRulesJson, 'regras de elenco'),
          bracketRules: this.parseJson(input.bracketRulesJson, 'regras da chave'),
          standingsRules: this.parseJson(
            input.standingsRulesJson,
            'regras de classificação',
          ),
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsCategory' })
  @RequirePermissions(Permission.SportsCategory.Update)
  async updateCategory(
    @Args('input', { type: () => SportsCategoryUpdateInput })
    input: SportsCategoryUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsCategory.Update],
      { sportsCategoryId: input.id },
    );
    return (
      await this.publishMutation(
        'CATEGORY',
        this.admin.updateCategory(
        input.id,
        {
          ...input,
          scoreRules:
            input.scoreRulesJson === undefined
              ? undefined
              : this.parseJson(input.scoreRulesJson, 'regras de placar'),
          rosterRules:
            input.rosterRulesJson === undefined
              ? undefined
              : this.parseJson(input.rosterRulesJson, 'regras de elenco'),
          bracketRules:
            input.bracketRulesJson === undefined
              ? undefined
              : this.parseJson(input.bracketRulesJson, 'regras da chave'),
          standingsRules:
            input.standingsRulesJson === undefined
              ? undefined
              : this.parseJson(
                  input.standingsRulesJson,
                  'regras de classificação',
                ),
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'createSportsTeam' })
  @RequirePermissions(Permission.SportsTeam.Create)
  async createTeam(
    @Args('input', { type: () => SportsTeamCreateInput })
    input: SportsTeamCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Create], {
      sportsTournamentId: input.tournamentId,
    });
    return (
      await this.publishMutation(
        'TEAM',
        this.admin.createTeam(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsTeam' })
  @RequirePermissions(Permission.SportsTeam.Update)
  async updateTeam(
    @Args('input', { type: () => SportsTeamUpdateInput })
    input: SportsTeamUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Update], {
      sportsTeamId: input.id,
    });
    return (
      await this.publishMutation(
        'TEAM',
        this.admin.updateTeam(input.id, input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'assignSportsTeamRepresentative' })
  @RequirePermissions(Permission.SportsTeam.AssignRepresentative)
  async assignRepresentative(
    @Args('input', { type: () => SportsRepresentativeAssignInput })
    input: SportsRepresentativeAssignInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTeam.AssignRepresentative],
      { sportsTeamId: input.teamId },
    );
    return (
      await this.publishMutation(
        'REPRESENTATIVE',
        this.admin.assignRepresentative(input.teamId, input.personId, actor),
        false,
      )
    ).id;
  }

  @Mutation(() => Boolean, { name: 'revokeSportsTeamRepresentative' })
  @RequirePermissions(Permission.SportsTeam.AssignRepresentative)
  async revokeRepresentative(
    @Args('input', { type: () => SportsRepresentativeRevokeInput })
    input: SportsRepresentativeRevokeInput,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTeam.AssignRepresentative],
      { sportsTeamRepresentativeId: input.representativeId },
    );
    await this.admin.revokeRepresentative(input.representativeId, actor);
    await this.mutationEvents.publishForEntity(
      'REPRESENTATIVE',
      input.representativeId,
      false,
    );
    return true;
  }

  @Mutation(() => String, { name: 'createSportsRegistration' })
  @RequirePermissions(Permission.SportsRegistration.Create)
  async createRegistration(
    @Args('input', { type: () => SportsRegistrationCreateInput })
    input: SportsRegistrationCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsRegistration.Create],
      { sportsCategoryId: input.categoryId },
    );
    return (
      await this.publishMutation(
        'REGISTRATION',
        this.admin.createRegistration(
        {
          ...input,
          formAnswers: input.formAnswersJson
            ? this.parseJson(input.formAnswersJson, 'respostas do formulário')
            : null,
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsRegistration' })
  @RequirePermissions(Permission.SportsRegistration.Update)
  async updateRegistration(
    @Args('input', { type: () => SportsRegistrationUpdateInput })
    input: SportsRegistrationUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsRegistration.Update],
      { sportsRegistrationId: input.id },
    );
    return (
      await this.publishMutation(
        'REGISTRATION',
        this.admin.updateRegistration(
        input.id,
        {
          ...input,
          formAnswers:
            input.formAnswersJson === undefined
              ? undefined
              : input.formAnswersJson === null
                ? null
                : this.parseJson(
                    input.formAnswersJson,
                    'respostas do formulário',
                  ),
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'assignSportsCategoryRole' })
  @RequirePermissions(Permission.SportsRegistration.Update)
  async assignCategoryRole(
    @Args('input', { type: () => SportsRegistrationMemberUpsertInput })
    input: SportsRegistrationMemberUpsertInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsRegistration.Update],
      { sportsRegistrationId: input.registrationId },
    );
    const assignment = await this.admin.assignCategoryRole(
        {
          registrationId: input.registrationId,
          teamMemberId: input.teamMemberId,
          role: input.role,
        },
        actor,
      );
    await this.mutationEvents.publishForEntity(
      'REGISTRATION',
      input.registrationId,
      true,
    );
    return assignment.id;
  }

  @Mutation(() => String, { name: 'createSportsVenue' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async createVenue(
    @Args('input', { type: () => SportsVenueCreateInput })
    input: SportsVenueCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: input.tournamentId },
    );
    return (
      await this.publishMutation(
        'VENUE',
        this.admin.createVenue(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsVenue' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async updateVenue(
    @Args('input', { type: () => SportsVenueUpdateInput })
    input: SportsVenueUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: input.tournamentId },
    );
    return (
      await this.publishMutation(
        'VENUE',
        this.admin.updateVenue(input.id, input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'createSportsMatch' })
  @RequirePermissions(Permission.SportsMatch.Create)
  async createMatch(
    @Args('input', { type: () => SportsMatchCreateInput })
    input: SportsMatchCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    if (!input.eventId && (!input.startDate || !input.endDate)) {
      throw new BadRequestException(
        'Informe início e fim ao criar uma nova partida.',
      );
    }
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Create], {
      sportsCategoryId: input.categoryId,
    });
    return (
      await this.publishMutation(
        'MATCH',
        this.admin.createMatch(
        {
          ...input,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        actor,
        ),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsMatch' })
  @RequirePermissions(Permission.SportsMatch.Update)
  async updateMatch(
    @Args('input', { type: () => SportsMatchUpdateInput })
    input: SportsMatchUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Update], {
      sportsMatchId: input.id,
    });
    return (
      await this.publishMutation(
        'MATCH',
        this.admin.updateMatch(input.id, input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'assignSportsOfficial' })
  @RequirePermissions(Permission.SportsOfficial.Create)
  async assignOfficial(
    @Args('input', { type: () => SportsOfficialAssignInput })
    input: SportsOfficialAssignInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsOfficial.Create],
      {
        sportsTournamentId: input.tournamentId,
        sportsCategoryId: input.categoryId ?? undefined,
        sportsMatchId: input.matchId ?? undefined,
      },
    );
    return (
      await this.publishMutation(
        'OFFICIAL',
        this.admin.assignOfficial(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsOfficial' })
  @RequirePermissions(Permission.SportsOfficial.Update)
  async updateOfficial(
    @Args('input', { type: () => SportsOfficialUpdateInput })
    input: SportsOfficialUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsOfficial.Update],
      { sportsOfficialAssignmentId: input.id },
    );
    return (
      await this.publishMutation(
        'OFFICIAL',
        this.admin.updateOfficial(input.id, input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'upsertAdminSportsMatchRoster' })
  @RequirePermissions(Permission.SportsMatch.Update)
  async upsertAdminRoster(
    @Args('input', { type: () => SportsMatchRosterUpsertInput })
    input: SportsMatchRosterUpsertInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Update], {
      sportsMatchId: input.matchId,
    });
    await this.frozen.assertEventMutable(
      await this.admin.getMatchEventId(input.matchId),
      actor,
      'edit',
    );
    if (!actor.sub) {
      throw new BadRequestException(
        'O usuário autenticado não possui identificador.',
      );
    }
    return (
      await this.rosters.upsert(
        {
          matchId: input.matchId,
          registrationId: input.registrationId,
          expectedRevision: input.expectedRevision,
          entries: input.entries.map((entry) => ({
            registrationMemberId: entry.registrationMemberId,
            role: entry.role ?? 'PLAYER',
          })),
        },
        actor.sub,
        actor,
        true,
      )
    ).id;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Delete)
  async deleteTournament(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Delete],
      { sportsTournamentId: id },
    );
    await this.admin.deleteTournament(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('TOURNAMENT', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsCategory' })
  @RequirePermissions(Permission.SportsCategory.Delete)
  async deleteCategory(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsCategory.Delete], {
      sportsCategoryId: id,
    });
    await this.admin.deleteCategory(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('CATEGORY', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsTeam' })
  @RequirePermissions(Permission.SportsTeam.Delete)
  async deleteTeam(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Delete], {
      sportsTeamId: id,
    });
    await this.admin.deleteTeam(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('TEAM', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsRegistration' })
  @RequirePermissions(Permission.SportsRegistration.Delete)
  async deleteRegistration(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsRegistration.Delete],
      { sportsRegistrationId: id },
    );
    await this.admin.deleteRegistration(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('REGISTRATION', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsMatch' })
  @RequirePermissions(Permission.SportsMatch.Delete)
  async deleteMatch(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Delete], {
      sportsMatchId: id,
    });
    await this.admin.deleteMatch(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('MATCH', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsVenue' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async deleteVenue(
    @Args('id', { type: () => String }) id: string,
    @Args('tournamentId', { type: () => String }) tournamentId: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: tournamentId },
    );
    await this.admin.deleteVenue(id, expectedRevision, actor, tournamentId);
    await this.mutationEvents.publishForEntity('VENUE', id, true);
    return true;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsOfficial' })
  @RequirePermissions(Permission.SportsOfficial.Delete)
  async deleteOfficial(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsOfficial.Delete], {
      sportsOfficialAssignmentId: id,
    });
    await this.admin.deleteOfficial(id, expectedRevision, actor);
    await this.mutationEvents.publishForEntity('OFFICIAL', id, true);
    return true;
  }

  @Mutation(() => String, { name: 'createSportsTournamentScoreEntry' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async createTournamentScoreEntry(
    @Args('input', { type: () => SportsTournamentScoreEntryInput })
    input: SportsTournamentScoreEntryInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: input.tournamentId },
    );
    return (
      await this.publishMutation(
        'SCORE_ENTRY',
        this.admin.createTournamentScoreEntry(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'updateSportsTournamentScoreEntry' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async updateTournamentScoreEntry(
    @Args('input', { type: () => SportsTournamentScoreEntryUpdateInput })
    input: SportsTournamentScoreEntryUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: input.tournamentId },
    );
    return (
      await this.publishMutation(
        'SCORE_ENTRY',
        this.admin.updateTournamentScoreEntry(input.id, input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => Boolean, { name: 'deleteSportsTournamentScoreEntry' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async deleteTournamentScoreEntry(
    @Args('id', { type: () => String }) id: string,
    @Args('tournamentId', { type: () => String }) tournamentId: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: tournamentId },
    );
    await this.admin.deleteTournamentScoreEntry(
      id,
      tournamentId,
      expectedRevision,
      actor,
    );
    await this.mutationEvents.publishForEntity('SCORE_ENTRY', id, true);
    return true;
  }

  @Mutation(() => [String], { name: 'generateSportsBracket' })
  @RequirePermissions(Permission.SportsMatch.Create)
  async generateBracket(
    @Args('input', { type: () => SportsBracketGenerateInput })
    input: SportsBracketGenerateInput,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Create], {
      sportsCategoryId: input.categoryId,
    });
    return (
      await this.brackets.generate(input, actor)
    ).map((stage) => stage.id);
  }

  @Mutation(() => [String], { name: 'generateNextSportsSwissRound' })
  @RequirePermissions(Permission.SportsMatch.Create)
  async generateNextSwissRound(
    @Args('categoryId', { type: () => String }) categoryId: string,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Create], {
      sportsCategoryId: categoryId,
    });
    return (
      await this.brackets.generateNextSwissRound(categoryId, actor)
    ).map((match) => match.id);
  }

  @Mutation(() => String, { name: 'reviewSportsTeamChange' })
  @RequirePermissions(Permission.SportsTeam.Review)
  async reviewTeamChange(
    @Args('input', { type: () => SportsTeamChangeReviewInput })
    input: SportsTeamChangeReviewInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Review], {
      sportsTeamChangeRequestId: input.requestId,
    });
    await this.assertTeamChangeReviewMutable(input.requestId, actor);
    const decision =
      input.decision === SportsTeamChangeRequestStatus.APPROVED
        ? 'APPROVE'
        : input.decision === SportsTeamChangeRequestStatus.REJECTED
          ? 'REJECT'
          : 'REQUEST_CHANGES';
    return (
      await this.publishMutation(
        'TEAM_CHANGE',
        this.teamChanges.review(input.requestId, decision, actor, {
        expectedRequestRevision: input.expectedRequestRevision,
        message: input.reviewMessage ?? undefined,
        resolvedDelta: input.resolvedDeltaJson
          ? this.parseObject(input.resolvedDeltaJson, 'alterações resolvidas')
          : undefined,
        forceConflicts: input.forceConflicts ?? false,
        }),
        decision === 'APPROVE',
      )
    ).id;
  }

  @Mutation(() => String, { name: 'reviewSportsPlayerApplication' })
  @RequirePermissions(Permission.SportsRegistration.Approve)
  async reviewPlayerApplication(
    @Args('input', { type: () => SportsPlayerApplicationReviewInput })
    input: SportsPlayerApplicationReviewInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsRegistration.Approve],
      { sportsPlayerApplicationId: input.applicationId },
    );
    await this.assertPlayerApplicationReviewMutable(input.applicationId, actor);
    const decision =
      input.decision === 'APPROVED'
        ? 'APPROVE'
        : input.decision === 'REJECTED'
          ? 'REJECT'
          : 'REQUEST_CHANGES';
    return (
      await this.publishMutation(
        'APPLICATION',
        this.applications.review(
        input.applicationId,
        decision,
        actor,
        input.reviewMessage ?? undefined,
        ),
        decision === 'APPROVE',
      )
    ).id;
  }

  @Mutation(() => String, { name: 'reviewSportsMatchAction' })
  @RequirePermissions(Permission.SportsMatch.Review)
  async reviewMatchAction(
    @Args('input', { type: () => SportsMatchActionReviewInput })
    input: SportsMatchActionReviewInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Review], {
      sportsMatchActionId: input.actionId,
    });
    await this.assertMatchActionReviewMutable(input.actionId, actor);
    return (
      await this.operations.review(
        input.actionId,
        input.decision as SportsReviewStatus,
        actor,
        {
          reviewMessage: input.reviewMessage,
          correctedPayload: input.correctedPayloadJson
            ? this.parseJson(
                input.correctedPayloadJson,
                'correção da ação',
              )
            : undefined,
        },
      )
    ).id;
  }

  @Mutation(() => String, { name: 'reviewSportsMatchRoster' })
  @RequirePermissions(Permission.SportsMatch.Review)
  async reviewRoster(
    @Args('rosterId', { type: () => String }) rosterId: string,
    @Args('approve', { type: () => Boolean }) approve: boolean,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    if (!actor.sub) {
      throw new BadRequestException('O usuário autenticado não possui identificador.');
    }
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Review], {
      sportsMatchRosterId: rosterId,
    });
    await this.assertRosterReviewMutable(rosterId, actor);
    return (
      await this.rosters.review(
        rosterId,
        approve ? 'APPROVE' : 'REJECT',
        actor.sub,
        actor,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'cloneSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Duplicate)
  async cloneTournament(
    @Args('input', { type: () => SportsTournamentCloneInput })
    input: SportsTournamentCloneInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Duplicate],
      { sportsTournamentId: input.sourceTournamentId },
    );
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Create],
      { majorEventId: input.destinationMajorEventId },
    );
    const parts = input.parts ?? {
      categories: true,
      teams: true,
      registrations: true,
      venues: true,
      officials: true,
      rules: true,
    };
    const destinationPermissions = [
      ...(parts.categories ? [Permission.SportsCategory.Create] : []),
      ...(parts.teams ? [Permission.SportsTeam.Create] : []),
      ...(parts.registrations ? [Permission.SportsRegistration.Create] : []),
      ...(parts.venues ? [Permission.SportsTournament.Update] : []),
      ...(parts.officials ? [Permission.SportsOfficial.Create] : []),
    ];
    if (destinationPermissions.length > 0) {
      await this.policy.assertPermissions(actor, destinationPermissions, {
        majorEventId: input.destinationMajorEventId,
      });
    }
    const sourcePermissions = [
      ...(parts.categories ? [Permission.SportsCategory.Read] : []),
      ...(parts.teams ? [Permission.SportsTeam.Read] : []),
      ...(parts.registrations ? [Permission.SportsRegistration.Read] : []),
      ...(parts.officials ? [Permission.SportsOfficial.Read] : []),
    ];
    if (sourcePermissions.length > 0) {
      await this.policy.assertPermissions(actor, sourcePermissions, {
        sportsTournamentId: input.sourceTournamentId,
      });
    }
    return (
      await this.publishMutation(
        'TOURNAMENT',
        this.duplication.cloneTournament(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'cloneSportsCategory' })
  @RequirePermissions(Permission.SportsCategory.Duplicate)
  async cloneCategory(
    @Args('input', { type: () => SportsCategoryCloneInput })
    input: SportsCategoryCloneInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsCategory.Duplicate],
      { sportsCategoryId: input.sourceCategoryId },
    );
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsCategory.Create],
      { sportsTournamentId: input.destinationTournamentId },
    );
    const nestedPermissions = [
      ...(input.includeRegistrations
        ? [Permission.SportsRegistration.Create]
        : []),
      ...(input.includeOfficials ? [Permission.SportsOfficial.Create] : []),
    ];
    if (nestedPermissions.length > 0) {
      await this.policy.assertPermissions(actor, nestedPermissions, {
        sportsTournamentId: input.destinationTournamentId,
      });
    }
    const sourceNestedPermissions = [
      ...(input.includeRegistrations
        ? [Permission.SportsRegistration.Read]
        : []),
      ...(input.includeOfficials ? [Permission.SportsOfficial.Read] : []),
    ];
    if (sourceNestedPermissions.length > 0) {
      await this.policy.assertPermissions(actor, sourceNestedPermissions, {
        sportsCategoryId: input.sourceCategoryId,
      });
    }
    return (
      await this.publishMutation(
        'CATEGORY',
        this.duplication.cloneCategory(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'cloneSportsTeam' })
  @RequirePermissions(Permission.SportsTeam.Duplicate)
  async cloneTeam(
    @Args('input', { type: () => SportsTeamCloneInput })
    input: SportsTeamCloneInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Duplicate], {
      sportsTeamId: input.sourceTeamId,
    });
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Create], {
      sportsTournamentId: input.destinationTournamentId,
    });
    if (input.includeRepresentatives) {
      await this.policy.assertPermissions(
        actor,
        [Permission.SportsTeam.AssignRepresentative],
        { sportsTournamentId: input.destinationTournamentId },
      );
    }
    if (input.includeMembers) {
      await this.policy.assertPermissions(
        actor,
        [Permission.Person.Read],
        {},
      );
      await this.policy.assertPermissions(
        actor,
        [Permission.SportsRegistration.Read],
        { sportsTeamId: input.sourceTeamId },
      );
      await this.policy.assertPermissions(
        actor,
        [Permission.SportsRegistration.Update],
        { sportsTournamentId: input.destinationTournamentId },
      );
    }
    return (
      await this.publishMutation(
        'TEAM',
        this.duplication.cloneTeam(input, actor),
        true,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'submitSportsTeamChange' })
  async submitTeamChange(
    @Args('input', { type: () => SportsTeamChangeRequestInput })
    input: SportsTeamChangeRequestInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const { actor } = await this.access.requireTeamRepresentative(
      context,
      input.teamId,
    );
    const delta = this.parseObject(input.deltaJson, 'alterações da equipe');
    return (
      await this.publishMutation(
        'TEAM_CHANGE',
        this.teamChanges.submit(input.teamId, actor.id, {
        type: input.type,
        baseRevision: input.baseRevision,
        expectedRequestRevision: input.expectedRequestRevision,
        delta,
        identities: input.identityClaims?.map((identity) => ({
          clientKey: identity.clientKey,
          type: identity.type,
          value: identity.value,
        })),
        }),
        false,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'submitSportsPlayerApplication' })
  async submitPlayerApplication(
    @Args('input', { type: () => SportsPlayerApplicationCreateInput })
    input: SportsPlayerApplicationCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const person = await this.currentUser.requireCurrentPerson(context);
    const actor = this.authenticated(context);
    return (
      await this.publishMutation(
        'APPLICATION',
        this.applications.submitSelfApplication(input, person.id, actor),
        false,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'submitSportsMatchRoster' })
  async submitRoster(
    @Args('input', { type: () => SportsMatchRosterUpsertInput })
    input: SportsMatchRosterUpsertInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const { actor } = await this.access.requireRosterManager(
      context,
      input.registrationId,
    );
    return (
      await this.rosters.upsert(
        {
          matchId: input.matchId,
          registrationId: input.registrationId,
          expectedRevision: input.expectedRevision,
          entries: input.entries.map((entry) => ({
            registrationMemberId: entry.registrationMemberId,
            role: entry.role ?? 'PLAYER',
          })),
        },
        actor.id,
        createSportsAuditActor(actor),
        false,
      )
    ).id;
  }

  @Mutation(() => Boolean, { name: 'checkInSportsRosterEntry' })
  async checkInRosterEntry(
    @Args('matchId', { type: () => String }) matchId: string,
    @Args('input', { type: () => SportsRosterCheckInInput })
    input: SportsRosterCheckInInput,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const { actor } = await this.access.requireMatchOfficial(context, matchId);
    await this.rosters.checkIn(
      matchId,
      input.rosterEntryId,
      input.checkedInAt ?? new Date(),
      actor.id,
      createSportsAuditActor(actor),
    );
    return true;
  }

  @Mutation(() => [String], { name: 'commitSportsMatchActions' })
  async commitMatchActions(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const matchId = this.singleMatchId(input);
    const { actor, assignment } = await this.access.requireMatchOfficial(
      context,
      matchId,
    );
    return (
      await this.operations.commit(
        input.actions.map((action) => ({
          ...action,
          payload: this.parseJson(action.payloadJson, 'ação da partida'),
        })),
        {
          personId: actor.id,
          userId: this.authenticated(context).sub,
          role: assignment.role,
          kind: 'OFFICIAL',
          auditActor: createSportsAuditActor(actor),
        },
      )
    ).map((action) => action.id);
  }

  @Mutation(() => [String], { name: 'commitAdminSportsMatchActions' })
  @RequirePermissions(Permission.SportsMatch.Operate)
  async commitAdminMatchActions(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const matchId = this.singleMatchId(input);
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Operate], {
      sportsMatchId: matchId,
    });
    await this.assertMatchMutable(matchId, actor);
    return (
      await this.operations.commit(
        input.actions.map((action) => ({
          ...action,
          payload: this.parseJson(action.payloadJson, 'ação da partida'),
        })),
        {
          userId: actor.sub,
          role: 'ADMIN',
          kind: 'ADMIN',
          auditActor: actor,
        },
      )
    ).map((action) => action.id);
  }

  @Mutation(() => String, { name: 'forfeitSportsMatch' })
  async forfeitMatch(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    if (
      input.actions.length !== 1 ||
      input.actions[0].type !== SportsMatchActionType.FORFEIT
    ) {
      throw new BadRequestException('Envie uma única ação de desistência.');
    }
    const action = input.actions[0];
    const payload = this.parseObject(action.payloadJson, 'desistência');
    const registrationId = this.readString(payload['loserRegistrationId']);
    if (!registrationId) {
      throw new BadRequestException('Informe a equipe que está desistindo.');
    }
    const { actor, assignment } = await this.access.requireLineupManager(
      context,
      registrationId,
    );
    return (
      await this.operations.commit(
        [{ ...action, payload }],
        {
          personId: actor.id,
          userId: this.authenticated(context).sub,
          role: assignment.role,
          kind: 'LINEUP_MANAGER',
          auditActor: createSportsAuditActor(actor),
        },
      )
    )[0].id;
  }

  private authenticated(context: GraphqlContext): AuthenticatedUser {
    return this.currentUser.getAuthenticatedUser(context);
  }

  private async assertTeamChangeReviewMutable(
    requestId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
      await this.frozen.assertMajorEventMutable(
        request.team.tournament.majorEventId,
        actor,
        'edit',
      );
    }
  }

  private async assertPlayerApplicationReviewMutable(
    applicationId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
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
        await this.policy.assertPermissions(
          actor,
          [Permission.SportsRegistration.Approve],
          { sportsCategoryId: choice.categoryId },
        );
      }
      await this.frozen.assertMajorEventMutable(
        application.tournament.majorEventId,
        actor,
        'edit',
      );
    }
  }

  private async assertMatchActionReviewMutable(
    actionId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const action = await this.prisma.sportsMatchAction.findUnique({
      where: { id: actionId },
      select: { matchId: true },
    });
    if (action) {
      await this.assertMatchMutable(action.matchId, actor);
    }
  }

  private async assertRosterReviewMutable(
    rosterId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const roster = await this.prisma.sportsMatchRoster.findUnique({
      where: { id: rosterId },
      select: { matchId: true },
    });
    if (roster) {
      await this.assertMatchMutable(roster.matchId, actor);
    }
  }

  private async assertMatchMutable(
    matchId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const match = await this.prisma.sportsMatch.findUnique({
      where: { id: matchId },
      select: { eventId: true },
    });
    if (match) {
      await this.frozen.assertEventMutable(match.eventId, actor, 'edit');
    }
  }

  private async publishMutation<T extends { id: string }>(
    entity: SportsMutationEntity,
    mutation: Promise<T>,
    includePublic: boolean,
  ): Promise<T> {
    const result = await mutation;
    await this.mutationEvents.publishForEntity(
      entity,
      result.id,
      includePublic,
    );
    return result;
  }

  private singleMatchId(input: CommitSportsMatchActionsInput): string {
    if (input.actions.length === 0) {
      throw new BadRequestException('Envie ao menos uma ação.');
    }
    const ids = new Set(input.actions.map((action) => action.matchId));
    if (ids.size !== 1) {
      throw new BadRequestException('O lote deve pertencer a uma única partida.');
    }
    return input.actions[0].matchId;
  }

  private parseJson(value: string, label: string): Prisma.InputJsonValue {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException(`JSON inválido em ${label}.`);
    }
  }

  private parseObject(
    value: string,
    label: string,
  ): Record<string, unknown> {
    const parsed = this.parseJson(value, label);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException(`${label} deve ser um objeto JSON.`);
    }
    return parsed as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
