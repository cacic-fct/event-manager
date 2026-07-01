import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EventFormAudience,
  EventFormResponseMode,
  EventFormSigilo,
  EventFormTargetType,
  Prisma,
  PublicationState,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GraphqlContext } from '../current-user/selects';
import { EventFormNotificationService } from './event-form-notification.service';
import { EventFormsService } from './event-forms.service';

describe('EventFormsService', () => {
  let service: EventFormsService;
  let prisma: ReturnType<typeof createPrisma>;
  let authorizationPolicy: ReturnType<typeof createAuthorizationPolicy>;
  let currentUserContext: ReturnType<typeof createCurrentUserContext>;
  let notifications: ReturnType<typeof createNotifications>;

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
    const formNotifications = new EventFormNotificationService(prisma as never, notifications as never);
    service = new EventFormsService(
      prisma as never,
      authorizationPolicy as never,
      currentUserContext as never,
      formNotifications as never,
    );
  });

  it('neutralizes CSV formulas after leading whitespace or control characters', () => {
    expect(service['csvCell']('\t=IMPORTXML("https://example.com")')).toBe(
      '"\'\t=IMPORTXML(""https://example.com"")"',
    );
    expect(service['csvCell']('\u0000+SUM(1,1)')).toBe('"\'\u0000+SUM(1,1)"');
    expect(service['csvCell']('plain text')).toBe('"plain text"');
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
    const form = formRecord({ allowLecturerManualPublish: true });
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.eventForm.findFirst.mockResolvedValue(form);
    prisma.eventForm.update.mockResolvedValue({
      ...form,
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-28T12:00:00.000Z'),
    });

    const result = await service.publishLecturerForm(context, 'form-1', 'event-1');

    expect(result.publicationState).toBe(PublicationState.PUBLISHED);
    expect(prisma.eventForm.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'form-1' },
        data: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          publicationUpdatedBy: authenticatedUser.sub,
        }),
      }),
    );
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

  it('shows public results to eligible subscribers', async () => {
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: true, sigilo: EventFormSigilo.PUBLIC }));
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
    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith(context);
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
    prisma.eventForm.update.mockResolvedValue({ ...form, publicationState: PublicationState.PUBLISHED });

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
  });

  it('updates one response per whole form and stores the submitted target', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ responseMode: EventFormResponseMode.SINGLE_PER_FORM }));
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
  });

  it('updates one-per-target responses even when the active link changed', async () => {
    prisma.eventForm.findFirst.mockResolvedValue(
      formRecord({
        responseMode: EventFormResponseMode.ONE_PER_TARGET,
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

  it('redacts response counts from current-user form listings until results are public', async () => {
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
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ resultsPublic: true, sigilo: EventFormSigilo.PARTIALLY_SECRET }));
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
        sigilo: EventFormSigilo.PUBLIC,
        responseMode: EventFormResponseMode.SINGLE_PER_FORM,
      }),
    );
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });
    prisma.eventAttendance.findFirst.mockResolvedValue(null);
    prisma.eventLecturer.findUnique.mockResolvedValue(null);
    prisma.eventFormResponse.findMany.mockResolvedValue([responseRecord({ targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-1' })]);

    await service.getCurrentUserResults(context, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
    });

    expect(prisma.eventFormResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          formId: 'form-1',
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

    const notifiedCount = await service['notifyEligiblePeople'](form);

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

    const notifiedCount = await service['notifyEligiblePeople'](form);

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

    const notifiedCount = await service['notifyEligiblePeople'](form);

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
    },
    eventFormResponse: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventLecturer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    eventSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    majorEventSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    eventAttendance: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    eventFormLink: {
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

function formRecord(
  options: {
    allowLecturerManualPublish?: boolean;
    insertInSubscriptionFlow?: boolean;
    requiredInSubscriptionFlow?: boolean;
    ownerEventId?: string | null;
    ownerMajorEventId?: string | null;
    resultsPublic?: boolean;
    sigilo?: EventFormSigilo;
    responseMode?: EventFormResponseMode;
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
    resultsLive: false,
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
    responseCount?: number;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
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
          endDate: new Date('2026-07-01T12:00:00.000Z'),
        }
      : null,
    majorEvent: majorEventId
      ? {
          id: majorEventId,
          name: 'Semana da Computação',
          emoji: 'calendar',
          endDate: new Date('2026-07-01T12:00:00.000Z'),
        }
      : null,
    audience: options.audience ?? EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: options.insertInSubscriptionFlow ?? false,
    requiredInSubscriptionFlow: options.requiredInSubscriptionFlow ?? false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
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
  };
}
