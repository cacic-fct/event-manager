import { SportsBracketGenerateInput, SportsMatchActionReviewInput, SportsPlayerApplicationReviewInput, SportsTeamChangeReviewInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { SportsReviewStatus, SportsTeamChangeRequestStatus } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsReviewMutationsResolver extends SportsMutationsResolverSupport {
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
    const decision =
      input.decision === 'APPROVED'
        ? SportsReviewStatus.APPROVED
        : input.decision === 'REJECTED'
          ? SportsReviewStatus.REJECTED
          : input.decision === 'CHANGES_REQUESTED'
            ? SportsReviewStatus.CHANGES_REQUESTED
            : null;
    if (!decision) {
      throw new BadRequestException('Decisão de revisão inválida.');
    }
    return (
      await this.operations.review(
        input.actionId,
        decision,
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

}

