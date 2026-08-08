import { SportsMatchCreateInput, SportsMatchRosterUpsertInput, SportsMatchUpdateInput, SportsOfficialAssignInput, SportsOfficialUpdateInput, SportsVenueCreateInput, SportsVenueUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsMatchAdminMutationsResolver extends SportsMutationsResolverSupport {
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
    const venue = await this.prisma.sportsVenue.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { tournamentId: true },
    });
    if (!venue) {
      throw new NotFoundException('Local esportivo não encontrado.');
    }
    await this.policy.assertPermissions(
      actor,
      [Permission.SportsTournament.Update],
      { sportsTournamentId: venue.tournamentId },
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
            shirtNumber: entry.shirtNumber,
            roleMetadata:
              entry.roleMetadataJson === null
                ? Prisma.DbNull
                : entry.roleMetadataJson === undefined
                  ? undefined
                  : this.parseJson(
                      entry.roleMetadataJson,
                      'metadados da função na escalação',
                    ),
          })),
        },
        actor.sub,
        actor,
        true,
      )
    ).id;
  }

}

