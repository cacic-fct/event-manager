import { BadRequestException, ForbiddenException, MessageEvent, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventFormAudience,
  EventFormResponseMode,
  EventFormResponseSource,
  EventFormSigilo,
  EventFormTargetType,
  Prisma,
  PublicationState,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, of } from 'rxjs';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { GraphqlContext } from '../current-user/selects';
import { CurrentUserContextService } from '../current-user/context.service';
import { BackendFeatureFlagService } from '../feature-flags/backend-feature-flags';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventFormEditorService } from './event-form-editor.service';
import { EventFormListingsService } from './event-form-listings.service';
import { EventFormNotificationService } from './event-form-notification.service';
import { EventFormPublicationWorkflowService } from './event-form-publication-workflow.service';
import { EventFormResponsesService } from './event-form-responses.service';
import { EventFormResultEventsService } from './event-form-result-events.service';
import { EventFormResultsAccessService } from './event-form-results-access.service';
import { csvCell } from './event-form-results';
import { EventFormsService } from './event-forms.service';

describe('EventFormsService', () => {
  let service: EventFormsService;
  let prisma: ReturnType<typeof createPrisma>;
  let authorizationPolicy: ReturnType<typeof createAuthorizationPolicy>;
  let currentUserContext: ReturnType<typeof createCurrentUserContext>;
  let notifications: ReturnType<typeof createNotifications>;
  let featureFlags: { isEnabled: jest.Mock };
  let formNotifications: EventFormNotificationService;
  let auditLog: ReturnType<typeof createAuditLog>;

  const authenticatedUser = {
    sub: 'user-1',
    roleSet: new Set<string>(),
  } as AuthenticatedUser;
  const context = { req: { user: authenticatedUser } } as GraphqlContext;

  beforeEach(() => {
    prisma = createPrisma();
    authorizationPolicy = createAuthorizationPolicy();
    currentUserContext = createCurrentUserContext(authenticatedUser);
    notifications = createNotifications();
    featureFlags = { isEnabled: jest.fn().mockReturnValue(true) };
    auditLog = createAuditLog();
    formNotifications = new EventFormNotificationService(
      prisma as unknown as jest.Mocked<PrismaService>,
      notifications as unknown as jest.Mocked<NovuNotificationsService>,
      featureFlags as unknown as BackendFeatureFlagService,
    );
    const resultEvents = new EventFormResultEventsService();
    const listings = new EventFormListingsService(
      prisma as unknown as jest.Mocked<PrismaService>,
      authorizationPolicy as unknown as jest.Mocked<AuthorizationPolicyService>,
      currentUserContext as unknown as jest.Mocked<CurrentUserContextService>,
    );
    const editor = new EventFormEditorService(
      prisma as unknown as jest.Mocked<PrismaService>,
      authorizationPolicy as unknown as jest.Mocked<AuthorizationPolicyService>,
      auditLog as never,
    );
    const publication = new EventFormPublicationWorkflowService(
      prisma as unknown as jest.Mocked<PrismaService>,
      authorizationPolicy as unknown as jest.Mocked<AuthorizationPolicyService>,
      currentUserContext as unknown as jest.Mocked<CurrentUserContextService>,
      formNotifications,
      auditLog as never,
    );
    const responses = new EventFormResponsesService(
      prisma as unknown as jest.Mocked<PrismaService>,
      currentUserContext as unknown as jest.Mocked<CurrentUserContextService>,
      resultEvents,
      auditLog as never,
    );
    const results = new EventFormResultsAccessService(
      prisma as unknown as jest.Mocked<PrismaService>,
      authorizationPolicy as unknown as jest.Mocked<AuthorizationPolicyService>,
      currentUserContext as unknown as jest.Mocked<CurrentUserContextService>,
    );
    service = new EventFormsService(
      listings,
      editor,
      publication,
      responses,
      results,
      resultEvents,
    );
  });

  it('neutralizes CSV formulas after leading whitespace or control characters', () => {
    expect(csvCell('\t=IMPORTXML("https://example.com")')).toBe(
      '"\'\t=IMPORTXML(""https://example.com"")"',
    );
    expect(csvCell('\u0000+SUM(1,1)')).toBe('"\'\u0000+SUM(1,1)"');
    expect(csvCell('plain text')).toBe('"plain text"');
  });

  it('delegates facade operations to the underlying event-form services', async () => {
    const facade = createFacadeService();
    const targetInput = {
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    };
    const formInput = {
      name: 'Pesquisa',
      elementsJson: '[]',
      links: [],
    };
    const subscriptionScope = {
      majorEventId: 'major-1',
      selectedEventIds: new Set(['event-1']),
    };

    await expect(facade.service.listAdminForms(authenticatedUser)).resolves.toEqual(facade.forms);
    await expect(facade.service.getAdminForm(authenticatedUser, 'form-1')).resolves.toBe(facade.form);
    await expect(facade.service.listFormsForTarget(targetInput)).resolves.toEqual(facade.forms);
    await expect(
      facade.service.listCurrentUserForms(context, targetInput, { subscriptionFlowOnly: true }),
    ).resolves.toEqual(facade.forms);
    await expect(facade.service.saveForm(formInput as never, authenticatedUser)).resolves.toBe(facade.form);
    await expect(
      facade.service.saveDraft({ sourceFormId: 'form-1', input: formInput as never }, authenticatedUser),
    ).resolves.toBe(facade.draft);
    await expect(facade.service.listDrafts('form-1', authenticatedUser)).resolves.toEqual(facade.drafts);
    await expect(facade.service.unpublishForm('form-1', authenticatedUser)).resolves.toBe(facade.form);
    await expect(facade.service.deleteForm('form-1', authenticatedUser)).resolves.toBe(facade.form);
    await expect(
      facade.service.submitSubscriptionFlowResponses(prisma as never, 'person-1', null, subscriptionScope),
    ).resolves.toEqual(['form-1']);
    await expect(
      facade.service.archiveResponsesForSubscriptionScope(prisma as never, 'person-1', subscriptionScope),
    ).resolves.toEqual(['response-1']);
    await expect(facade.service.emitResultsDeltas(['form-1'])).resolves.toBeUndefined();
    await expect(
      facade.service.getCurrentUserResponse(context, { ...targetInput, formId: 'form-1' }),
    ).resolves.toBe(facade.response);
    await expect(facade.service.getAdminExportResults(authenticatedUser, 'form-1')).resolves.toBe(facade.resultsModel);
    await expect(facade.service.getResults('form-1')).resolves.toBe(facade.resultsModel);
    await expect(facade.service.getLecturerResults(context, 'form-1', 'event-1')).resolves.toBe(facade.resultsModel);
    await expect(facade.service.listLecturerForms(context, 'event-1')).resolves.toEqual(facade.forms);
    await expect(firstValueFrom(facade.service.watchResults('form-1'))).resolves.toBe(facade.message);
    await expect(facade.service.exportAdminResultsCsv(authenticatedUser, 'form-1')).resolves.toBe('csv');
    await expect(facade.service.publishDueScheduledForms()).resolves.toBe(2);
    await expect(facade.service.notifyDueAvailableLinks()).resolves.toBe(3);

    expect(facade.listings.listAdminForms).toHaveBeenCalledWith(authenticatedUser, {});
    expect(facade.listings.listFormsForTarget).toHaveBeenCalledWith(targetInput, {});
    expect(facade.responses.archiveResponsesForSubscriptionScope).toHaveBeenCalledWith(
      prisma,
      'person-1',
      subscriptionScope,
      expect.any(Date),
    );
    expect(facade.results.getResults).toHaveBeenCalledWith('form-1', 'admin', {});
  });

  it('checks live result access before subscribing and before each emitted result event', async () => {
    const facade = createFacadeService();
    const targetInput = {
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      formId: 'form-1',
    };

    await expect(firstValueFrom(facade.service.watchCurrentUserResults(context, targetInput))).resolves.toBe(
      facade.message,
    );

    expect(facade.results.assertCurrentUserLiveResultsAccess).toHaveBeenCalledTimes(2);
    expect(facade.results.assertCurrentUserLiveResultsAccess).toHaveBeenNthCalledWith(1, context, targetInput);
    expect(facade.results.assertCurrentUserLiveResultsAccess).toHaveBeenNthCalledWith(2, context, targetInput);
    expect(facade.resultEvents.watchResults).toHaveBeenCalledWith('form-1');
  });

  it('requires the event link opt-in before lecturers can publish manually', async () => {
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ allowLecturerManualPublish: false }));

    await expect(service.publishLecturerForm(context, 'form-1', 'event-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.eventForm.update).not.toHaveBeenCalled();
    expect(authorizationPolicy.assertPermissions).not.toHaveBeenCalledWith(
      expect.anything(),
      [Permission.EventForm.Publish],
      expect.anything(),
    );
  });

  it('lets linked lecturers publish when the event link opted in', async () => {
    const form = formRecord({ allowLecturerManualPublish: true, ownerEventId: 'event-1' });
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventForm.findFirst.mockResolvedValue(form);
    const published = {
      ...form,
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-28T12:00:00.000Z'),
    };
    prisma.eventForm.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventForm.findUniqueOrThrow.mockResolvedValue(published);

    const result = await service.publishLecturerForm(context, 'form-1', 'event-1');

    expect(result.publicationState).toBe(PublicationState.PUBLISHED);
    expect(prisma.eventForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'form-1', deletedAt: null }),
        data: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          publicationUpdatedBy: authenticatedUser.sub,
        }),
      }),
    );
  });

  it('rejects lecturer publication when the opted-in form is not exclusive to the event', async () => {
    const form = formRecord({
      allowLecturerManualPublish: true,
      ownerEventId: 'event-1',
      links: [
        linkRecord({ id: 'link-1', allowLecturerManualPublish: true }),
        linkRecord({ id: 'link-2', eventId: 'event-2', allowLecturerManualPublish: true }),
      ],
    });
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventForm.findFirst.mockResolvedValue(form);

    await expect(service.publishLecturerForm(context, 'form-1', 'event-1')).rejects.toThrow(
      'Publicação por ministrantes só está disponível para formulários exclusivos deste evento.',
    );

    expect(prisma.eventForm.updateMany).not.toHaveBeenCalled();
  });

  it('rejects lecturer publication when the form is not linked to the event', async () => {
    const form = formRecord({
      allowLecturerManualPublish: true,
      ownerEventId: 'event-1',
      links: [linkRecord({ id: 'link-1', eventId: 'event-2', allowLecturerManualPublish: true })],
    });
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventForm.findFirst.mockResolvedValue(form);

    await expect(service.publishLecturerForm(context, 'form-1', 'event-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.eventForm.updateMany).not.toHaveBeenCalled();
  });

  it('does not expose non-public results through the current-user public results path', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: false }));

    await expect(
      service.getCurrentUserResults(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.eventFormResponse.findMany).not.toHaveBeenCalled();
  });

  it('does not expose open public results before close when live updates are disabled', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: true, resultsLive: false }));

    await expect(
      service.getCurrentUserResults(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.eventFormResponse.findMany).not.toHaveBeenCalled();
  });

  it('shows live public results to eligible subscribers before the form closes', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        resultsPublic: true,
        resultsLive: true,
        sigilo: EventFormSigilo.PUBLIC,
        links: [
          linkRecord({ id: 'link-1', eventId: 'event-1' }),
          linkRecord({ id: 'link-2', eventId: 'event-2' }),
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventLecturer.findUnique.mockResolvedValue(null);
    prisma.eventFormResponse.findMany.mockResolvedValue([]);

    const results = await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(results.responseCount).toBe(0);
    expect(results.answersReleased).toBe(true);
    expect(results.form.links).toHaveLength(1);
    expect(results.form.links[0]).toMatchObject({
      id: 'link-1',
      eventId: 'event-1',
    });
    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith(context);
  });

  it('shows public results after the selected link closes even without live updates', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        resultsPublic: true,
        resultsLive: false,
        sigilo: EventFormSigilo.PUBLIC,
        links: [
          linkRecord({
            id: 'link-1',
            eventId: 'event-1',
            availableUntil: new Date('2026-06-01T12:00:00.000Z'),
          }),
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventLecturer.findUnique.mockResolvedValue(null);
    prisma.eventFormResponse.findMany.mockResolvedValue([]);

    const results = await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(results.responseCount).toBe(0);
    expect(results.answersReleased).toBe(true);
  });

  it('lets admins view results regardless of the public-results toggle', async () => {
    authorizationPolicy.assertPermissions.mockResolvedValue(undefined);
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: false }));
    prisma.eventFormResponse.findMany.mockResolvedValue([]);

    const results = await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(results.responseCount).toBe(0);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Results],
      { eventFormId: 'form-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Results],
      { eventId: 'event-1', majorEventId: undefined },
    );
    expect(currentUserContext.requireCurrentPerson).not.toHaveBeenCalled();
  });

  it('does not expose admin-level results without permission on the requested target', async () => {
    authorizationPolicy.assertPermissions
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: false }));

    await expect(
      service.getCurrentUserResults(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.eventFormResponse.findMany).not.toHaveBeenCalled();
  });

  it('creates a new response when the form allows multiple answers per target', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ responseMode: EventFormResponseMode.MULTIPLE_PER_TARGET }));
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventFormResponse.create.mockResolvedValue(responseRecord());

    await service.submitCurrentUserResponse(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      answersJson: '[]',
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.eventFormResponse.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventFormResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formId: 'form-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
        }),
      }),
    );
  });

  it('requires update permission on the new owner target when a form owner changes', async () => {
    const existing = formRecord({ ownerEventId: 'event-1' });
    const updated = formRecord({ ownerMajorEventId: 'major-2' });
    prisma.eventForm.findFirst.mockResolvedValue(existing);
    prisma.eventForm.update.mockResolvedValue(updated);
    prisma.eventForm.findUniqueOrThrow.mockResolvedValue(updated);
    prisma.eventFormLink.updateMany.mockResolvedValue({ count: 1 });

    await service.saveForm({
      id: 'form-1',
      name: 'Pesquisa',
      ownerMajorEventId: 'major-2',
      elementsJson: '[]',
      links: [],
    }, authenticatedUser);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Update],
      { eventId: 'event-1', majorEventId: undefined },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Update],
      { majorEventId: 'major-2' },
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM,
        entityId: 'form-1',
        operation: AuditLogOperation.UPDATE,
        actor: authenticatedUser,
      }),
      prisma,
    );
  });

  it('requires publish permission on every owner and linked target before publishing', async () => {
    const form = formRecord({
      ownerEventId: 'event-1',
      links: [
        linkRecord({ id: 'link-1', eventId: 'event-1' }),
        linkRecord({ id: 'link-2', targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-2' }),
      ],
    });
    prisma.eventForm.findFirst.mockResolvedValue(form);
    prisma.eventForm.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventForm.findUniqueOrThrow.mockResolvedValue({ ...form, publicationState: PublicationState.PUBLISHED });

    await service.publishForm('form-1', null, authenticatedUser);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Publish],
      { eventFormId: 'form-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Publish],
      { eventId: 'event-1', majorEventId: undefined },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Publish],
      { eventId: undefined, majorEventId: 'major-2' },
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM,
        entityId: 'form-1',
        operation: AuditLogOperation.UPDATE,
        actor: authenticatedUser,
      }),
      prisma,
    );
  });

  it('schedules future form publication and records an audit entry', async () => {
    const scheduledPublishAt = new Date('2100-07-01T12:00:00.000Z');
    const form = formRecord({ ownerEventId: 'event-1' });
    const scheduled = {
      ...form,
      publicationState: PublicationState.SCHEDULED,
      scheduledPublishAt,
      publicationScheduledBy: authenticatedUser.sub,
      publicationUpdatedBy: authenticatedUser.sub,
      unpublishedAt: null,
    };
    prisma.eventForm.findFirst.mockResolvedValue(form);
    prisma.eventForm.update.mockResolvedValue(scheduled);

    const result = await service.publishForm('form-1', scheduledPublishAt, authenticatedUser);

    expect(result.publicationState).toBe(PublicationState.SCHEDULED);
    expect(prisma.eventForm.update).toHaveBeenCalledWith({
      where: { id: 'form-1' },
      data: {
        publicationState: PublicationState.SCHEDULED,
        scheduledPublishAt,
        publicationScheduledBy: authenticatedUser.sub,
        publicationUpdatedBy: authenticatedUser.sub,
        unpublishedAt: null,
      },
      include: expect.any(Object),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM,
        entityId: 'form-1',
        operation: AuditLogOperation.UPDATE,
        actor: authenticatedUser,
      }),
      prisma,
    );
    expect(prisma.eventForm.updateMany).not.toHaveBeenCalled();
  });

  it('unpublishes forms after publish permission and linked target checks', async () => {
    const form = formRecord({
      ownerMajorEventId: 'major-1',
      links: [
        linkRecord({ id: 'link-1', targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-1' }),
      ],
    });
    const unpublished = {
      ...form,
      publicationState: PublicationState.UNPUBLISHED,
      scheduledPublishAt: null,
      unpublishedAt: new Date('2026-07-01T12:00:00.000Z'),
      publicationUpdatedBy: authenticatedUser.sub,
    };
    prisma.eventForm.findFirst.mockResolvedValue(form);
    prisma.eventForm.update.mockResolvedValue(unpublished);

    const result = await service.unpublishForm('form-1', authenticatedUser);

    expect(result.publicationState).toBe(PublicationState.UNPUBLISHED);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Publish],
      { eventFormId: 'form-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Publish],
      { majorEventId: 'major-1' },
    );
    expect(prisma.eventForm.update).toHaveBeenCalledWith({
      where: { id: 'form-1' },
      data: expect.objectContaining({
        publicationState: PublicationState.UNPUBLISHED,
        scheduledPublishAt: null,
        publicationUpdatedBy: authenticatedUser.sub,
      }),
      include: expect.any(Object),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM,
        entityId: 'form-1',
        operation: AuditLogOperation.UPDATE,
        actor: authenticatedUser,
      }),
      prisma,
    );
  });

  it('runs scheduled publication and available-link notification sweeps', async () => {
    prisma.eventForm.findMany.mockResolvedValue([]);

    await expect(service.publishDueScheduledForms()).resolves.toBe(0);
    await expect(service.notifyDueAvailableLinks()).resolves.toBe(0);

    expect(prisma.eventForm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationState: PublicationState.SCHEDULED,
        }),
        take: 100,
      }),
    );
    expect(prisma.eventForm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
        }),
        include: expect.any(Object),
        take: 100,
      }),
    );
  });

  it('blocks editing an existing response unless the form allows it', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ responseMode: EventFormResponseMode.ONE_PER_TARGET }));
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventFormResponse.findFirst.mockResolvedValue(responseRecord());

    await expect(
      service.submitCurrentUserResponse(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        answersJson: '[]',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.update).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM_RESPONSE,
        operation: AuditLogOperation.UPDATE,
      }),
      prisma,
    );
  });

  it('updates one response per whole form and stores the submitted target', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({ responseMode: EventFormResponseMode.SINGLE_PER_FORM, allowResponseEdits: true }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventFormResponse.findFirst.mockResolvedValue({ id: 'response-1' });
    prisma.eventFormResponse.update.mockResolvedValue(responseRecord());

    await service.submitCurrentUserResponse(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      answersJson: '[]',
    });

    expect(prisma.eventFormResponse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          personId: 'person-1',
        },
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.eventFormResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'response-1' },
        data: expect.objectContaining({
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM_RESPONSE,
        entityId: 'response-1',
        operation: AuditLogOperation.UPDATE,
        actor: authenticatedUser,
      }),
      prisma,
    );
  });

  it('updates one-per-target responses even when the active link changed', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        responseMode: EventFormResponseMode.ONE_PER_TARGET,
        allowResponseEdits: true,
        links: [linkRecord({ id: 'link-2' })],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventFormResponse.findFirst.mockResolvedValue({ id: 'response-1' });
    prisma.eventFormResponse.update.mockResolvedValue(responseRecord({ linkId: 'link-2' }));

    await service.submitCurrentUserResponse(context, {
      formId: 'form-1',
      linkId: 'link-2',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      answersJson: '[]',
    });

    expect(prisma.eventFormResponse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          personId: 'person-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
        },
      }),
    );
    expect(prisma.eventFormResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'response-1' },
        data: expect.objectContaining({
          linkId: 'link-2',
        }),
      }),
    );
  });

  it('returns archived current-user responses for subscription-flow autofill without restoring them', async () => {
    const archivedAt = new Date('2026-07-06T12:00:00.000Z');
    prisma.eventForm.findFirst.mockResolvedValue(formRecord());
    prisma.eventFormResponse.findFirst.mockResolvedValue(
      responseRecord({
        answers: [{ elementId: 'shirt-size', value: 'm' }],
        deletedAt: archivedAt,
      }),
    );

    const response = await service.getCurrentUserResponse(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(response).toMatchObject({
      id: 'response-1',
      answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'm' }]),
    });
    expect(prisma.eventFormResponse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          personId: 'person-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
        },
      }),
    );
    expect(prisma.eventFormResponse.updateMany).not.toHaveBeenCalled();
    expect(prisma.eventFormResponse.update).not.toHaveBeenCalled();
  });

  it('blocks crafted subscription-flow edits to archived non-editable responses', async () => {
    const archivedAt = new Date('2026-07-06T12:00:00.000Z');
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventFormResponse.findFirst.mockResolvedValue(responseRecord({ deletedAt: archivedAt }));

    await expect(
      service.submitSubscriptionFlowResponses(
        prisma as never,
        'person-1',
        [
          {
            formId: 'form-1',
            linkId: 'link-1',
            targetType: EventFormTargetType.EVENT,
            eventId: 'event-1',
            answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'L' }]),
          },
        ],
        {
          majorEventId: null,
          selectedEventIds: new Set(['event-1']),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.update).not.toHaveBeenCalled();
    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_FORM_RESPONSE,
        operation: AuditLogOperation.UPDATE,
      }),
      prisma,
    );
  });

  it('restores archived subscription-flow responses without submitted edits during resubscribe', async () => {
    prisma.eventFormResponse.findMany.mockResolvedValue([{ id: 'response-1', formId: 'form-1' }]);
    prisma.eventFormLink.findMany.mockResolvedValue([]);

    await expect(
      service.submitSubscriptionFlowResponses(prisma as never, 'person-1', [], {
        majorEventId: null,
        selectedEventIds: new Set(['event-1']),
      }),
    ).resolves.toEqual(['form-1']);

    expect(prisma.eventFormResponse.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['response-1'],
          },
        },
        data: {
          deletedAt: null,
        },
      }),
    );
    expect(prisma.eventFormResponse.update).not.toHaveBeenCalled();
    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
  });

  it('archives only subscription-flow responses when a subscription target is removed', async () => {
    const deletedAt = new Date('2026-07-06T12:00:00.000Z');
    prisma.eventFormResponse.findMany.mockResolvedValue([{ id: 'response-1', formId: 'form-1' }]);

    await expect(
      service.archiveResponsesForSubscriptionScope(
        prisma as never,
        'person-1',
        {
          majorEventId: null,
          selectedEventIds: new Set(['event-1']),
        },
        deletedAt,
      ),
    ).resolves.toEqual(['form-1']);

    expect(prisma.eventFormResponse.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        source: EventFormResponseSource.SUBSCRIPTION_FLOW,
        OR: [
          {
            targetType: EventFormTargetType.EVENT,
            eventId: {
              in: ['event-1'],
            },
          },
        ],
      },
      select: {
        id: true,
        formId: true,
      },
    });
    expect(prisma.eventFormResponse.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['response-1'],
        },
      },
      data: {
        deletedAt,
      },
    });
  });

  it('does not let archived responses satisfy required subscription-flow forms before restoration', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        enforceRequiredAnswers: true,
        form: {
          id: 'form-1',
          name: 'Pesquisa de camiseta',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
          elements: [],
        },
      },
    ]);
    prisma.eventFormResponse.findMany.mockResolvedValue([]);
    prisma.eventFormResponse.findFirst.mockResolvedValue(null);

    await expect(
      service.submitSubscriptionFlowResponses(prisma as never, 'person-1', [], {
        majorEventId: null,
        selectedEventIds: new Set(['event-1']),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          personId: 'person-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          deletedAt: null,
        },
      }),
    );
  });

  it('includes owned forms when listing admin forms for a target filter', async () => {
    prisma.eventForm.findMany.mockResolvedValue([]);

    await service.listAdminForms(authenticatedUser, { eventId: 'event-1', majorEventId: 'major-1' });

    expect(prisma.eventForm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { ownerEventId: 'event-1' },
                { links: { some: { eventId: 'event-1', deletedAt: null } } },
              ],
            },
            {
              OR: [
                { ownerMajorEventId: 'major-1' },
                { ownerEvent: { majorEventId: 'major-1' } },
                { links: { some: { majorEventId: 'major-1', deletedAt: null } } },
                { links: { some: { event: { majorEventId: 'major-1' }, deletedAt: null } } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('redacts response counts from current-user form listings until results are released', async () => {
    prisma.eventForm.findMany.mockResolvedValue([formRecord({ responseCount: 7, linkResponseCount: 3 })]);
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    const forms = await service.listCurrentUserForms(context, {
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(forms).toHaveLength(1);
    expect(forms[0].responseCount).toBe(0);
    expect(forms[0].links[0].responseCount).toBe(0);
  });

  it('lists released public results for attendees who cannot answer the form audience', async () => {
    prisma.eventForm.findMany.mockResolvedValue([
      formRecord({
        resultsPublic: true,
        responseCount: 7,
        linkResponseCount: 3,
        links: [
          linkRecord({
            audience: EventFormAudience.SUBSCRIBERS,
            availableUntil: new Date('2020-06-01T12:00:00.000Z'),
            responseCount: 3,
          }),
        ],
      }),
    ]);
    prisma.eventSubscription.findFirst.mockResolvedValue(null);
    prisma.eventAttendance.findFirst.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventLecturer.findUnique.mockResolvedValue(null);

    const forms = await service.listCurrentUserForms(context, {
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(forms).toHaveLength(1);
    expect(forms[0].responseCount).toBe(3);
    expect(forms[0].links[0].responseCount).toBe(3);
  });

  it('only exposes the matching target link in current-user form listings', async () => {
    prisma.eventForm.findMany.mockResolvedValue([
      formRecord({
        resultsPublic: true,
        links: [
          linkRecord({ id: 'link-1', eventId: 'event-1' }),
          linkRecord({ id: 'link-2', eventId: 'event-2' }),
        ],
      }),
    ]);
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    const forms = await service.listCurrentUserForms(context, {
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(forms).toHaveLength(1);
    expect(forms[0].links).toHaveLength(1);
    expect(forms[0].links[0]).toMatchObject({
      id: 'link-1',
      eventId: 'event-1',
    });
  });

  it('rejects submitted choice values that are not present in the form options', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        elements: [
          {
            id: 'shirt-size',
            type: 'singleChoice',
            title: 'Tamanho da camiseta',
            required: true,
            options: [{ id: 'm', label: 'M' }],
          },
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    await expect(
      service.submitCurrentUserResponse(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'xl' }]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
  });

  it('rejects impossible calendar dates in submitted answers', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        elements: [
          {
            id: 'birth-date',
            type: 'date',
            title: 'Data de nascimento',
            required: true,
            options: [],
          },
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    await expect(
      service.submitCurrentUserResponse(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'birth-date', value: '2026-02-31' }]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
  });

  it('requires every row in a required grid answer', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        elements: [
          {
            id: 'availability',
            type: 'singleSelectionGrid',
            title: 'Disponibilidade',
            required: true,
            options: [],
            settings: {
              grid: {
                rows: [
                  { id: 'mon', label: 'Segunda' },
                  { id: 'tue', label: 'Terça' },
                ],
                columns: [
                  { id: 'yes', label: 'Sim' },
                  { id: 'no', label: 'Não' },
                ],
              },
            },
          },
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    await expect(
      service.submitCurrentUserResponse(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'availability', value: { mon: 'yes' } }]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
  });

  it('requires invitees for required scheduling answers when configured', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        elements: [
          {
            id: 'meeting',
            type: 'scheduling',
            title: 'Reunião',
            required: true,
            options: [],
            settings: {
              scheduling: {
                timezone: 'America/Sao_Paulo',
                durationMinutes: 30,
                slotIntervalMinutes: 30,
                bufferBeforeMinutes: 0,
                bufferAfterMinutes: 0,
                inviteeMode: 'required',
                maxInvitees: 2,
                availability: [{ id: 'window-1', date: '2026-07-01', startTime: '09:00', endTime: '10:00' }],
              },
            },
          },
        ],
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);

    await expect(
      service.submitCurrentUserResponse(context, {
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'meeting', value: { slotId: 'window-1:09:00-09:30', invitees: [] } }]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventFormResponse.create).not.toHaveBeenCalled();
  });

  it('rejects subscription completion when required subscription-flow forms are missing', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        enforceRequiredAnswers: true,
        form: {
          id: 'form-1',
          name: 'Pesquisa de camiseta',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
          elements: [],
        },
      },
    ]);
    prisma.eventFormResponse.findFirst.mockResolvedValue(null);

    await expect(
      service.submitSubscriptionFlowResponses(prisma as never, 'person-1', [], {
        majorEventId: 'major-1',
        selectedEventIds: new Set(['event-1']),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects subscription completion when an existing required form response is incomplete', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        formId: 'form-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        enforceRequiredAnswers: true,
        form: {
          id: 'form-1',
          name: 'Pesquisa de camiseta',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
          elements: [
            {
              id: 'shirt-size',
              type: 'singleChoice',
              title: 'Tamanho da camiseta',
              required: true,
              options: [{ id: 'm', label: 'M' }],
            },
          ],
        },
      },
    ]);
    prisma.eventFormResponse.findFirst.mockResolvedValue({ id: 'response-1', answers: [] });

    await expect(
      service.submitSubscriptionFlowResponses(prisma as never, 'person-1', [], {
        majorEventId: 'major-1',
        selectedEventIds: new Set(['event-1']),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not require attendee-only forms in subscription flow completion', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([]);

    await expect(
      service.submitSubscriptionFlowResponses(prisma as never, 'person-1', [], {
        majorEventId: 'major-1',
        selectedEventIds: new Set(['event-1']),
      }),
    ).resolves.toEqual([]);

    expect(prisma.eventFormLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          audience: {
            not: EventFormAudience.ATTENDEES,
          },
        }),
      }),
    );
  });

  it('returns redacted identities for partially secret public results', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({ resultsPublic: true, resultsLive: true, sigilo: EventFormSigilo.PARTIALLY_SECRET }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventLecturer.findUnique.mockResolvedValue(null);
    prisma.eventFormResponse.findMany.mockResolvedValue([responseRecord({ answers: [{ elementId: 'shirt-size', value: 'm' }] })]);

    const results = await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(results.answersReleased).toBe(false);
    expect(results.responses).toHaveLength(1);
    expect(results.responses[0]).toMatchObject({
      personId: 'person-1',
      respondentName: 'Ana Silva',
      respondentEmail: 'ana@example.com',
      answersJson: '[]',
    });
  });

  it('scopes single-form public results to the requested target', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        resultsPublic: true,
        resultsLive: true,
        sigilo: EventFormSigilo.PUBLIC,
        responseMode: EventFormResponseMode.SINGLE_PER_FORM,
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventLecturer.findUnique.mockResolvedValue(null);
    prisma.eventFormResponse.findMany.mockResolvedValue([
      responseRecord({ targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-1' }),
    ]);

    await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(prisma.eventFormResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          deletedAt: null,
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
        },
      }),
    );
  });

  it('limits single-form admin results to accessible targets', async () => {
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(),
      eventGroupIds: new Set(),
    });
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        responseMode: EventFormResponseMode.SINGLE_PER_FORM,
        links: [
          linkRecord({ id: 'link-1', targetType: EventFormTargetType.EVENT, eventId: 'event-2', majorEventId: null }),
        ],
      }),
    );
    prisma.eventFormResponse.findMany.mockResolvedValue([]);

    await service.getAdminResults(authenticatedUser, 'form-1');

    expect(prisma.eventFormResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
          deletedAt: null,
          id: { in: [] },
        },
      }),
    );
  });

  it('claims form notification links before sending', async () => {
    const form = formRecord({
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          notifyOnPublish: true,
        }),
      ],
    });
    prisma.eventSubscription.findMany.mockResolvedValue([{ person: { id: 'person-2', name: 'Bia', email: 'bia@example.com' } }]);
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    prisma.eventFormLink.updateMany.mockResolvedValue({ count: 1 });
    notifications.notifyEventFormAvailable.mockResolvedValue(true);

    const notifiedCount = await formNotifications.notifyEligiblePeople(form);

    expect(notifiedCount).toBe(1);
    expect(prisma.eventFormLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'link-1',
          deletedAt: null,
          lastNotifiedAt: null,
        },
        data: {
          lastNotifiedAt: expect.any(Date),
        },
      }),
    );
    expect(notifications.notifyEventFormAvailable).toHaveBeenCalled();
  });

  it('lists unanswered required subscription forms for active subscriptions only', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 4,
        form: {
          id: 'form-1',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
        },
      },
    ]);
    prisma.eventFormResponse.findMany.mockResolvedValue([]);

    await expect(service.listCurrentUserRequiredSubscriptionFormInterruptions(context)).resolves.toEqual([
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 4,
      },
    ]);
    expect(prisma.eventFormLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          form: expect.objectContaining({ publicationState: PublicationState.PUBLISHED }),
          OR: expect.arrayContaining([
            expect.objectContaining({ event: expect.objectContaining({ deletedAt: null, endDate: expect.any(Object) }) }),
            expect.objectContaining({ majorEvent: expect.objectContaining({ deletedAt: null, endDate: expect.any(Object) }) }),
          ]),
        }),
      }),
    );
  });

  it('does not interrupt a subscriber who already answered a required form', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 0,
        form: {
          id: 'form-1',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
        },
      },
    ]);
    prisma.eventFormResponse.findMany.mockResolvedValue([
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
      },
    ]);

    await expect(service.listCurrentUserRequiredSubscriptionFormInterruptions(context)).resolves.toEqual([]);
  });

  it('checks multiple-per-target responses against their exact form link', async () => {
    prisma.eventFormLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 0,
        form: { id: 'form-1', responseMode: EventFormResponseMode.MULTIPLE_PER_TARGET },
      },
    ]);
    prisma.eventFormResponse.findMany.mockResolvedValue([
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
        majorEventId: null,
      },
    ]);

    await expect(service.listCurrentUserRequiredSubscriptionFormInterruptions(context)).resolves.toEqual([]);

    expect(prisma.eventFormResponse.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          {
            formId: 'form-1',
            personId: 'person-1',
            linkId: 'link-1',
          },
        ],
      },
      select: {
        formId: true,
        linkId: true,
        targetType: true,
        eventId: true,
        majorEventId: true,
      },
    });
  });

  it('counts previous subscribers before a required form is saved', async () => {
    prisma.eventSubscription.count.mockResolvedValue(3);

    await expect(
      service.countPreviousSubscribers(authenticatedUser, {
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
      }),
    ).resolves.toBe(3);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Update],
      { eventId: 'event-1', majorEventId: undefined },
    );
  });

  it('counts previous subscribers only when the form link belongs to the authorized target', async () => {
    prisma.eventFormLink.findFirst.mockResolvedValue(null);

    await expect(
      service.countPreviousSubscribers(authenticatedUser, {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: EventFormTargetType.EVENT,
        eventId: 'event-1',
      }),
    ).resolves.toBe(0);

    expect(prisma.eventFormLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'link-1', formId: 'form-1', eventId: 'event-1' }),
      }),
    );
  });

  it('notifies only previous subscribers who still need a required subscription form', async () => {
    const form = formRecord({
      responseMode: EventFormResponseMode.ONE_PER_TARGET,
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          audience: EventFormAudience.SUBSCRIBERS,
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          notifyOnPublish: true,
        }),
      ],
    });
    prisma.eventSubscription.findMany.mockResolvedValue([
      { person: { id: 'person-1', name: 'Ana Silva', email: 'ana@example.com' } },
      { person: { id: 'person-2', name: 'Bia Lima', email: 'bia@example.com' } },
    ]);
    prisma.eventFormResponse.findMany.mockResolvedValue([{ personId: 'person-1' }]);
    prisma.eventFormLink.updateMany.mockResolvedValue({ count: 1 });
    notifications.notifyEventFormAvailable.mockResolvedValue(true);

    await expect(formNotifications.notifyEligiblePeople(form)).resolves.toBe(1);
    expect(notifications.notifyEventFormAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredSubscriptionForm: true,
        recipients: [expect.objectContaining({ subscriberId: 'person-2' })],
      }),
    );
  });

  it('does not notify required subscription forms while their global kill switch is disabled', async () => {
    const form = formRecord({
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          audience: EventFormAudience.SUBSCRIBERS,
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          notifyOnPublish: true,
        }),
      ],
    });
    featureFlags.isEnabled.mockReturnValue(false);

    await expect(formNotifications.notifyEligiblePeople(form)).resolves.toBe(0);

    expect(notifications.notifyEventFormAvailable).not.toHaveBeenCalled();
    expect(prisma.eventFormLink.updateMany).not.toHaveBeenCalled();
  });

  it('does not send form notifications when another worker already claimed the link', async () => {
    const form = formRecord({
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          notifyOnPublish: true,
        }),
      ],
    });
    prisma.eventSubscription.findMany.mockResolvedValue([{ person: { id: 'person-2', name: 'Bia', email: 'bia@example.com' } }]);
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    prisma.eventFormLink.updateMany.mockResolvedValue({ count: 0 });

    const notifiedCount = await formNotifications.notifyEligiblePeople(form);

    expect(notifiedCount).toBe(0);
    expect(notifications.notifyEventFormAvailable).not.toHaveBeenCalled();
  });

  it('rolls back claimed form notifications when the provider throws', async () => {
    const form = formRecord({
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          notifyOnPublish: true,
        }),
      ],
    });
    prisma.eventSubscription.findMany.mockResolvedValue([{ person: { id: 'person-2', name: 'Bia', email: 'bia@example.com' } }]);
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    prisma.eventFormLink.updateMany.mockResolvedValue({ count: 1 });
    notifications.notifyEventFormAvailable.mockRejectedValue(new Error('Novu unavailable'));

    const notifiedCount = await formNotifications.notifyEligiblePeople(form);

    expect(notifiedCount).toBe(0);
    expect(prisma.eventFormLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'link-1',
          lastNotifiedAt: expect.any(Date),
        },
        data: {
          lastNotifiedAt: null,
        },
      }),
    );
  });

  it('neutralizes spreadsheet formulas in exported CSV cells', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        sigilo: EventFormSigilo.PUBLIC,
        elements: [
          {
            id: 'question-1',
            type: 'shortText',
            title: '=Pergunta',
            required: false,
            options: [],
          },
        ],
      }),
    );
    prisma.eventFormResponse.findMany.mockResolvedValue([
      responseRecord({
        answers: [{ elementId: 'question-1', value: '=IMPORTXML("https://example.com")' }],
      }),
    ]);

    await expect(service.exportResultsCsv('form-1')).resolves.toContain(`"'=IMPORTXML(""https://example.com"")"`);
  });
});

