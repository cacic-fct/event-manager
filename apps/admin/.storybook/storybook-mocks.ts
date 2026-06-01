import { fakerPT_BR as faker } from '@faker-js/faker';
import { http, HttpResponse } from 'msw';

faker.seed(20260516);

const now = new Date('2026-05-16T12:00:00-03:00');

function isoDaysFromNow(days: number, hour = 14): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function person(index = 0) {
  return {
    id: `person-${index + 1}`,
    name: faker.person.fullName(),
    email: faker.internet.email(),
    secondaryEmails: [faker.internet.email()],
    phone: faker.phone.number({ style: 'national' }),
    identityDocument: faker.string.numeric(11),
    academicId: faker.string.numeric(9),
    userId: `user-${index + 1}`,
    mergedIntoId: null,
    externalRef: `story-${index + 1}`,
    deletedAt: null,
    createdAt: isoDaysFromNow(-30 + index),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-1),
    updatedById: 'storybook-admin',
    user: {
      id: `user-${index + 1}`,
      name: faker.person.fullName(),
      email: faker.internet.email(),
      role: index === 0 ? 'ADMIN' : 'USER',
    },
    lecturerProfile:
      index === 0
        ? {
            id: 'lecturer-profile-1',
            personId: 'person-1',
            displayName: 'Dra. Ana Clara Silva',
            biography: 'Atua em desenvolvimento web, acessibilidade e formação de comunidades técnicas.',
            publishGoogleUserPicture: false,
            googleUserPicture: null,
            email: 'ana.lecturer@example.com',
            whatsapp: '+5518999999999',
            createdAt: isoDaysFromNow(-10),
            createdById: 'storybook-admin',
            updatedAt: isoDaysFromNow(-1),
            updatedById: 'storybook-admin',
          }
        : null,
  };
}

function eventGroup(index = 0) {
  return {
    id: `group-${index + 1}`,
    name: faker.helpers.arrayElement(['Trilha Web', 'Trilha Dados', 'Trilha Extensao']),
    emoji: faker.helpers.arrayElement(['🌐', '📊', '🎓']),
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldIssueCertificateForEachEvent: true,
    shouldIssuePartialCertificate: true,
    deletedAt: null,
    createdAt: isoDaysFromNow(-30),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-1),
    updatedById: 'storybook-admin',
  };
}

function majorEvent(index = 0) {
  return {
    id: `major-${index + 1}`,
    name: faker.helpers.arrayElement(['CACiC', 'SECOMPP']),
    emoji: faker.helpers.arrayElement(['💻', '🚀', '🎓']),
    startDate: isoDaysFromNow(index + 7, 9),
    endDate: isoDaysFromNow(index + 10, 18),
    description: faker.lorem.paragraphs(2),
    subscriptionStartDate: isoDaysFromNow(-5, 8),
    subscriptionEndDate: isoDaysFromNow(index + 5, 23),
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 8,
    buttonText: 'Site do evento',
    buttonLink: 'https://cacic.dev',
    contactInfo: 'eventos@example.com',
    contactType: 'EMAIL',
    isPaymentRequired: index % 2 === 0,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: 'Pagamento confirmado por comprovante.',
    paymentInfo: {
      id: `payment-${index + 1}`,
      bankName: 'Banco Storybook',
      agency: '0001',
      account: '12345-6',
      holder: 'CACiC FCT',
      document: '12.345.678/0001-90',
      pixKey: 'pagamentos@example.com',
      pixCity: 'PRESIDENTE PRUDENTE',
      majorEventId: `major-${index + 1}`,
    },
    majorEventPrices: [
      {
        id: `price-${index + 1}`,
        type: 'TIERED',
        tiers: [
          { id: `tier-${index + 1}-student`, name: 'Estudante', value: 2500 },
          { id: `tier-${index + 1}-community`, name: 'Comunidade', value: 5000 },
        ],
      },
    ],
    deletedAt: null,
    createdAt: isoDaysFromNow(-45),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-1),
    updatedById: 'storybook-admin',
  };
}

