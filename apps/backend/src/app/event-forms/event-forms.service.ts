import { Injectable, MessageEvent } from '@nestjs/common';
import {
  EventForm as EventFormModel,
  EventFormDraft as EventFormDraftModel,
  EventFormInput,
  EventFormResults,
  EventFormResponse as EventFormResponseModel,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { Prisma } from '@prisma/client';
import { defer, Observable, switchMap } from 'rxjs';
import { AuditRecordOptions } from '../audit-log/audit-log.types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GraphqlContext } from '../current-user/selects';
import { EventFormEditorService } from './event-form-editor.service';
import { EventFormListingsService } from './event-form-listings.service';
import { EventFormPublicationWorkflowService } from './event-form-publication-workflow.service';
import { EventFormResponsesService } from './event-form-responses.service';
import { EventFormResultEventsService } from './event-form-result-events.service';
import { EventFormResultsAccessService } from './event-form-results-access.service';
import { NormalizedTarget, ResultViewer, SubscriptionFlowTargetScope, TargetInput } from './event-form-records';
import { AccessibleEventTargets } from './event-form-access';

@Injectable()
export class EventFormsService {
  constructor(
    private readonly listings: EventFormListingsService,
    private readonly editor: EventFormEditorService,
    private readonly publication: EventFormPublicationWorkflowService,
    private readonly responses: EventFormResponsesService,
    private readonly results: EventFormResultsAccessService,
    private readonly resultEvents: EventFormResultEventsService,
  ) {}

  async listAdminForms(
    user: AuthenticatedUser | undefined,
    filters: { query?: string | null; eventId?: string | null; majorEventId?: string | null } = {},
  ): Promise<EventFormModel[]> {
    return this.listings.listAdminForms(user, filters);
  }

  async getAdminForm(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormModel> {
    return this.listings.getAdminForm(user, formId);
  }

  async listFormsForTarget(input: TargetInput, options: { subscriptionFlowOnly?: boolean } = {}): Promise<EventFormModel[]> {
    return this.listings.listFormsForTarget(input, options);
  }

  async listCurrentUserForms(
    context: GraphqlContext,
    input: TargetInput,
    options: { subscriptionFlowOnly?: boolean } = {},
  ): Promise<EventFormModel[]> {
    return this.listings.listCurrentUserForms(context, input, options);
  }

  async saveForm(input: EventFormInput, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    return this.editor.saveForm(input, user);
  }

  async saveDraft(
    input: { sourceFormId: string; draftId?: string | null; input: EventFormInput },
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormDraftModel> {
    return this.editor.saveDraft(input, user);
  }

  async listDrafts(sourceFormId: string, user: AuthenticatedUser | undefined): Promise<EventFormDraftModel[]> {
    return this.editor.listDrafts(sourceFormId, user);
  }

  async publishForm(
    formId: string,
    scheduledPublishAt: Date | null | undefined,
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormModel> {
    return this.publication.publishForm(formId, scheduledPublishAt, user);
  }

  async publishLecturerForm(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormModel> {
    return this.publication.publishLecturerForm(context, formId, eventId);
  }

  async unpublishForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    return this.publication.unpublishForm(formId, user);
  }

  async deleteForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    return this.editor.deleteForm(formId, user);
  }

  async submitCurrentUserResponse(
    context: GraphqlContext,
    input: SubmitEventFormResponseInput,
  ): Promise<EventFormResponseModel> {
    return this.responses.submitCurrentUserResponse(context, input);
  }

  async submitSubscriptionFlowResponses(
    tx: Prisma.TransactionClient,
    personId: string,
    inputs: readonly SubmitEventFormResponseInput[] | null | undefined,
    scope: SubscriptionFlowTargetScope,
    actor?: AuditRecordOptions['actor'],
  ): Promise<string[]> {
    return this.responses.submitSubscriptionFlowResponses(tx, personId, inputs, scope, actor);
  }

  async archiveResponsesForSubscriptionScope(
    tx: Prisma.TransactionClient,
    personId: string,
    scope: SubscriptionFlowTargetScope,
    deletedAt = new Date(),
  ): Promise<string[]> {
    return this.responses.archiveResponsesForSubscriptionScope(tx, personId, scope, deletedAt);
  }

  async emitResultsDeltas(formIds: readonly string[]): Promise<void> {
    return this.resultEvents.emitResultsDeltas(formIds);
  }

  async getCurrentUserResponse(
    context: GraphqlContext,
    input: TargetInput & { formId: string; linkId?: string | null },
  ): Promise<EventFormResponseModel | null> {
    return this.responses.getCurrentUserResponse(context, input);
  }

  async getCurrentUserResults(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Promise<EventFormResults> {
    return this.results.getCurrentUserResults(context, input);
  }

  async getAdminResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    return this.results.getAdminResults(user, formId);
  }

  async getAdminExportResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    return this.results.getAdminExportResults(user, formId);
  }

  async getResults(
    formId: string,
    viewer: ResultViewer = 'admin',
    options: {
      target?: NormalizedTarget;
      accessibleTargets?: AccessibleEventTargets;
    } = {},
  ): Promise<EventFormResults> {
    return this.results.getResults(formId, viewer, options);
  }

  async getLecturerResults(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormResults> {
    return this.results.getLecturerResults(context, formId, eventId);
  }

  async listLecturerForms(
    context: GraphqlContext,
    eventId: string,
  ): Promise<EventFormModel[]> {
    return this.listings.listLecturerForms(context, eventId);
  }

  watchResults(formId: string): Observable<MessageEvent> {
    return this.resultEvents.watchResults(formId);
  }

  watchCurrentUserResults(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Observable<MessageEvent> {
    return defer(() => this.results.assertCurrentUserLiveResultsAccess(context, input)).pipe(
      switchMap(() => this.resultEvents.watchResults(input.formId)),
      switchMap(async (event) => {
        await this.results.assertCurrentUserLiveResultsAccess(context, input);
        return event;
      }),
    );
  }

  async exportResultsCsv(formId: string, viewer: ResultViewer = 'admin'): Promise<string> {
    return this.results.exportResultsCsv(formId, viewer);
  }

  async exportAdminResultsCsv(user: AuthenticatedUser | undefined, formId: string): Promise<string> {
    return this.results.exportAdminResultsCsv(user, formId);
  }

  async publishDueScheduledForms(): Promise<number> {
    return this.publication.publishDueScheduledForms();
  }

  async notifyDueAvailableLinks(): Promise<number> {
    return this.publication.notifyDueAvailableLinks();
  }
}