function createPrisma() {
  const client = {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
    $executeRaw: jest.fn(),
    eventForm: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    eventFormResponse: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    eventLecturer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    eventSubscription: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    majorEventSubscription: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    eventAttendance: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    eventFormLink: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  return client;
}

function createAuthorizationPolicy() {
  return {
    assertPermissions: jest.fn(),
    accessibleEventTargets: jest.fn(),
  };
}

function createCurrentUserContext(user: AuthenticatedUser) {
  return {
    getAuthenticatedUser: jest.fn(() => user),
    resolveCurrentUserContext: jest.fn(async () => ({
      person: {
        id: 'person-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
        userId: user.sub,
      },
    })),
    requireCurrentPerson: jest.fn(async () => ({
      id: 'person-1',
      name: 'Ana Silva',
      email: 'ana@example.com',
      userId: user.sub,
    })),
  };
}

function createNotifications() {
  return {
    notifyEventFormAvailable: jest.fn(),
    mapPersonToRecipient: jest.fn((person: { id: string; name: string | null; email: string | null }) => ({
      subscriberId: person.id,
      email: person.email,
      firstName: person.name ?? undefined,
    })),
  };
}

function createAuditLog() {
  return {
    record: jest.fn(),
  };
}

function createFacadeService() {
  const form = formRecord();
  const forms = [form];
  const drafts = [{ id: 'draft-1' }];
  const draft = drafts[0];
  const response = responseRecord();
  const resultsModel = { form, responses: [], responseCount: 0 };
  const message = { data: { formId: 'form-1', responseCount: 1 } } as MessageEvent;
  const listings = {
    listAdminForms: jest.fn().mockResolvedValue(forms),
    getAdminForm: jest.fn().mockResolvedValue(form),
    listFormsForTarget: jest.fn().mockResolvedValue(forms),
    listCurrentUserForms: jest.fn().mockResolvedValue(forms),
    listLecturerForms: jest.fn().mockResolvedValue(forms),
  };
  const editor = {
    saveForm: jest.fn().mockResolvedValue(form),
    saveDraft: jest.fn().mockResolvedValue(draft),
    listDrafts: jest.fn().mockResolvedValue(drafts),
    deleteForm: jest.fn().mockResolvedValue(form),
  };
  const publication = {
    publishForm: jest.fn().mockResolvedValue(form),
    publishLecturerForm: jest.fn().mockResolvedValue(form),
    unpublishForm: jest.fn().mockResolvedValue(form),
    publishDueScheduledForms: jest.fn().mockResolvedValue(2),
    notifyDueAvailableLinks: jest.fn().mockResolvedValue(3),
  };
  const responses = {
    submitCurrentUserResponse: jest.fn().mockResolvedValue(response),
    submitSubscriptionFlowResponses: jest.fn().mockResolvedValue(['form-1']),
    archiveResponsesForSubscriptionScope: jest.fn().mockResolvedValue(['response-1']),
    getCurrentUserResponse: jest.fn().mockResolvedValue(response),
  };
  const results = {
    getCurrentUserResults: jest.fn().mockResolvedValue(resultsModel),
    getAdminResults: jest.fn().mockResolvedValue(resultsModel),
    getAdminExportResults: jest.fn().mockResolvedValue(resultsModel),
    getResults: jest.fn().mockResolvedValue(resultsModel),
    getLecturerResults: jest.fn().mockResolvedValue(resultsModel),
    assertCurrentUserLiveResultsAccess: jest.fn().mockResolvedValue(undefined),
    exportResultsCsv: jest.fn().mockResolvedValue('csv'),
    exportAdminResultsCsv: jest.fn().mockResolvedValue('csv'),
  };
  const resultEvents = {
    emitResultsDeltas: jest.fn().mockResolvedValue(undefined),
    watchResults: jest.fn(() => of(message)),
  };

  return {
    service: new EventFormsService(
      listings as unknown as EventFormListingsService,
      editor as unknown as EventFormEditorService,
      publication as unknown as EventFormPublicationWorkflowService,
      responses as unknown as EventFormResponsesService,
      results as unknown as EventFormResultsAccessService,
      resultEvents as unknown as EventFormResultEventsService,
    ),
    listings,
    editor,
    publication,
    responses,
    results,
    resultEvents,
    form,
    forms,
    draft,
    drafts,
    response,
    resultsModel,
    message,
  };
}

function formRecord(
  options: {
    allowLecturerManualPublish?: boolean;
    insertInSubscriptionFlow?: boolean;
    requiredInSubscriptionFlow?: boolean;
    ownerEventId?: string | null;
    ownerMajorEventId?: string | null;
    resultsPublic?: boolean;
    resultsLive?: boolean;
    sigilo?: EventFormSigilo;
    responseMode?: EventFormResponseMode;
    allowResponseEdits?: boolean;
    responseCount?: number;
    linkResponseCount?: number;
    elements?: unknown[];
    links?: ReturnType<typeof linkRecord>[];
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  const link = linkRecord({
    allowLecturerManualPublish: options.allowLecturerManualPublish,
    insertInSubscriptionFlow: options.insertInSubscriptionFlow,
    requiredInSubscriptionFlow: options.requiredInSubscriptionFlow,
    responseCount: options.linkResponseCount,
  });

  return {
    id: 'form-1',
    name: 'Pesquisa de camiseta',
    description: null,
    ownerEventId: options.ownerEventId ?? null,
    ownerMajorEventId: options.ownerMajorEventId ?? null,
    ownerEvent: options.ownerEventId
      ? {
          id: options.ownerEventId,
          name: 'Oficina de Angular',
          emoji: 'computer',
        }
      : null,
    ownerMajorEvent: options.ownerMajorEventId
      ? {
          id: options.ownerMajorEventId,
          name: 'Semana da Computação',
          emoji: 'calendar',
        }
      : null,
    elements: options.elements ?? [],
    sigilo: options.sigilo ?? EventFormSigilo.SECRET,
    responseMode: options.responseMode ?? EventFormResponseMode.ONE_PER_TARGET,
    resultsPublic: options.resultsPublic ?? false,
    resultsLive: options.resultsLive ?? false,
    allowResponseEdits: options.allowResponseEdits ?? false,
    publicationState: PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: now,
    unpublishedAt: null,
    publicationScheduledBy: null,
    publicationUpdatedBy: null,
    links: options.links ?? [link],
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    _count: {
      responses: options.responseCount ?? 0,
    },
  };
}

function linkRecord(
  options: {
    id?: string;
    targetType?: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
    audience?: EventFormAudience;
    insertInSubscriptionFlow?: boolean;
    requiredInSubscriptionFlow?: boolean;
    notifyOnPublish?: boolean;
    allowLecturerManualPublish?: boolean;
    availableFrom?: Date | null;
    availableUntil?: Date | null;
    responseCount?: number;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  const futureTargetEndDate = new Date('2100-07-01T12:00:00.000Z');
  const targetType = options.targetType ?? EventFormTargetType.EVENT;
  const eventId = options.eventId === undefined ? (targetType === EventFormTargetType.EVENT ? 'event-1' : null) : options.eventId;
  const majorEventId = options.majorEventId === undefined ? (targetType === EventFormTargetType.MAJOR_EVENT ? 'major-1' : null) : options.majorEventId;
  return {
    id: options.id ?? 'link-1',
    formId: 'form-1',
    targetType,
    eventId,
    majorEventId,
    event: eventId
      ? {
          id: eventId,
          name: 'Oficina de Angular',
          emoji: 'computer',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
          endDate: futureTargetEndDate,
        }
      : null,
    majorEvent: majorEventId
      ? {
          id: majorEventId,
          name: 'Semana da Computação',
          emoji: 'calendar',
          endDate: futureTargetEndDate,
        }
      : null,
    audience: options.audience ?? EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: options.insertInSubscriptionFlow ?? false,
    requiredInSubscriptionFlow: options.requiredInSubscriptionFlow ?? false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: options.availableFrom === undefined ? null : options.availableFrom,
    availableUntil: options.availableUntil === undefined ? null : options.availableUntil,
    notifyOnPublish: options.notifyOnPublish ?? false,
    allowLecturerManualPublish: options.allowLecturerManualPublish ?? false,
    lastNotifiedAt: null,
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    _count: {
      responses: options.responseCount ?? 0,
    },
  };
}

function responseRecord(
  options: {
    targetType?: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
    linkId?: string | null;
    answers?: unknown[];
    deletedAt?: Date | null;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  return {
    id: 'response-1',
    formId: 'form-1',
    linkId: options.linkId === undefined ? 'link-1' : options.linkId,
    targetType: options.targetType ?? EventFormTargetType.EVENT,
    eventId: options.eventId === undefined ? 'event-1' : options.eventId,
    majorEventId: options.majorEventId === undefined ? null : options.majorEventId,
    personId: 'person-1',
    person: {
      id: 'person-1',
      name: 'Ana Silva',
      email: 'ana@example.com',
    },
    answers: options.answers ?? [],
    source: 'PUBLIC_FORM',
    submittedAt: now,
    updatedAt: now,
    deletedAt: options.deletedAt ?? null,
  };
}
