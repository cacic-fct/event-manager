import type {
  CertificateConfig,
  CertificateConfigInput,
  CertificateTemplate,
  Event,
  EventGroup,
  EventInput,
  MajorEvent,
  MajorEventInput,
  Person,
  PlacePreset,
} from '../graphql/models';

export const adminFixtureDate = '2026-05-21T12:00:00.000Z';

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
