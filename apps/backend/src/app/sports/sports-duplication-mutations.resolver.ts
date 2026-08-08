import {
  SportsCategoryCloneInput,
  SportsTeamCloneInput,
  SportsTournamentCloneInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsDuplicationMutationsResolver extends SportsMutationsResolverSupport {
  @Mutation(() => String, { name: 'cloneSportsTournament' })
  @RequirePermissions(Permission.SportsTournament.Duplicate)
  async cloneTournament(
    @Args('input', { type: () => SportsTournamentCloneInput })
    input: SportsTournamentCloneInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Duplicate], {
      sportsTournamentId: input.sourceTournamentId,
    });
    await this.policy.assertPermissions(actor, [Permission.SportsTournament.Create], {
      majorEventId: input.destinationMajorEventId,
    });
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
    return (await this.publishMutation('TOURNAMENT', this.duplication.cloneTournament(input, actor), true)).id;
  }

  @Mutation(() => String, { name: 'cloneSportsCategory' })
  @RequirePermissions(Permission.SportsCategory.Duplicate)
  async cloneCategory(
    @Args('input', { type: () => SportsCategoryCloneInput })
    input: SportsCategoryCloneInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsCategory.Duplicate], {
      sportsCategoryId: input.sourceCategoryId,
    });
    await this.policy.assertPermissions(actor, [Permission.SportsCategory.Create], {
      sportsTournamentId: input.destinationTournamentId,
    });
    const nestedPermissions = [
      ...(input.includeRegistrations ? [Permission.SportsRegistration.Create] : []),
      ...(input.includeOfficials ? [Permission.SportsOfficial.Create] : []),
    ];
    if (nestedPermissions.length > 0) {
      await this.policy.assertPermissions(actor, nestedPermissions, {
        sportsTournamentId: input.destinationTournamentId,
      });
    }
    const sourceNestedPermissions = [
      ...(input.includeRegistrations ? [Permission.SportsRegistration.Read] : []),
      ...(input.includeOfficials ? [Permission.SportsOfficial.Read] : []),
    ];
    if (sourceNestedPermissions.length > 0) {
      await this.policy.assertPermissions(actor, sourceNestedPermissions, {
        sportsCategoryId: input.sourceCategoryId,
      });
    }
    return (await this.publishMutation('CATEGORY', this.duplication.cloneCategory(input, actor), true)).id;
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
      await this.policy.assertPermissions(actor, [Permission.SportsTeam.AssignRepresentative], {
        sportsTournamentId: input.destinationTournamentId,
      });
    }
    if (input.includeMembers) {
      await this.policy.assertPermissions(actor, [Permission.Person.Read], {});
      await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Read], {
        sportsTeamId: input.sourceTeamId,
      });
      await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Update], {
        sportsTournamentId: input.destinationTournamentId,
      });
    }
    return (await this.publishMutation('TEAM', this.duplication.cloneTeam(input, actor), true)).id;
  }
}
