import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { DeletionResult, Event, EventDraft, EventDraftSaveInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EventDraftsService } from './event-drafts.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => EventDraft)
export class EventDraftsResolver {
  constructor(private readonly drafts: EventDraftsService) {}

  @Query(() => [EventDraft], { name: 'eventDrafts' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.Event.Read)
  async eventDrafts(
    @Context() context: GraphqlContext,
    @Args('sourceEventId', { type: () => String, nullable: true }) sourceEventId?: string,
    @Args('sourceEventIds', { type: () => [String], nullable: true }) sourceEventIds?: string[],
  ): Promise<EventDraft[]> {
    return this.drafts.listEventDrafts(this.getUser(context), { sourceEventId, sourceEventIds });
  }

  @Mutation(() => EventDraft, { name: 'saveEventDraft' })
  @RequirePermissions(Permission.Event.Update)
  async saveEventDraft(
    @Args('input', { type: () => EventDraftSaveInput }) input: EventDraftSaveInput,
    @Context() context: GraphqlContext,
  ): Promise<EventDraft> {
    return this.drafts.saveEventDraft(input, this.getUser(context));
  }

  @Mutation(() => Event, { name: 'applyEventDraft' })
  @RequirePermissions(Permission.Event.Update)
  async applyEventDraft(
    @Args('draftId', { type: () => String }) draftId: string,
    @Context() context: GraphqlContext,
  ): Promise<Event> {
    return this.drafts.applyEventDraft(draftId, this.getUser(context));
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventDraft' })
  @RequirePermissions(Permission.Event.Update)
  async deleteEventDraft(
    @Args('draftId', { type: () => String }) draftId: string,
    @Context() context: GraphqlContext,
  ): Promise<DeletionResult> {
    return this.drafts.deleteEventDraft(draftId, this.getUser(context));
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventDraftsForEvent' })
  @RequirePermissions(Permission.Event.Update)
  async deleteEventDraftsForEvent(
    @Args('sourceEventId', { type: () => String }) sourceEventId: string,
    @Context() context: GraphqlContext,
  ): Promise<DeletionResult> {
    return this.drafts.deleteEventDraftsForEvent(sourceEventId, this.getUser(context));
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
