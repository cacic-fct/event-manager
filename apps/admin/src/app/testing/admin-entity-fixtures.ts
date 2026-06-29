import type {
  CertificateConfig,
  CertificateConfigInput,
  CertificateTemplate,
  Event,
  EventAttendance,
  EventDraft,
  EventForm,
  EventFormInput,
  EventFormResults,
  EventGroup,
  EventInput,
  EventSummary,
  MajorEvent,
  MajorEventInput,
  MajorEventUserAttendance,
  OfflineEventAttendanceSubmission,
  Person,
  PlacePreset,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import type { AuthenticatedUser } from '@cacic-fct/shared-angular';
import type {
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardInconsistency,
  DashboardPendingOfflineAttendanceEvent,
  DashboardPendingReceiptMajorEvent,
  WorkspaceDashboardInsights,
} from '@cacic-fct/shared-frontend-types';
import { Permission, type Permission as PermissionScope } from '@cacic-fct/shared-permissions';

export const adminFixtureDate = '2026-05-21T12:00:00.000Z';

export function createAdminAuthenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'admin-user-1',
    preferredUsername: 'admin',
    email: 'admin@example.edu',
    roles: ['access'],
    permissions: [...adminWorkspaceReadPermissions],
    scopes: ['openid'],
    claims: {
      exp: 1_780_000_000,
      is_onboarded: true,
      name: 'Admin Teste',
      email: 'admin@example.edu',
    },
    ...overrides,
  };
}

export const adminWorkspaceReadPermissions = [
  Permission.Event.Read,
  Permission.MajorEvent.Read,
  Permission.EventLecturer.Read,
  Permission.EventGroup.Read,
  Permission.EventAttendance.Read,
  Permission.Subscription.Read,
  Permission.Certificate.Read,
  Permission.CertificateConfig.Read,
  Permission.PlacePreset.Read,
] as const satisfies readonly PermissionScope[];

export function createAdminDashboardCalendarEvent(
  overrides: Partial<DashboardCalendarEvent> = {},
): DashboardCalendarEvent {
  return {
    id: 'event-1',
    name: 'Credenciamento',
    emoji: 'clipboard',
    type: 'OTHER',
    startDate: adminFixtureDate,
    endDate: '2026-05-21T14:00:00.000Z',
    locationDescription: 'Auditório principal',
    majorEventName: 'Semana da Computação',
    eventGroupName: null,
    attendancesCount: 12,
    subscriptionsCount: 40,
    shouldCollectAttendance: true,
    canCollectAttendanceNow: true,
    ...overrides,
  };
}

export function createAdminDashboardPendingReceiptMajorEvent(
  overrides: Partial<DashboardPendingReceiptMajorEvent> = {},
): DashboardPendingReceiptMajorEvent {
  return {
    majorEventId: 'major-event-1',
    name: 'Semana da Computação',
    emoji: 'festival',
    startDate: adminFixtureDate,
    endDate: '2026-05-23T21:00:00.000Z',
    pendingCount: 3,
    ...overrides,
  };
}

export function createAdminDashboardPendingOfflineAttendanceEvent(
  overrides: Partial<DashboardPendingOfflineAttendanceEvent> = {},
): DashboardPendingOfflineAttendanceEvent {
  return {
    eventId: 'event-1',
    name: 'Credenciamento',
    emoji: 'clipboard',
    startDate: adminFixtureDate,
    endDate: '2026-05-21T14:00:00.000Z',
    pendingCount: 2,
    ...overrides,
  };
}

export function createAdminDashboardPendingCertificate(
  overrides: Partial<DashboardCertificatePendingItem> = {},
): DashboardCertificatePendingItem {
  return {
    targetType: 'EVENT',
    targetId: 'event-1',
    title: 'Credenciamento',
    subtitle: 'Certificado de participante',
    finishedAt: adminFixtureDate,
    ...overrides,
  };
}

export function createAdminDashboardInconsistency(
  overrides: Partial<DashboardInconsistency> = {},
): DashboardInconsistency {
  return {
    type: 'EVENT_WITHOUT_PLACE',
    action: 'OPEN_EVENT',
    targetId: 'event-1',
    severity: 'CRITICAL',
    title: 'Evento sem local',
    description: 'Defina um local antes de divulgar a atividade.',
    eventId: 'event-1',
    relatedEventId: null,
    personId: null,
    ...overrides,
  };
}

