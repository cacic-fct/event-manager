import type {
  PublicEvent,
  PublicEventGroup,
  PublicLecturerProfile,
  PublicMajorEvent,
  PublicMajorEventPrice,
  PublicPaymentInfo,
} from '@cacic-fct/event-manager-public-contracts/types';

export const publicFixtureDate = '2026-05-21T12:00:00.000Z';

export function createPublicPaymentInfo(overrides: Partial<PublicPaymentInfo> = {}): PublicPaymentInfo {
  return {
    id: 'payment-1',
    bankName: 'Banco Storybook',
    agency: '0001',
    account: '12345-6',
    holder: 'CACiC FCT',
    document: '12.345.678/0001-90',
    pixKey: 'pagamentos@example.com',
    pixCity: 'PRESIDENTE PRUDENTE',
    majorEventId: 'major-1',
    ...overrides,
  };
}

export function createPublicMajorEventPrice(overrides: Partial<PublicMajorEventPrice> = {}): PublicMajorEventPrice {
  return {
    id: 'price-1',
    type: 'TIERED',
    tiers: [
      { id: 'tier-student', name: 'Estudante', value: 2500 },
      { id: 'tier-community', name: 'Comunidade', value: 5000 },
    ],
    ...overrides,
  };
}

export function createPublicMajorEvent(overrides: Partial<PublicMajorEvent> = {}): PublicMajorEvent {
  return {
    id: 'major-1',
    name: 'CACiC Storybook',
    emoji: 'event',
    startDate: '2026-05-20T12:00:00.000Z',
    endDate: '2026-05-23T21:00:00.000Z',
    description: 'Evento de demonstracao para Storybook.',
    subscriptionStartDate: '2026-05-01T12:00:00.000Z',
    subscriptionEndDate: '2026-05-19T21:00:00.000Z',
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 8,
    maxUncategorizedPerAttendee: 1,
    rankedSubscriptionEnabled: false,
    buttonText: 'Site oficial',
    buttonLink: 'https://example.com',
    contactInfo: 'eventos@example.com',
    contactType: 'EMAIL',
    isPaymentRequired: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: null,
    paymentInfo: null,
    majorEventPrices: [],
    ...overrides,
  };
}

export function createPublicEventGroup(overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return {
    id: 'group-1',
    name: 'Trilha Frontend',
    emoji: 'group',
    shouldIssueCertificate: true,
    shouldIssueCertificateForEachEvent: true,
    shouldIssuePartialCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    ...overrides,
  };
}

export function createPublicLecturerProfile(overrides: Partial<PublicLecturerProfile> = {}): PublicLecturerProfile {
  return {
    id: 'lecturer-1',
    displayName: 'Ada Lovelace',
    biography: null,
    publishGoogleUserPicture: false,
    googleUserPicture: null,
    email: 'ada@example.com',
    whatsapp: '+5518999999999',
    ...overrides,
  };
}

export function createPublicEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  const majorEvent = hasOwn(overrides, 'majorEvent') ? (overrides.majorEvent ?? null) : null;
  const eventGroup = hasOwn(overrides, 'eventGroup') ? (overrides.eventGroup ?? null) : null;

  return {
    id: 'event-1',
    name: 'Arquitetura Angular com Signals',
    creditMinutes: 120,
    startDate: publicFixtureDate,
    endDate: '2026-05-21T14:00:00.000Z',
    emoji: 'event',
    type: 'MINICURSO',
    description: 'Uma sessao pratica com componentes standalone.',
    shortDescription: 'Signals na pratica',
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'Laboratorio 01',
    majorEventId: majorEvent?.id ?? overrides.majorEventId ?? null,
    majorEvent,
    eventGroupId: eventGroup?.id ?? overrides.eventGroupId ?? null,
    eventGroup,
    allowSubscription: true,
    subscriptionStartDate: '2026-05-01T12:00:00.000Z',
    subscriptionEndDate: '2026-05-21T16:00:00.000Z',
    slots: 40,
    slotsAvailable: 12,
    queueCount: 3,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: true,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    lecturers: [],
    ...overrides,
  };
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, property: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, property);
}
