import type {
  PublicEvent,
  PublicEventGroup,
  PublicLecturerProfile,
  PublicMajorEvent,
  PublicMajorEventPrice,
  PublicPaymentInfo,
} from '@cacic-fct/event-manager-public-contracts/types';

export const publicFixtureDate = '2026-05-21T12:00:00.000Z';
export const publicStoryFixtureDate = '2026-08-01T12:00:00.000Z';

export interface PublicStoryFixtureOptions {
  count?: number;
  includeMajorEvent?: boolean;
  includeEventGroup?: boolean;
  requiresPayment?: boolean;
  rankedSubscriptionEnabled?: boolean;
  allowSubscription?: boolean;
}

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

export function createStoryPublicMajorEvents(options: PublicStoryFixtureOptions = {}): PublicMajorEvent[] {
  return Array.from({ length: boundedStoryCount(options.count ?? 4) }, (_, index) =>
    createStoryPublicMajorEvent(index, options),
  );
}

export function createStoryPublicMajorEvent(
  index = 0,
  options: PublicStoryFixtureOptions & Partial<PublicMajorEvent> = {},
): PublicMajorEvent {
  const requiresPayment = options.requiresPayment ?? index % 2 === 0;
  const rankedSubscriptionEnabled = options.rankedSubscriptionEnabled ?? index % 2 === 0;
  const overrides = { ...options };
  delete overrides.allowSubscription;
  delete overrides.count;
  delete overrides.includeEventGroup;
  delete overrides.includeMajorEvent;
  delete overrides.requiresPayment;
  delete overrides.rankedSubscriptionEnabled;

  return createPublicMajorEvent({
    id: `major-${index + 1}`,
    name: ['CACiC 2026', 'SECOMPP', 'Semana da Computacao', 'Mostra de Projetos'][index % 4],
    emoji: ['💻', '🚀', '🎓', '🧪'][index % 4],
    startDate: storyDate(index * 3),
    endDate: storyDate(index * 3 + 2, 18),
    description: 'Grande evento com inscricoes, certificados e atividades vinculadas.',
    subscriptionStartDate: storyDate(-20, 8),
    subscriptionEndDate: storyDate(-1, 23),
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 4,
    maxUncategorizedPerAttendee: 1,
    rankedSubscriptionEnabled,
    buttonText: 'Site oficial',
    buttonLink: 'https://cacic.dev',
    contactInfo: 'eventos@example.com',
    contactType: 'EMAIL',
    isPaymentRequired: requiresPayment,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: requiresPayment ? 'Pagamento validado por comprovante.' : null,
    paymentInfo: requiresPayment
      ? createPublicPaymentInfo({
          id: `payment-${index + 1}`,
          majorEventId: `major-${index + 1}`,
        })
      : null,
    majorEventPrices: requiresPayment
      ? [
          createPublicMajorEventPrice({
            id: `price-${index + 1}`,
            tiers: [
              { id: `tier-${index + 1}-student`, name: 'Estudante', value: 2500 },
              { id: `tier-${index + 1}-community`, name: 'Comunidade externa', value: 5000 },
            ],
          }),
        ]
      : [],
    ...overrides,
  });
}

export function createStoryPublicEventGroups(options: PublicStoryFixtureOptions = {}): PublicEventGroup[] {
  return Array.from({ length: boundedStoryCount(options.count ?? 4) }, (_, index) =>
    createStoryPublicEventGroup(index),
  );
}

export function createStoryPublicEventGroup(index = 0, overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return createPublicEventGroup({
    id: `group-${index + 1}`,
    name: ['Trilha de Angular', 'Oficinas de dados', 'Palestras principais', 'Minicursos noturnos'][index % 4],
    emoji: ['🌐', '📊', '🎙️', '🌙'][index % 4],
    shouldIssueCertificate: index !== 1,
    shouldIssueCertificateForEachEvent: index % 3 === 0,
    shouldIssuePartialCertificate: index % 3 === 1,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    ...overrides,
  });
}

export function createStoryPublicEvents(options: PublicStoryFixtureOptions = {}): PublicEvent[] {
  const count = boundedStoryCount(options.count ?? 4);
  const majorEvents = options.includeMajorEvent === false ? [] : createStoryPublicMajorEvents({ ...options, count });
  const eventGroups = options.includeEventGroup === false ? [] : createStoryPublicEventGroups({ count });
  return Array.from({ length: count }, (_, index) =>
    createStoryPublicEvent(index, {
      ...options,
      majorEvent: majorEvents[index % Math.max(majorEvents.length, 1)] ?? null,
      eventGroup: eventGroups[index % Math.max(eventGroups.length, 1)] ?? null,
    }),
  );
}