function event(index = 0) {
  const group = eventGroups[index % eventGroups.length];

  return {
    id: `event-${index + 1}`,
    name: faker.helpers.arrayElement([
      'Arquitetura Angular com Signals',
      'IA aplicada a eventos acadêmicos',
      'Observabilidade para APIs GraphQL',
      'Acessibilidade em produtos digitais',
    ]),
    creditMinutes: faker.helpers.arrayElement([60, 90, 120, 180]),
    startDate: isoDaysFromNow(index, 14),
    endDate: isoDaysFromNow(index, 16),
    emoji: faker.helpers.arrayElement(['🧠', '🛠️', '📡', '✨']),
    type: faker.helpers.arrayElement(['MINICURSO', 'PALESTRA', 'OTHER']),
    description: faker.lorem.paragraphs(2),
    shortDescription: faker.lorem.sentence(),
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'FCT-Unesp, Presidente Prudente',
    majorEventId: 'major-1',
    majorEvent: {
      id: 'major-1',
      name: 'CACiC',
      startDate: isoDaysFromNow(7, 9),
      endDate: isoDaysFromNow(10, 18),
    },
    eventGroupId: group.id,
    eventGroup: group,
    allowSubscription: true,
    subscriptionStartDate: isoDaysFromNow(-5, 8),
    subscriptionEndDate: isoDaysFromNow(index + 2, 22),
    slots: 40,
    autoSubscribe: false,
    publiclyVisible: true,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: index % 2 === 0,
    onlineAttendanceCode: `A${index}B${index}`,
    onlineAttendanceStartDate: isoDaysFromNow(index, 13),
    onlineAttendanceEndDate: isoDaysFromNow(index, 17),
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    deletedAt: null,
    createdAt: isoDaysFromNow(-20 + index),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-1),
    updatedById: 'storybook-admin',
  };
}

const people = Array.from({ length: 8 }, (_, index) => person(index));
const eventGroups = Array.from({ length: 3 }, (_, index) => eventGroup(index));
const majorEvents = Array.from({ length: 3 }, (_, index) => majorEvent(index));
const events = Array.from({ length: 8 }, (_, index) => event(index));

const certificateTemplate = {
  id: 'template-1',
  name: 'Certificado padrao',
  description: 'Modelo com dados do participante e evento.',
  version: 1,
  isActive: true,
  certificateFieldsJson: '{}',
  createdAt: isoDaysFromNow(-60),
  createdById: 'storybook-admin',
  updatedAt: isoDaysFromNow(-5),
  updatedById: 'storybook-admin',
  deletedAt: null,
};

const certificateConfig = {
  id: 'config-1',
  name: 'Certificado de participacao',
  scope: 'EVENT',
  majorEventId: null,
  eventGroupId: null,
  eventId: 'event-1',
  certificateTemplateId: certificateTemplate.id,
  certificateText: 'Certificamos a participacao no evento.',
  isActive: true,
  issuedTo: 'ATTENDEE',
  certificateFieldsJson: '{}',
  createdAt: isoDaysFromNow(-10),
  createdById: 'storybook-admin',
  updatedAt: isoDaysFromNow(-2),
  updatedById: 'storybook-admin',
  deletedAt: null,
  majorEvent: null,
  eventGroup: null,
  event: events[0],
  certificateTemplate,
};

const certificates = people.slice(0, 4).map((item, index) => ({
  id: `certificate-${index + 1}`,
  personId: item.id,
  person: item,
  configId: certificateConfig.id,
  config: certificateConfig,
  renderedDataJson: '{}',
  issuedAt: isoDaysFromNow(-index - 1, 10),
  issuedById: 'storybook-admin',
  certificateTemplateId: certificateTemplate.id,
  certificateTemplate,
  createdAt: isoDaysFromNow(-index - 1, 10),
  updatedAt: isoDaysFromNow(-index - 1, 10),
  deletedAt: null,
}));

