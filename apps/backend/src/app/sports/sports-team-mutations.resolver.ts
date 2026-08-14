import {
  SportsRegistrationCreateInput,
  SportsRegistrationMemberUpsertInput,
  SportsRegistrationUpdateInput,
  SportsRepresentativeAssignInput,
  SportsRepresentativeRevokeInput,
  SportsParticipantTeamAssignmentInput,
  SportsTeamCreateInput,
  SportsTeamMemberCreateInput,
  SportsTeamMemberUpdateInput,
  SportsTeamUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsTeamMutationsResolver extends SportsMutationsResolverSupport {
  @Mutation(() => String, { name: 'setSportsParticipantTeam' })
  @RequirePermissions(Permission.SportsTeam.Update)
  async setParticipantTeam(
    @Args('input', { type: () => SportsParticipantTeamAssignmentInput })
    input: SportsParticipantTeamAssignmentInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const participant = await this.prisma.sportsTournamentParticipant.findFirst({
      where: { id: input.participantId, deletedAt: null },
      select: { tournamentId: true },
    });
    if (!participant) {
      throw new NotFoundException(`Sports participant ${input.participantId} was not found.`);
    }
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Update], {
      sportsTournamentId: participant.tournamentId,
    });
    return (await this.admin.setParticipantTeam(input.participantId, input.teamId?.trim() || null, actor)).id;
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
    return (await this.publishMutation('TEAM', this.admin.createTeam(input, actor), true)).id;
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
    return (await this.publishMutation('TEAM', this.admin.updateTeam(input.id, input, actor), true)).id;
  }

  @Mutation(() => String, { name: 'createSportsTeamMember' })
  @RequirePermissions(Permission.SportsTeam.Update)
  async createTeamMember(
    @Args('input', { type: () => SportsTeamMemberCreateInput })
    input: SportsTeamMemberCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    if (!input.personId) {
      throw new BadRequestException('Administradores devem selecionar uma pessoa autorizada.');
    }
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Update], {
      sportsTeamId: input.teamId,
    });
    return (await this.publishMutation('TEAM', this.admin.createTeamMember(input.teamId, input.personId, actor), true))
      .id;
  }

  @Mutation(() => String, { name: 'updateSportsTeamMember' })
  @RequirePermissions(Permission.SportsTeam.Update)
  async updateTeamMember(
    @Args('input', { type: () => SportsTeamMemberUpdateInput })
    input: SportsTeamMemberUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const actor = this.authenticated(context);
    const member = await this.prisma.sportsTeamMember.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { teamId: true },
    });
    if (!member) {
      throw new NotFoundException(`Sports team member ${input.id} was not found.`);
    }
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.Update], {
      sportsTeamId: member.teamId,
    });
    return (
      await this.publishMutation(
        'TEAM',
        this.admin.updateTeamMember(input.id, input.expectedRevision, input.status ?? 'APPROVED', actor),
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
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.AssignRepresentative], {
      sportsTeamId: input.teamId,
    });
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
    await this.policy.assertPermissions(actor, [Permission.SportsTeam.AssignRepresentative], {
      sportsTeamRepresentativeId: input.representativeId,
    });
    await this.admin.revokeRepresentative(input.representativeId, actor);
    await this.publishEntityMutation('REPRESENTATIVE', input.representativeId, false);
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
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Create], {
      sportsCategoryId: input.categoryId,
    });
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
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Update], {
      sportsRegistrationId: input.id,
    });
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
                  : this.parseJson(input.formAnswersJson, 'respostas do formulário'),
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
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Update], {
      sportsRegistrationId: input.registrationId,
    });
    const assignment = await this.admin.assignCategoryRole(
      {
        registrationId: input.registrationId,
        teamMemberId: input.teamMemberId,
        role: input.role,
      },
      actor,
    );
    await this.publishEntityMutation('REGISTRATION', input.registrationId, true);
    return assignment.id;
  }
}