export function createAdminWorkspaceDashboardInsights(
  overrides: Partial<WorkspaceDashboardInsights> = {},
): WorkspaceDashboardInsights {
  return {
    generatedAt: adminFixtureDate,
    summary: {
      eventsCount: 1,
      eventGroupsCount: 1,
      majorEventsCount: 1,
    },
    suggestions: [
      {
        action: 'CREATE_EVENT',
        label: 'Novo evento',
        targetId: null,
      },
      {
        action: 'CREATE_EVENT_GROUP',
        label: 'Novo grupo de eventos',
        targetId: null,
      },
    ],
    calendarEvents: [createAdminDashboardCalendarEvent()],
    weatherAlerts: [],
    pendingCertificates: [createAdminDashboardPendingCertificate()],
    pendingReceiptValidationsCount: 3,
    pendingReceiptMajorEvents: [createAdminDashboardPendingReceiptMajorEvent()],
    pendingOfflineAttendancesCount: 2,
    pendingOfflineAttendanceEvents: [createAdminDashboardPendingOfflineAttendanceEvent()],
    inconsistencies: [
      createAdminDashboardInconsistency(),
      createAdminDashboardInconsistency({
        type: 'WEAK_EVENT_DESCRIPTION',
        severity: 'WARNING',
        title: 'Descrição curta',
        description: 'Revise a descrição para melhorar a divulgação.',
      }),
    ],
    duplicatePeopleCount: 4,
    permissions: [],
    ...overrides,
  };
}

export function createAdminPlacePreset(overrides: Partial<PlacePreset> = {}): PlacePreset {
  return {
    id: 'place-1',
    name: 'Auditorio',
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'FCT-Unesp',
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    ...overrides,
  };
}

export function createAdminMajorEvent(overrides: Partial<MajorEvent> = {}): MajorEvent {
  const id = overrides.id ?? 'major-event-1';

  return {
    id,
    name: 'Grande evento',
    emoji: 'event',
    startDate: '2026-05-20T12:00:00.000Z',
    endDate: '2026-05-23T21:00:00.000Z',
    description: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    isPaymentRequired: false,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: null,
    paymentInfo: null,
    majorEventPrices: [],
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: adminFixtureDate,
    unpublishedAt: null,
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    ...overrides,
  };
}

export function createAdminMajorEventFromInput(input: MajorEventInput = {}): MajorEvent {
  const id = input.id ?? 'major-event-1';

  return createAdminMajorEvent({
    id,
    name: input.name ?? 'Grande evento',
    emoji: input.emoji ?? 'event',
    startDate: input.startDate ?? '2026-05-20T12:00:00.000Z',
    endDate: input.endDate ?? '2026-05-23T21:00:00.000Z',
    description: input.description,
    subscriptionStartDate: input.subscriptionStartDate,
    subscriptionEndDate: input.subscriptionEndDate,
    maxCoursesPerAttendee: input.maxCoursesPerAttendee,
    maxLecturesPerAttendee: input.maxLecturesPerAttendee,
    maxUncategorizedPerAttendee: input.maxUncategorizedPerAttendee,
    rankedSubscriptionEnabled: input.rankedSubscriptionEnabled,
    buttonText: input.buttonText,
    buttonLink: input.buttonLink,
    contactInfo: input.contactInfo,
    contactType: input.contactType,
    isPaymentRequired: input.isPaymentRequired ?? false,
    shouldIssueCertificateForNonPayingAttendees: input.shouldIssueCertificateForNonPayingAttendees ?? false,
    shouldIssueCertificateForNonSubscribedAttendees: input.shouldIssueCertificateForNonSubscribedAttendees ?? false,
    additionalPaymentInfo: input.additionalPaymentInfo,
    paymentInfo: input.paymentInfo
      ? {
          id: `${id}-payment`,
          majorEventId: id,
          ...input.paymentInfo,
        }
      : null,
    majorEventPrices: input.price
      ? [
          {
            id: `${id}-price`,
            type: input.price.type,
            tiers: input.price.tiers.map((tier, index) => ({
              id: tier.id ?? `${id}-price-tier-${index + 1}`,
              name: tier.name,
              value: tier.value,
            })),
          },
        ]
      : [],
    publicationState: 'DRAFT',
  });
}