function eventAttendance(index = 0) {
  const selectedEvent = events[index % events.length];
  const selectedPerson = people[index % people.length];

  return {
    eventId: selectedEvent.id,
    personId: selectedPerson.id,
    attendedAt: isoDaysFromNow(-index, 16),
    category: index % 2 === 0 ? 'REGULAR' : 'NON_SUBSCRIBED',
    createdAt: isoDaysFromNow(-index, 16),
    createdById: 'storybook-admin',
    createdByMethod: index % 2 === 0 ? 'SCANNER' : 'MANUAL_INPUT',
    person: selectedPerson,
    event: selectedEvent,
  };
}

function majorEventUserAttendance(index = 0) {
  const selectedPerson = people[index % people.length];

  return {
    majorEventId: 'major-1',
    subscriptionId: `major-subscription-${index + 1}`,
    personId: selectedPerson.id,
    person: selectedPerson,
    subscriptionStatus: index % 2 === 0 ? 'CONFIRMED' : 'RECEIPT_UNDER_REVIEW',
    amountPaid: 2500,
    paymentDate: isoDaysFromNow(-5, 10),
    paymentTier: 'Estudante',
    attendances: events.slice(0, 4).map((selectedEvent, eventIndex) => ({
      eventId: selectedEvent.id,
      eventName: selectedEvent.name,
      eventStartDate: selectedEvent.startDate,
      attended: eventIndex % 2 === 0,
      attendedAt: eventIndex % 2 === 0 ? isoDaysFromNow(-eventIndex, 16) : null,
      category: 'REGULAR',
    })),
  };
}

function workspaceEventSubscription(index = 0) {
  return {
    id: `event-subscription-${index + 1}`,
    eventId: events[index % events.length].id,
    personId: people[index % people.length].id,
    eventGroupSubscriptionId: null,
    createdAt: isoDaysFromNow(-index - 2, 10),
    createdById: 'storybook-admin',
    createdByMethod: 'ADMIN_DASHBOARD',
    isLecturerSubscription: index === 1,
    event: events[index % events.length],
    person: people[index % people.length],
  };
}

function workspaceMajorEventSubscription(index = 0) {
  return {
    id: `major-subscription-${index + 1}`,
    majorEventId: 'major-1',
    personId: people[index % people.length].id,
    subscriptionStatus: index % 2 === 0 ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD',
    amountPaid: 2500,
    paymentDate: isoDaysFromNow(-index - 1, 10),
    paymentTier: 'Estudante',
    createdAt: isoDaysFromNow(-index - 7, 9),
    createdById: 'storybook-admin',
    createdByMethod: 'ADMIN_DASHBOARD',
    majorEvent: majorEvents[0],
    person: people[index % people.length],
    events: events.slice(0, 4).map((selectedEvent, eventIndex) => ({
      eventId: selectedEvent.id,
      eventName: selectedEvent.name,
      eventStartDate: selectedEvent.startDate,
      subscribed: eventIndex % 2 === 0,
      isLecturerSubscription: false,
    })),
  };
}

