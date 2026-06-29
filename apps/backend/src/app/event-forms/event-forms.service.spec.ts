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
    service = new EventFormsService(
      prisma as never,
      authorizationPolicy as never,
      currentUserContext as never,
      notifications as never,
    );
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
    expect(currentUserContext.requireCurrentPerson).not.toHaveBeenCalled();
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
        form: {
          id: 'form-1',
          name: 'Pesquisa de camiseta',
          responseMode: EventFormResponseMode.ONE_PER_TARGET,
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

  it('includes single-form responses across linked targets in target results', async () => {
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
        },
      }),
    );
  });
});

function createPrisma() {
  const client = {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
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
    notifyOnPublish: false,
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
    answers?: unknown[];
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  return {
    id: 'response-1',
    formId: 'form-1',
    linkId: 'link-1',
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