export function createAdminEventGroup(overrides: Partial<EventGroup> = {}): EventGroup {
  return {
    id: 'event-group-1',
    name: 'Grupo de eventos',
    emoji: 'group',
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldIssueCertificateForEachEvent: false,
    shouldIssuePartialCertificate: false,
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    ...overrides,
  };
}

export function createAdminEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    name: 'Evento',
    creditMinutes: 120,
    startDate: '2026-05-21T17:00:00.000Z',
    endDate: '2026-05-21T19:00:00.000Z',
    emoji: 'event',
    type: 'MINICURSO',
    description: null,
    shortDescription: null,
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'Laboratorio 1',
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    allowSubscription: true,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: 40,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    shouldProvideSubscriberListToLecturer: false,
    onlineAttendanceCode: null,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: adminFixtureDate,
    unpublishedAt: null,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    ...overrides,
  };
}

export function createAdminEventSummary(overrides: Partial<EventSummary> = {}): EventSummary {
  const event = createAdminEvent();

  return {
    id: event.id,
    eventGroupId: event.eventGroupId ?? null,
    startDate: event.startDate,
    endDate: event.endDate,
    createdAt: event.createdAt,
    name: event.name,
    majorEvent: event.majorEvent ? { id: event.majorEvent.id, name: event.majorEvent.name } : null,
    ...overrides,
  };
}

export function createAdminEventFromInput(input: EventInput = {}): Event {
  return createAdminEvent({
    id: input.id ?? 'event-1',
    name: input.name ?? 'Evento',
    creditMinutes: input.creditMinutes,
    startDate: input.startDate ?? '2026-05-21T17:00:00.000Z',
    endDate: input.endDate ?? '2026-05-21T19:00:00.000Z',
    emoji: input.emoji ?? 'event',
    type: input.type ?? 'MINICURSO',
    description: input.description,
    shortDescription: input.shortDescription,
    latitude: input.latitude,
    longitude: input.longitude,
    locationDescription: input.locationDescription,
    majorEventId: input.majorEventId,
    eventGroupId: input.eventGroupId,
    allowSubscription: input.allowSubscription ?? true,
    subscriptionStartDate: input.subscriptionStartDate,
    subscriptionEndDate: input.subscriptionEndDate,
    slots: input.slots,
    autoSubscribe: input.autoSubscribe ?? false,
    shouldIssueCertificate: input.shouldIssueCertificate ?? true,
    shouldIssueCertificateForNonPayingAttendees: input.shouldIssueCertificateForNonPayingAttendees ?? false,
    shouldIssueCertificateForNonSubscribedAttendees: input.shouldIssueCertificateForNonSubscribedAttendees ?? false,
    shouldCollectAttendance: input.shouldCollectAttendance ?? true,
    isOnlineAttendanceAllowed: input.isOnlineAttendanceAllowed ?? false,
    shouldProvideSubscriberListToLecturer: input.shouldProvideSubscriberListToLecturer ?? false,
    onlineAttendanceCode: input.onlineAttendanceCode,
    onlineAttendanceStartDate: input.onlineAttendanceStartDate,
    onlineAttendanceEndDate: input.onlineAttendanceEndDate,
    publiclyVisible: input.publiclyVisible ?? true,
    youtubeCode: input.youtubeCode,
    buttonText: input.buttonText,
    buttonLink: input.buttonLink,
  });
}

export function createAdminEventDraft(
  overrides: Partial<EventDraft> = {},
  payload: EventInput = {},
): EventDraft {
  const sourceEventId = overrides.sourceEventId ?? payload.id ?? 'event-1';

  return {
    id: 'event-draft-1',
    sourceEventId,
    name: payload.name ?? 'Rascunho do evento',
    payloadJson: JSON.stringify(payload),
    createdById: 'fixture-admin',
    createdByName: 'Admin Teste',
    createdByEmail: 'admin@example.edu',
    updatedById: 'fixture-admin',
    updatedByName: 'Admin Teste',
    updatedByEmail: 'admin@example.edu',
    createdAt: adminFixtureDate,
    updatedAt: adminFixtureDate,
    expiresAt: '2026-06-21T12:00:00.000Z',
    ...overrides,
  };
}