function receiptQueue() {
  return {
    pendingCount: 2,
    items: people.slice(0, 2).map((item, index) => ({
      subscriptionId: `major-subscription-${index + 1}`,
      majorEventId: 'major-1',
      majorEventName: majorEvents[0].name,
      personId: item.id,
      personName: item.name,
      personEmail: item.email,
      personPhone: item.phone,
      amountPaid: 2500,
      paymentTier: 'Estudante',
      subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
      subscriptionUpdatedAt: isoDaysFromNow(-index - 1, 9),
      receiptRejectionReason: null,
      receipt: {
        id: `receipt-${index + 1}`,
        fileName: `comprovante-${index + 1}.png`,
        mimeType: 'image/png',
        sizeBytes: 420000,
        uploadedAt: isoDaysFromNow(-index - 1, 9),
        expiresAt: isoDaysFromNow(1, 9),
        imageUrl: 'https://placehold.co/900x1200/png?text=Comprovante',
        processingStatus: 'PROCESSED',
        ocrText: 'PIX 25,00 CACiC FCT',
        amountMatched: true,
        matchedAmountText: 'R$ 25,00',
        nameMatched: index === 0,
        matchedNameText: item.name,
      },
      events: events.slice(0, 3).map((selectedEvent, eventIndex) => ({
        id: selectedEvent.id,
        name: selectedEvent.name,
        emoji: selectedEvent.emoji,
        type: selectedEvent.type,
        startDate: selectedEvent.startDate,
        endDate: selectedEvent.endDate,
        locationDescription: selectedEvent.locationDescription,
        slots: selectedEvent.slots,
        slotsAvailable: 12 - eventIndex,
        hasScheduleConflict: false,
        hasNoSlots: eventIndex === 2,
      })),
    })),
  };
}

function deletionResult(id = 'deleted-id') {
  return { deleted: true, id };
}

