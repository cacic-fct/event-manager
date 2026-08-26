import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  PrizeDraw,
  PrizeDrawAvailability,
  PrizeDrawEligibleEntry,
  PrizeDrawSpinResult,
  PrizeDrawWinnerContact,
  SavePrizeDrawInput,
  SpinPrizeDrawInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GraphqlContext } from '../current-user/selects';
import { PrizeDrawService } from './prize-draw.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';

@Resolver(() => PrizeDraw)
export class PrizeDrawResolver {
  constructor(private readonly draws: PrizeDrawService) {}

  @Query(() => [PrizeDraw], { name: 'prizeDraws' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.PrizeDraw.Read)
  prizeDraws(@Context() context: GraphqlContext): Promise<PrizeDraw[]> {
    return this.draws.listAdmin(this.user(context));
  }

  @Query(() => PrizeDraw, { name: 'prizeDraw' })
  @RequirePermissions(Permission.PrizeDraw.Read)
  prizeDraw(@Args('drawId', { type: () => String }) drawId: string): Promise<PrizeDraw> {
    return this.draws.getAdmin(drawId);
  }

  @Query(() => [PrizeDrawEligibleEntry], { name: 'prizeDrawEligibleEntries' })
  @RequirePermissions(Permission.PrizeDraw.Read)
  prizeDrawEligibleEntries(@Args('drawId', { type: () => String }) drawId: string): Promise<PrizeDrawEligibleEntry[]> {
    return this.draws.eligibleEntries(drawId);
  }

  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  @Query(() => [PrizeDraw], { name: 'publicPrizeDraws' })
  publicPrizeDraws(
    @Context() context: GraphqlContext,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
    @Args('eventGroupId', { type: () => String, nullable: true }) eventGroupId?: string,
  ): Promise<PrizeDraw[]> {
    return this.draws.listPublic({ eventId, majorEventId, eventGroupId }, this.user(context));
  }

  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  @Query(() => [PrizeDrawAvailability], { name: 'publicPrizeDrawAvailability' })
  publicPrizeDrawAvailability(
    @Context() context: GraphqlContext,
    @Args('eventIds', { type: () => [String], nullable: true }) eventIds?: string[],
    @Args('majorEventIds', { type: () => [String], nullable: true }) majorEventIds?: string[],
    @Args('eventGroupIds', { type: () => [String], nullable: true }) eventGroupIds?: string[],
  ): Promise<PrizeDrawAvailability[]> {
    return this.draws.publicAvailability(
      { eventIds, majorEventIds, eventGroupIds },
      this.user(context),
    );
  }

  @Mutation(() => PrizeDraw, { name: 'savePrizeDraw' })
  savePrizeDraw(
    @Args('input', { type: () => SavePrizeDrawInput }) input: SavePrizeDrawInput,
    @Context() context: GraphqlContext,
  ): Promise<PrizeDraw> {
    return this.draws.save(input, this.user(context));
  }

  @Mutation(() => PrizeDraw, { name: 'freezePrizeDrawEligibility' })
  @RequirePermissions(Permission.PrizeDraw.Update)
  freezePrizeDrawEligibility(
    @Args('drawId', { type: () => String }) drawId: string,
    @Context() context: GraphqlContext,
  ): Promise<PrizeDraw> {
    return this.draws.freeze(drawId, this.user(context));
  }

  @Mutation(() => PrizeDraw, { name: 'unfreezePrizeDrawEligibility' })
  @RequirePermissions(Permission.PrizeDraw.Update)
  unfreezePrizeDrawEligibility(
    @Args('drawId', { type: () => String }) drawId: string,
    @Context() context: GraphqlContext,
  ): Promise<PrizeDraw> {
    return this.draws.unfreeze(drawId, this.user(context));
  }

  @Mutation(() => PrizeDrawSpinResult, { name: 'spinPrizeDraw' })
  @RequirePermissions(Permission.PrizeDraw.Operate)
  spinPrizeDraw(
    @Args('input', { type: () => SpinPrizeDrawInput }) input: SpinPrizeDrawInput,
    @Context() context: GraphqlContext,
  ): Promise<PrizeDrawSpinResult> {
    return this.draws.spin(input, this.user(context));
  }

  @Mutation(() => PrizeDraw, { name: 'undoLastPrizeDrawSpin' })
  @RequirePermissions(Permission.PrizeDraw.Undo)
  undoLastPrizeDrawSpin(
    @Args('drawId', { type: () => String }) drawId: string,
    @Context() context: GraphqlContext,
  ): Promise<PrizeDraw> {
    return this.draws.undoLast(drawId, this.user(context));
  }

  @Query(() => PrizeDrawWinnerContact, { name: 'prizeDrawWinnerContact' })
  @RequirePermissions(Permission.PrizeDraw.ContactRead)
  prizeDrawWinnerContact(@Args('spinId', { type: () => String }) spinId: string): Promise<PrizeDrawWinnerContact> {
    return this.draws.winnerContact(spinId);
  }

  private user(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