export function createAdminEventForm(overrides: Partial<EventForm> = {}): EventForm {
  const event = createAdminEvent({ id: overrides.ownerEventId ?? 'event-1', name: 'Oficina de Angular' });
  const majorEvent = createAdminMajorEvent({ id: overrides.ownerMajorEventId ?? 'major-event-1', name: 'Grande evento' });
  const owner = overrides.ownerMajorEventId
    ? {
        type: 'MAJOR_EVENT' as const,
        id: majorEvent.id,
        name: majorEvent.name,
        emoji: majorEvent.emoji,
      }
    : {
        type: 'EVENT' as const,
        id: event.id,
        name: event.name,
        emoji: event.emoji,
      };

  return {
    id: 'form-1',
    name: 'Pesquisa de camiseta',
    description: 'Coleta o tamanho da camiseta dos inscritos.',
    ownerEventId: overrides.ownerMajorEventId ? null : event.id,
    ownerMajorEventId: overrides.ownerMajorEventId ?? null,
    owner,
    elementsJson: JSON.stringify([
      {
        id: 'shirt-size',
        type: 'shortText',
        title: 'Tamanho da camiseta',
        description: 'Exemplo: P, M, G ou GG.',
        required: true,
        options: [],
      },
    ]),
    sigilo: 'PARTIALLY_SECRET',
    responseMode: 'ONE_PER_TARGET',
    resultsPublic: false,
    resultsLive: false,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: adminFixtureDate,
    unpublishedAt: null,
    links: [
      {
        id: 'form-link-1',
        formId: 'form-1',
        targetType: 'EVENT',
        eventId: event.id,
        majorEventId: null,
        target: {
          type: 'EVENT',
          id: event.id,
          name: event.name,
          emoji: event.emoji,
        },
        audience: 'SUBSCRIBERS_OR_ATTENDEES',
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
        enforceRequiredAnswers: true,
        displayOrder: 0,
        availableFrom: null,
        availableUntil: null,
        notifyOnPublish: false,
        allowLecturerManualPublish: false,
        lastNotifiedAt: null,
        responseCount: 1,
        createdAt: adminFixtureDate,
        updatedAt: adminFixtureDate,
      },
    ],
    responseCount: 1,
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    ...overrides,
  };
}

export function createAdminEventFormFromInput(input: EventFormInput): EventForm {
  return createAdminEventForm({
    id: input.id ?? 'form-1',
    name: input.name ?? 'Pesquisa de camiseta',
    description: input.description,
    ownerEventId: input.ownerEventId,
    ownerMajorEventId: input.ownerMajorEventId,
    owner: input.ownerEventId
      ? {
          type: 'EVENT',
          id: input.ownerEventId,
          name: 'Oficina de Angular',
          emoji: 'event',
        }
      : input.ownerMajorEventId
        ? {
            type: 'MAJOR_EVENT',
            id: input.ownerMajorEventId,
            name: 'Grande evento',
            emoji: 'event',
          }
        : null,
    elementsJson: input.elementsJson ?? '[]',
    sigilo: input.sigilo ?? 'SECRET',
    responseMode: input.responseMode ?? 'ONE_PER_TARGET',
    resultsPublic: input.resultsPublic ?? false,
    resultsLive: input.resultsLive ?? false,
    links:
      input.links?.map((link, index) => ({
        id: link.id ?? `form-link-${index + 1}`,
        formId: input.id ?? 'form-1',
        targetType: link.targetType,
        eventId: link.targetType === 'EVENT' ? link.eventId ?? null : null,
        majorEventId: link.targetType === 'MAJOR_EVENT' ? link.majorEventId ?? null : null,
        target: null,
        audience: link.audience ?? 'SUBSCRIBERS_OR_ATTENDEES',
        insertInSubscriptionFlow: link.insertInSubscriptionFlow ?? false,
        requiredInSubscriptionFlow: link.requiredInSubscriptionFlow ?? false,
        enforceRequiredAnswers: link.enforceRequiredAnswers ?? true,
        displayOrder: link.displayOrder ?? index,
        availableFrom: link.availableFrom ?? null,
        availableUntil: link.availableUntil ?? null,
        notifyOnPublish: link.insertInSubscriptionFlow ? false : (link.notifyOnPublish ?? true),
        allowLecturerManualPublish:
          link.targetType === 'EVENT' && !link.insertInSubscriptionFlow
            ? (link.allowLecturerManualPublish ?? false)
            : false,
        lastNotifiedAt: null,
        responseCount: 0,
        createdAt: adminFixtureDate,
        updatedAt: adminFixtureDate,
      })) ?? [],
  });
}