function graphqlData(query: string, variables: Record<string, unknown>) {
  if (query.includes('ListPeople') || query.includes('GetPerson')) {
    return { people, person: people.find((item) => item.id === variables['id']) ?? people[0] };
  }

  if (query.includes('CreatePerson')) {
    return { createPerson: people[0] };
  }

  if (query.includes('UpdatePerson')) {
    return { updatePerson: people[0] };
  }

  if (query.includes('GetLecturerProfile')) {
    return {
      lecturerProfile: people.find((item) => item.id === variables['personId'])?.lecturerProfile ?? null,
    };
  }

  if (query.includes('UpsertLecturerProfile')) {
    const input = (variables['input'] ?? {}) as Record<string, unknown>;
    return {
      upsertLecturerProfile: {
        id: 'lecturer-profile-1',
        personId: String(variables['personId'] ?? 'person-1'),
        displayName: String(input['displayName'] ?? 'Ministrante'),
        biography: String(input['biography'] ?? ''),
        publishGoogleUserPicture: Boolean(input['publishGoogleUserPicture']),
        googleUserPicture: null,
        email: input['email'] ?? null,
        whatsapp: input['whatsapp'] ?? null,
        createdAt: isoDaysFromNow(-10),
        createdById: 'storybook-admin',
        updatedAt: now.toISOString(),
        updatedById: 'storybook-admin',
      },
    };
  }

  if (query.includes('ListEventGroups') || query.includes('GetEventGroup')) {
    return { eventGroups, eventGroup: eventGroups[0] };
  }

  if (query.includes('CreateEventGroup') || query.includes('UpdateEventGroup')) {
    return { createEventGroup: eventGroups[0], updateEventGroup: eventGroups[0] };
  }

  if (query.includes('DeleteEventGroup')) {
    return { deleteEventGroup: deletionResult('group-1') };
  }

  if (query.includes('ListMajorEvents') || query.includes('GetMajorEvent')) {
    return { majorEvents, majorEvent: majorEvents[0] };
  }

  if (query.includes('CreateMajorEvent') || query.includes('UpdateMajorEvent')) {
    return { createMajorEvent: majorEvents[0], updateMajorEvent: majorEvents[0] };
  }

  if (query.includes('DeleteMajorEvent')) {
    return { deleteMajorEvent: deletionResult('major-1') };
  }

  if (query.includes('ListEvents') || query.includes('GetEvent')) {
    return { events, event: events[0] };
  }

  if (query.includes('CreateEvent') || query.includes('UpdateEvent')) {
    return { createEvent: events[0], updateEvent: events[0] };
  }

  if (query.includes('DeleteEvent')) {
    return { deleteEvent: deletionResult('event-1') };
  }

  if (query.includes('ListEventLecturers')) {
    return {
      eventLecturers: people.slice(0, 2).map((item) => ({
        eventId: 'event-1',
        personId: item.id,
        createdAt: isoDaysFromNow(-2, 9),
        createdById: 'storybook-admin',
        person: item,
      })),
    };
  }

  if (query.includes('CreateEventLecturer') || query.includes('DeleteEventLecturer')) {
    return {
      createEventLecturer: { eventId: 'event-1', personId: 'person-1', createdAt: now.toISOString() },
      deleteEventLecturer: { deleted: true, eventId: 'event-1', personId: 'person-1' },
    };
  }

  if (query.includes('ListEventAttendances')) {
    return { eventAttendances: Array.from({ length: 6 }, (_, index) => eventAttendance(index)) };
  }

  if (query.includes('CreateEventAttendanceFromAztecCode')) {
    return { createEventAttendanceFromAztecCode: eventAttendance(0) };
  }

  if (query.includes('CreateEventAttendance')) {
    return { createEventAttendance: eventAttendance(0) };
  }

  if (query.includes('ImportEventAttendancesFromCsv')) {
    return {
      importEventAttendancesFromCsv: {
        createdCount: 12,
        duplicateCount: 2,
        failedCount: 1,
        failedValues: ['sem-documento@example.com'],
        inferredMatchType: 'EMAIL',
      },
    };
  }

  if (query.includes('ListMajorEventUserAttendances')) {
    return { majorEventUserAttendances: Array.from({ length: 6 }, (_, index) => majorEventUserAttendance(index)) };
  }

  if (query.includes('WorkspaceEventSubscriptions')) {
    return { workspaceEventSubscriptions: Array.from({ length: 4 }, (_, index) => workspaceEventSubscription(index)) };
  }

  if (query.includes('CreateWorkspaceEventSubscription')) {
    return { createWorkspaceEventSubscription: workspaceEventSubscription(0) };
  }

  if (query.includes('WorkspaceMajorEventSubscriptions')) {
    return {
      workspaceMajorEventSubscriptions: Array.from({ length: 5 }, (_, index) => workspaceMajorEventSubscription(index)),
    };
  }

  if (query.includes('CreateWorkspaceMajorEventSubscription')) {
    return { createWorkspaceMajorEventSubscription: workspaceMajorEventSubscription(0) };
  }

  if (query.includes('UpdateWorkspaceMajorEventSubscription')) {
    return { updateWorkspaceMajorEventSubscription: workspaceMajorEventSubscription(0) };
  }

  if (query.includes('ImportMajorEventSubscriptionsFromCsv')) {
    return {
      importMajorEventSubscriptionsFromCsv: {
        createdSubscriptionCount: 10,
        updatedSubscriptionCount: 4,
        duplicateCount: 2,
        createdPeopleCount: 2,
        failedCount: 1,
        createdPeople: people.slice(0, 2),
        failedRows: ['Linha 12: evento inexistente'],
      },
    };
  }

  if (query.includes('ListCertificateIssuableEvents')) {
    return { certificateIssuableEvents: events };
  }

  if (query.includes('ListCertificateIssuableEventGroups')) {
    return { certificateIssuableEventGroups: eventGroups };
  }

  if (query.includes('ListCertificateIssuableMajorEvents')) {
    return { certificateIssuableMajorEvents: majorEvents };
  }

  if (query.includes('ListCertificateTemplates')) {
    return { certificateTemplates: [certificateTemplate] };
  }

  if (query.includes('ListCertificateConfigs')) {
    return { certificateConfigs: [certificateConfig] };
  }

  if (query.includes('ListCertificates')) {
    return { certificates };
  }

  if (query.includes('CreateCertificateConfig') || query.includes('UpdateCertificateConfig')) {
    return { createCertificateConfig: certificateConfig, updateCertificateConfig: certificateConfig };
  }

  if (query.includes('DeleteCertificateConfig')) {
    return { deleteCertificateConfig: deletionResult('config-1') };
  }

  if (query.includes('IssueCertificateForPerson')) {
    return { issueCertificateForPerson: certificates[0] };
  }

  if (query.includes('IssueMissedCertificates')) {
    return { issueMissedCertificates: certificates };
  }

  if (query.includes('DeleteCertificate')) {
    return { deleteCertificate: deletionResult('certificate-1') };
  }

  if (query.includes('DownloadCertificate')) {
    return {
      downloadCertificate: { fileName: 'certificado.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0xLjQK' },
    };
  }

  if (query.includes('ListMergeCandidates')) {
    return {
      mergeCandidates: people.slice(0, 4).map((item, index) => ({
        id: `merge-${index + 1}`,
        personAId: item.id,
        personBId: people[(index + 1) % people.length].id,
        pairKey: `${item.id}:${people[(index + 1) % people.length].id}`,
        score: 0.92 - index * 0.05,
        matchMethod: index % 2 === 0 ? 'EMAIL' : 'NORMALIZED_NAME',
        matchValue: item.email,
        status: 'PENDING',
        resolvedById: null,
        createdAt: isoDaysFromNow(-index - 1),
        updatedAt: isoDaysFromNow(-index),
        personA: item,
        personB: people[(index + 1) % people.length],
      })),
    };
  }

  if (
    query.includes('UpdateMergeCandidate') ||
    query.includes('MergeCandidatePeople') ||
    query.includes('UndoMergeCandidatePeople')
  ) {
    return {
      updateMergeCandidate: { id: 'merge-1', status: 'REJECTED', updatedAt: now.toISOString() },
      mergeCandidatePeople: { id: 'merge-1', status: 'MERGED', updatedAt: now.toISOString() },
      undoMergeCandidatePeople: { id: 'merge-1', status: 'PENDING', updatedAt: now.toISOString() },
    };
  }

  if (query.includes('DeleteMergeCandidate')) {
    return { deleteMergeCandidate: deletionResult('merge-1') };
  }

  if (query.includes('ScanMergeCandidates')) {
    return { scanMergeCandidates: 4 };
  }

  if (query.includes('WorkspaceDashboardInsights')) {
    return {
      workspaceDashboardInsights: {
        majorEventsCount: majorEvents.length,
        eventsCount: events.length,
        peopleCount: people.length,
        pendingReceiptCount: 2,
      },
    };
  }

  return {};
}

