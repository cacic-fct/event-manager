import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  EventForm,
  EventFormDraft,
  EventFormDraftSaveInput,
  EventFormInput,
  EventFormResponse,
  EventFormResults,
  EventFormTargetType,
  PublishEventFormInput,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GraphqlContext } from '../current-user/selects';
import { EventFormsService } from './event-forms.service';

@Resolver(() => EventForm)
export class EventFormsResolver {
  constructor(private readonly forms: EventFormsService) {}

  @Query(() => [EventForm], { name: 'eventForms' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.EventForm.Read)
  eventForms(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<EventForm[]> {
    return this.forms.listAdminForms(this.getUser(context), { query, eventId, majorEventId });
  }

  @Query(() => EventForm, { name: 'eventForm' })
  @RequirePermissions(Permission.EventForm.Read)
  eventForm(@Args('formId', { type: () => String }) formId: string): Promise<EventForm> {
    return this.forms.getAdminForm(formId);
  }

  @Query(() => EventFormResults, { name: 'eventFormResults' })
  @RequirePermissions(Permission.EventForm.Results)
  eventFormResults(
    @Args('formId', { type: () => String }) formId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventFormResults> {
    return this.forms.getAdminResults(this.getUser(context), formId);
  }

  @Query(() => [EventFormDraft], { name: 'eventFormDrafts' })
  @RequirePermissions(Permission.EventForm.Update)
  eventFormDrafts(@Args('sourceFormId', { type: () => String }) sourceFormId: string): Promise<EventFormDraft[]> {
    return this.forms.listDrafts(sourceFormId);
  }

  @Query(() => [EventForm], { name: 'currentUserEventForms' })
  currentUserEventForms(
    @Context() context: GraphqlContext,
    @Args('targetType', { type: () => EventFormTargetType }) targetType: EventFormTargetType,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
    @Args('subscriptionFlowOnly', { type: () => Boolean, nullable: true }) subscriptionFlowOnly?: boolean,
  ): Promise<EventForm[]> {
    return this.forms.listCurrentUserForms(context, { targetType, eventId, majorEventId }, { subscriptionFlowOnly });
  }

  @Query(() => EventFormResponse, { name: 'currentUserEventFormResponse', nullable: true })
  currentUserEventFormResponse(
    @Context() context: GraphqlContext,
    @Args('formId', { type: () => String }) formId: string,
    @Args('targetType', { type: () => EventFormTargetType }) targetType: EventFormTargetType,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<EventFormResponse | null> {
    return this.forms.getCurrentUserResponse(context, { formId, targetType, eventId, majorEventId });
  }

  @Query(() => EventFormResults, { name: 'currentUserEventFormResults' })
  currentUserEventFormResults(
    @Context() context: GraphqlContext,
    @Args('formId', { type: () => String }) formId: string,
    @Args('targetType', { type: () => EventFormTargetType }) targetType: EventFormTargetType,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<EventFormResults> {
    return this.forms.getCurrentUserResults(context, { formId, targetType, eventId, majorEventId });
  }

  @Query(() => [EventForm], { name: 'lecturerEventForms' })
  lecturerEventForms(
    @Context() context: GraphqlContext,
    @Args('eventId', { type: () => String }) eventId: string,
  ): Promise<EventForm[]> {
    return this.forms.listLecturerForms(context, eventId);
  }

  @Query(() => EventFormResults, { name: 'lecturerEventFormResults' })
  lecturerEventFormResults(
    @Context() context: GraphqlContext,
    @Args('formId', { type: () => String }) formId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ): Promise<EventFormResults> {
    return this.forms.getLecturerResults(context, formId, eventId);
  }

  @Mutation(() => EventForm, { name: 'saveEventForm' })
  @AllowScopedCollectionPermissions()
  saveEventForm(
    @Args('input', { type: () => EventFormInput }) input: EventFormInput,
    @Context() context: GraphqlContext,
  ): Promise<EventForm> {
    return this.forms.saveForm(input, this.getUser(context));
  }

  @Mutation(() => EventFormDraft, { name: 'saveEventFormDraft' })
  saveEventFormDraft(
    @Args('input', { type: () => EventFormDraftSaveInput }) input: EventFormDraftSaveInput,
    @Context() context: GraphqlContext,
  ): Promise<EventFormDraft> {
    return this.forms.saveDraft(input, this.getUser(context));
  }

  @Mutation(() => EventForm, { name: 'publishEventForm' })
  @RequirePermissions(Permission.EventForm.Publish)
  publishEventForm(
    @Args('input', { type: () => PublishEventFormInput }) input: PublishEventFormInput,
    @Context() context: GraphqlContext,
  ): Promise<EventForm> {
    return this.forms.publishForm(input.formId, input.scheduledPublishAt, this.getUser(context));
  }

  @Mutation(() => EventForm, { name: 'publishLecturerEventForm' })
  publishLecturerEventForm(
    @Context() context: GraphqlContext,
    @Args('formId', { type: () => String }) formId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ): Promise<EventForm> {
    return this.forms.publishLecturerForm(context, formId, eventId);
  }

  @Mutation(() => EventForm, { name: 'unpublishEventForm' })
  @RequirePermissions(Permission.EventForm.Publish)
  unpublishEventForm(
    @Args('formId', { type: () => String }) formId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventForm> {
    return this.forms.unpublishForm(formId, this.getUser(context));
  }

  @Mutation(() => EventForm, { name: 'deleteEventForm' })
  @RequirePermissions(Permission.EventForm.Delete)
  deleteEventForm(
    @Args('formId', { type: () => String }) formId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventForm> {
    return this.forms.deleteForm(formId, this.getUser(context));
  }

  @Mutation(() => EventFormResponse, { name: 'submitCurrentUserEventFormResponse' })
  submitCurrentUserEventFormResponse(
    @Context() context: GraphqlContext,
    @Args('input', { type: () => SubmitEventFormResponseInput }) input: SubmitEventFormResponseInput,
  ): Promise<EventFormResponse> {
    return this.forms.submitCurrentUserResponse(context, input);
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