export function createAdminEventFormResults(overrides: Partial<EventFormResults> = {}): EventFormResults {
  const form = overrides.form ?? createAdminEventForm();
  const link = form.links[0];
  const targetType = link?.targetType ?? 'EVENT';

  return {
    form,
    responseCount: 1,
    anonymous: false,
    answersReleased: true,
    summaryJson: JSON.stringify({
      questions: [
        {
          elementId: 'shirt-size',
          title: 'Tamanho da camiseta',
          type: 'shortText',
          answeredCount: 1,
          buckets: [],
          textAnswers: ['M'],
        },
      ],
    }),
    responses: [
      {
        id: 'form-response-1',
        formId: form.id,
        linkId: link?.id ?? null,
        targetType,
        eventId: targetType === 'EVENT' ? (link?.eventId ?? 'event-1') : null,
        majorEventId: targetType === 'MAJOR_EVENT' ? (link?.majorEventId ?? 'major-event-1') : null,
        personId: 'person-1',
        respondentName: 'Ada Lovelace',
        respondentEmail: 'ada@example.com',
        answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'M' }]),
        source: 'PUBLIC_FORM',
        submittedAt: adminFixtureDate,
        updatedAt: adminFixtureDate,
      },
    ],
    ...overrides,
  };
}

export function createAdminPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    user: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    lecturerProfile: null,
    ...overrides,
  };
}

export function createAdminWorkspaceEventSubscription(
  overrides: Partial<WorkspaceEventSubscription> = {},
  person = createAdminPerson(),
  event = createAdminEvent(),
): WorkspaceEventSubscription {
  return {
    id: 'event-subscription-1',
    eventId: event.id,
    event,
    personId: person.id,
    person,
    eventGroupSubscriptionId: null,
    majorEventSubscriptionId: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    createdByMethod: 'ADMIN_DASHBOARD',
    isLecturerSubscription: false,
    ...overrides,
  };
}

export function createAdminWorkspaceMajorEventSubscriptionEvent(
  overrides: Partial<WorkspaceMajorEventSubscriptionEvent> = {},
  event = createAdminEvent(),
): WorkspaceMajorEventSubscriptionEvent {
  return {
    eventId: event.id,
    eventName: event.name,
    eventStartDate: event.startDate,
    subscribed: true,
    isLecturerSubscription: false,
    ...overrides,
  };
}

export function createAdminWorkspaceMajorEventSubscription(
  overrides: Partial<WorkspaceMajorEventSubscription> = {},
  person = createAdminPerson(),
  majorEvent = createAdminMajorEvent(),
): WorkspaceMajorEventSubscription {
  return {
    id: 'major-event-subscription-1',
    majorEventId: majorEvent.id,
    majorEvent,
    personId: person.id,
    person,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: null,
    paymentDate: null,
    paymentTier: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    createdByMethod: 'ADMIN_DASHBOARD',
    events: [createAdminWorkspaceMajorEventSubscriptionEvent({}, createAdminEvent({ majorEventId: majorEvent.id }))],
    ...overrides,
  };
}

export function createAdminEventAttendance(
  overrides: Partial<EventAttendance> = {},
  person = createAdminPerson(),
  event = createAdminEvent(),
): EventAttendance {
  return {
    eventId: event.id,
    event,
    personId: person.id,
    person,
    category: 'REGULAR',
    attendedAt: adminFixtureDate,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    committedById: 'fixture-admin',
    createdByMethod: 'MANUAL_INPUT',
    collectedByFullName: 'Admin Teste',
    committedByFullName: 'Admin Teste',
    collectedLatitude: null,
    collectedLongitude: null,
    collectedAccuracyMeters: null,
    ...overrides,
  };
}