const workspacePermissions = [
  'events:read',
  'events:write',
  'people:read',
  'people:write',
  'certificates:read',
  'certificates:write',
  'subscriptions:read',
  'subscriptions:write',
  'attendances:read',
  'attendances:write',
];

export const cacicEventosHandlers = [
  http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
    return HttpResponse.json({ data: graphqlData(body.query ?? '', body.variables ?? {}) });
  }),
  http.post('/api/auth/permissions/evaluate', () => HttpResponse.json({ permissions: workspacePermissions })),
  http.get('/api/workspace/permissions', () => HttpResponse.json({ permissions: workspacePermissions })),
  http.get('/api/major-event-receipts/admin/pending-count', () => HttpResponse.json({ pendingCount: 2 })),
  http.get('/api/major-event-receipts/admin/queue', () => HttpResponse.json(receiptQueue())),
  http.post('/api/major-event-receipts/admin/subscriptions/:subscriptionId/approve', ({ params }) =>
    HttpResponse.json({
      actionId: 'approve-action-1',
      item:
        receiptQueue().items.find((item) => item.subscriptionId === params['subscriptionId']) ??
        receiptQueue().items[0],
    }),
  ),
  http.post('/api/major-event-receipts/admin/subscriptions/:subscriptionId/reject', ({ params }) =>
    HttpResponse.json({
      actionId: 'reject-action-1',
      item:
        receiptQueue().items.find((item) => item.subscriptionId === params['subscriptionId']) ??
        receiptQueue().items[0],
    }),
  ),
  http.post('/api/major-event-receipts/admin/actions/:actionId/undo', () => HttpResponse.json(receiptQueue().items[0])),
  http.all('/api/*', () => HttpResponse.json({ ok: true })),
];
