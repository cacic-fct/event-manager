import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { CurrentUserContextService } from '../current-user/context.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { Permission } from '@cacic-fct/shared-permissions';
import { InterestTargetType } from '@cacic-fct/shared-data-types';
import {
  ConvertEventInterestToSubscriptionInput,
  CurrentUserInterestState,
  EventInterest,
  EventInterestConversion,
} from './models';
import { EventInterestsService } from './interest.service';

@Resolver(() => EventInterest)
export class EventInterestsResolver {
  constructor(
    private readonly interests: EventInterestsService,
    private readonly currentUser: CurrentUserContextService,
    private readonly realtime: CurrentUserOnlineAttendanceRealtimeService,
  ) {}

  @Query(() => EventInterest, { name: 'currentUserInterest', nullable: true })
  async currentUserInterest(
    @Args('targetType', { type: () => InterestTargetType }) targetType: InterestTargetType,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventInterest | null> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.interests.getCurrentUserInterest(person.id, targetType, targetId);
  }

  @Query(() => CurrentUserInterestState, { name: 'currentUserInterestState' })
  async currentUserInterestState(
    @Args('targetType', { type: () => InterestTargetType }) targetType: InterestTargetType,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserInterestState> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.interests.getCurrentUserInterestState(person.id, targetType, targetId);
  }

  @Query(() => [EventInterest], { name: 'currentUserInterests' })
  async currentUserInterests(
    @Context() context: GraphqlContext,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<EventInterest[]> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.interests.listCurrentUserInterests(person.id, majorEventId);
  }

  @Query(() => [EventInterest], { name: 'currentUserEventInterests' })
  async currentUserEventInterests(
    @Context() context: GraphqlContext,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<EventInterest[]> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.interests.listCurrentUserInterests(person.id, majorEventId);
  }

  @Mutation(() => EventInterest, { name: 'setCurrentUserInterest', nullable: true })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.eventInterest, [{ source: 'args', path: 'targetId' }])
  async setCurrentUserInterest(
    @Args('targetType', { type: () => InterestTargetType }) targetType: InterestTargetType,
    @Args('targetId', { type: () => String }) targetId: string,
    @Args('interested', { type: () => Boolean }) interested: boolean,
    @Context() context: GraphqlContext,
  ): Promise<EventInterest | null> {
    const actor = this.getUser(context);
    const person = await this.currentUser.requireCurrentPerson(context);
    const result = await this.interests.setCurrentUserInterest(person.id, { targetType, targetId }, interested, actor);
    await this.realtime.notifyPerson(person.id);
    return result;
  }

  @Query(() => [EventInterest], { name: 'eventInterests' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.Subscription.Read)
  eventInterests(
    @Args('targetType', { type: () => InterestTargetType }) targetType: InterestTargetType,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<EventInterest[]> {
    return this.interests.listAdminInterests(this.getUser(context), { targetType, targetId }, { query, skip, take });
  }

  @Query(() => Int, { name: 'eventInterestCount' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.Subscription.Read)
  eventInterestCount(
    @Args('targetType', { type: () => InterestTargetType }) targetType: InterestTargetType,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
  ): Promise<number> {
    return this.interests.countAdminInterests(this.getUser(context), { targetType, targetId }, query);
  }

  @Mutation(() => EventInterestConversion, { name: 'convertEventInterestToSubscription' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.Subscription.Create)
  convertEventInterestToSubscription(
    @Args('input', { type: () => ConvertEventInterestToSubscriptionInput })
    input: ConvertEventInterestToSubscriptionInput,
    @Context() context: GraphqlContext,
  ): Promise<EventInterestConversion> {
    return this.interests.convertInterestToSubscription(this.getUser(context), input);
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