export function createAdminOfflineEventAttendanceSubmission(
  overrides: Partial<OfflineEventAttendanceSubmission> = {},
  event = createAdminEvent(),
  person = createAdminPerson(),
): OfflineEventAttendanceSubmission {
  return {
    id: 'offline-attendance-1',
    clientId: 'offline-client-1',
    eventId: event.id,
    event,
    personId: person.id,
    person,
    status: 'PENDING',
    createdByMethod: 'MANUAL_INPUT',
    scannerCode: null,
    manualValue: person.email,
    collectedAt: adminFixtureDate,
    authorUserId: 'fixture-admin',
    authorName: 'Admin Teste',
    authorEmail: 'admin@example.edu',
    submittedById: 'fixture-admin',
    submittedByFullName: 'Admin Teste',
    submittedAt: adminFixtureDate,
    stagedReason: null,
    resolutionError: null,
    collectedLatitude: null,
    collectedLongitude: null,
    collectedAccuracyMeters: null,
    committedAt: null,
    committedById: null,
    committedByFullName: null,
    rejectedAt: null,
    rejectedById: null,
    rejectedByFullName: null,
    rejectionReason: null,
    ...overrides,
  };
}

export function createAdminMajorEventUserAttendance(
  overrides: Partial<MajorEventUserAttendance> = {},
  person = createAdminPerson(),
  majorEvent = createAdminMajorEvent(),
): MajorEventUserAttendance {
  return {
    majorEventId: majorEvent.id,
    subscriptionId: 'major-event-subscription-1',
    personId: person.id,
    person,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: null,
    paymentDate: null,
    paymentTier: null,
    attendances: [
      {
        eventId: 'event-1',
        eventName: 'Evento',
        eventStartDate: '2026-05-21T17:00:00.000Z',
        attended: true,
        attendedAt: adminFixtureDate,
        category: 'REGULAR',
      },
    ],
    ...overrides,
  };
}

export function createAdminCertificateTemplate(overrides: Partial<CertificateTemplate> = {}): CertificateTemplate {
  return {
    id: 'template-1',
    name: 'Template',
    description: null,
    version: 1,
    isActive: true,
    certificateFieldsJson: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    deletedAt: null,
    ...overrides,
  };
}

export function createAdminCertificateConfig(
  overrides: Partial<CertificateConfig> = {},
  template = createAdminCertificateTemplate(),
): CertificateConfig {
  return {
    id: 'config-1',
    name: 'Certificate',
    scope: 'EVENT',
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    eventId: 'event-1',
    event: null,
    certificateTemplateId: template.id,
    certificateTemplate: template,
    certificateText: null,
    shouldAutofillSecondPage: true,
    secondPageText: null,
    isActive: true,
    issuedTo: 'ATTENDEE',
    certificateFieldsJson: null,
    createdAt: adminFixtureDate,
    createdById: 'fixture-admin',
    updatedAt: adminFixtureDate,
    updatedById: 'fixture-admin',
    deletedAt: null,
    ...overrides,
  };
}

export function createAdminCertificateConfigFromInput(
  input: CertificateConfigInput = {},
  template = createAdminCertificateTemplate(),
  overrides: Partial<CertificateConfig> = {},
): CertificateConfig {
  return createAdminCertificateConfig(
    {
      name: input.name ?? 'Certificate',
      scope: input.scope ?? 'EVENT',
      majorEventId: input.majorEventId,
      eventGroupId: input.eventGroupId,
      eventId: input.eventId,
      certificateTemplateId: input.certificateTemplateId ?? template.id,
      certificateTemplate: template,
      certificateText: input.certificateText,
      shouldAutofillSecondPage: input.shouldAutofillSecondPage ?? true,
      secondPageText: input.secondPageText,
      isActive: input.isActive ?? true,
      issuedTo: input.issuedTo ?? 'ATTENDEE',
      certificateFieldsJson: input.certificateFieldsJson,
      ...overrides,
    },
    template,
  );
}
