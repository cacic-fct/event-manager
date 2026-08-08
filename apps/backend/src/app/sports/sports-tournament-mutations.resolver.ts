import { SportsCategoryCreateInput, SportsCategoryUpdateInput, SportsTournamentCreateInput, SportsTournamentUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsTournamentMutationsResolver extends SportsMutationsResolverSupport {
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
          selfSubscriptionAllowNoTeam:
            input.selfSubscriptionAllowNoTeam,
          selfSubscriptionAllowNoCategory:
            input.selfSubscriptionAllowNoCategory,
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
          selfSubscriptionAllowNoTeam:
            input.selfSubscriptionAllowNoTeam,
          selfSubscriptionAllowNoCategory:
            input.selfSubscriptionAllowNoCategory,
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
          timerRules: this.parseTimerRules(input.timerRulesJson),
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
          timerRules:
            input.timerRulesJson === undefined
              ? undefined
              : this.parseTimerRules(input.timerRulesJson),
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

}

