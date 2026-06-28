import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EventFormAudience,
  EventFormSigilo,
  EventFormTargetType,
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
});

function createPrisma() {
  return {
    eventForm: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    eventFormResponse: {
      findMany: jest.fn(),
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
      update: jest.fn(),
    },
  };
}

function createAuthorizationPolicy() {
  return {
    assertPermissions: jest.fn(),
  };
}

function createCurrentUserContext(user: AuthenticatedUser) {
  return {
    getAuthenticatedUser: jest.fn(() => user),
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
    resultsPublic?: boolean;
    sigilo?: EventFormSigilo;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  const link = {
    id: 'link-1',
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    event: {
      id: 'event-1',
      name: 'Oficina de Angular',
      emoji: 'computer',
      endDate: new Date('2026-07-01T12:00:00.000Z'),
    },
    majorEvent: null,
    audience: EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
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
      responses: 0,
    },
  };

  return {
    id: 'form-1',
    name: 'Pesquisa de camiseta',
    description: null,
    ownerEventId: null,
    ownerMajorEventId: null,
    ownerEvent: null,
    ownerMajorEvent: null,
    elements: [],
    sigilo: options.sigilo ?? EventFormSigilo.SECRET,
    resultsPublic: options.resultsPublic ?? false,
    resultsLive: false,
    publicationState: PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: now,
    unpublishedAt: null,
    publicationScheduledBy: null,
    publicationUpdatedBy: null,
    links: [link],
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    _count: {
      responses: 0,
    },
  };
}
