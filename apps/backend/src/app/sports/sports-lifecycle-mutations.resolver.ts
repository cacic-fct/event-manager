import { SportsTournamentScoreEntryInput, SportsTournamentScoreEntryUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Int, Mutation, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsLifecycleMutationsResolver extends SportsMutationsResolverSupport {
  @Mutation(() => Boolean, { name: 'deleteSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Delete)
  async deleteTournament(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Delete], { sportsTournamentId: id });
    await this.admin.deleteTournament(id, expectedRevision, actor);
    await this.publishEntityMutation('TOURNAMENT', id, true);
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
    await this.publishEntityMutation('CATEGORY', id, true);
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
    await this.publishEntityMutation('TEAM', id, true);
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
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Delete], { sportsRegistrationId: id });
    await this.admin.deleteRegistration(id, expectedRevision, actor);
    await this.publishEntityMutation('REGISTRATION', id, true);
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
    await this.publishEntityMutation('MATCH', id, true);
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
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Update], {
      sportsTournamentId: tournamentId,
    });
    await this.admin.deleteVenue(id, expectedRevision, actor, tournamentId);
    await this.publishEntityMutation('VENUE', id, true);
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
    await this.publishEntityMutation('OFFICIAL', id, true);
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
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Update], {
      sportsTournamentId: input.tournamentId,
    });
    return (await this.publishMutation('SCORE_ENTRY', this.admin.createTournamentScoreEntry(input, actor), true)).id;
  }

  @Mutation(() => String, { name: 'updateSportsTournamentScoreEntry' })
  @RequirePermissions(Permission.SportsTournament.Update)
  async updateTournamentScoreEntry(
    @Args('input', { type: () => SportsTournamentScoreEntryUpdateInput })
    input: SportsTournamentScoreEntryUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Update], {
      sportsTournamentId: input.tournamentId,
    });
    return (
      await this.publishMutation('SCORE_ENTRY', this.admin.updateTournamentScoreEntry(input.id, input, actor), true)
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
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Update], {
      sportsTournamentId: tournamentId,
    });
    await this.admin.deleteTournamentScoreEntry(id, tournamentId, expectedRevision, actor);
    await this.publishEntityMutation('SCORE_ENTRY', id, true);
    return true;
  }
}