export function createStoryPublicEvent(
  index = 0,
  options: PublicStoryFixtureOptions &
    Partial<PublicEvent> & {
    majorEvent?: PublicMajorEvent | null;
    eventGroup?: PublicEventGroup | null;
  } = {},
): PublicEvent {
  const optionMajorEvent = hasOwn(options, 'majorEvent') ? (options.majorEvent ?? null) : undefined;
  const optionEventGroup = hasOwn(options, 'eventGroup') ? (options.eventGroup ?? null) : undefined;
  const overrides = { ...options };
  delete overrides.count;
  delete overrides.includeEventGroup;
  delete overrides.includeMajorEvent;
  delete overrides.rankedSubscriptionEnabled;
  delete overrides.requiresPayment;
  delete overrides.majorEvent;
  delete overrides.eventGroup;

  const majorEvent =
    optionMajorEvent !== undefined
      ? optionMajorEvent
      : options.includeMajorEvent === false
        ? null
        : createStoryPublicMajorEvent(0, options);
  const eventGroup =
    optionEventGroup !== undefined
      ? optionEventGroup
      : options.includeEventGroup === false
        ? null
        : createStoryPublicEventGroup(0);

  return createPublicEvent({
    id: `event-${index + 1}`,
    name: ['Arquitetura Angular com Signals', 'APIs GraphQL seguras', 'Acessibilidade na pratica', 'Deploy observavel'][
      index % 4
    ],
    creditMinutes: index % 2 === 0 ? 120 : 90,
    startDate: storyDate(index + 1, 13),
    endDate: storyDate(index + 1, 15),
    emoji: ['🧠', '🔐', '♿', '📡'][index % 4],
    type: (['MINICURSO', 'PALESTRA', 'OTHER'] as const)[index % 3],
    description: 'Atividade de demonstracao com dados realistas para validar formularios, listas e estados.',
    shortDescription: 'Atividade pratica para Storybook.',
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: index % 2 === 0 ? 'Laboratorio 3' : 'Auditorio',
    majorEventId: majorEvent?.id ?? null,
    majorEvent,
    eventGroupId: eventGroup?.id ?? null,
    eventGroup,
    allowSubscription: options.allowSubscription ?? true,
    subscriptionStartDate: storyDate(-10, 8),
    subscriptionEndDate: storyDate(index, 23),
    slots: index % 2 === 0 ? 40 : null,
    slotsAvailable: index % 2 === 0 ? 12 : null,
    queueCount: index % 3,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: index % 2 === 0,
    onlineAttendanceStartDate: storyDate(index + 1, 12),
    onlineAttendanceEndDate: storyDate(index + 1, 17),
    publiclyVisible: true,
    youtubeCode: index % 2 === 0 ? 'dQw4w9WgXcQ' : null,
    buttonText: index % 2 === 0 ? 'Material de apoio' : null,
    buttonLink: index % 2 === 0 ? 'https://cacic.dev/material' : null,
    lecturers: [createStoryPublicLecturerProfile(index)],
    ...overrides,
  });
}

export function createStoryPublicLecturerProfile(index = 0): PublicLecturerProfile {
  return createPublicLecturerProfile({
    id: `lecturer-${index + 1}`,
    displayName: ['Ana Clara Silva', 'Bruno Santos', 'Carolina Pereira', 'Diego Almeida'][index % 4],
    biography:
      'Pesquisa e desenvolve projetos de tecnologia educacional, com foco em experiencias acessiveis para eventos academicos.',
    publishGoogleUserPicture: index % 2 === 0,
    googleUserPicture: index % 2 === 0 ? 'https://lh3.googleusercontent.com/a/storybook-lecturer' : null,
    email: ['ana@example.com', 'bruno@example.com', 'carol@example.com', 'diego@example.com'][index % 4],
    whatsapp: '+5518999999999',
  });
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, property: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function storyDate(days: number, hour = 12): string {
  const date = new Date(publicStoryFixtureDate);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function boundedStoryCount(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), 8);
}
