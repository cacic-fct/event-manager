import { FormBuilder } from '@angular/forms';
import type {
  AttendanceCategory,
  AttendanceCurrentAssessment,
  Event,
  EventAttendanceScannerFeedItem,
  MajorEvent,
  MajorEventUserAttendance,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { fn } from 'storybook/test';
import { AttendancesService } from './attendances.service';

export interface AttendanceWorkspaceStoryControls {
  eventCount: number;
  attendanceCount: number;
  explicitAbsenceCount: number;
  implicitAbsenceCount: number;
  offlineSubmissionCount: number;
  selectedEvent: boolean;
  sportsEventCount: number;
  frozenEvent: boolean;
  majorEventPersonCount: number;
  attendedActivitiesPerPerson: number;
  selectedMajorEventPerson: boolean;
  longNames: boolean;
}

export const attendanceWorkspaceStoryDefaultControls: AttendanceWorkspaceStoryControls = {
  eventCount: 8,
  attendanceCount: 16,
  explicitAbsenceCount: 3,
  implicitAbsenceCount: 4,
  offlineSubmissionCount: 5,
  selectedEvent: true,
  sportsEventCount: 3,
  frozenEvent: false,
  majorEventPersonCount: 12,
  attendedActivitiesPerPerson: 4,
  selectedMajorEventPerson: true,
  longNames: false,
};

export const attendanceWorkspaceStoryControlArgTypes = {
  eventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
  attendanceCount: { control: { type: 'range', min: 0, max: 80, step: 1 } },
  explicitAbsenceCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
  implicitAbsenceCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
  offlineSubmissionCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
  selectedEvent: { control: 'boolean' },
  sportsEventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
  frozenEvent: { control: 'boolean' },
  majorEventPersonCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
  attendedActivitiesPerPerson: { control: { type: 'range', min: 0, max: 12, step: 1 } },
  selectedMajorEventPerson: { control: 'boolean' },
  longNames: { control: 'boolean' },
} as const;

export function createAttendanceWorkspaceStoryController() {
  let controls = attendanceWorkspaceStoryDefaultControls;

  return {
    render: (args: AttendanceWorkspaceStoryControls) => {
      controls = { ...attendanceWorkspaceStoryDefaultControls, ...args };
      return { props: {} };
    },
    provider: {
      provide: AttendancesService,
      useFactory: (formBuilder: FormBuilder) => createAttendanceWorkspaceMock(() => controls, formBuilder),
      deps: [FormBuilder],
    },
  };
}

function createAttendanceWorkspaceMock(
  getControls: () => AttendanceWorkspaceStoryControls,
  formBuilder: FormBuilder,
): AttendancesService {
  const events = () => createEvents(getControls());
  const selectedEvent = () => (getControls().selectedEvent ? (events()[0] ?? null) : null);
  const attendances = () => createAttendances(getControls(), selectedEvent());
  const explicitAbsences = () => createExplicitAbsences(getControls(), selectedEvent());
  const majorAttendances = () => createMajorEventAttendances(getControls());
  const selectedMajorAttendance = () =>
    getControls().selectedMajorEventPerson ? (majorAttendances()[0] ?? null) : null;
  const categories: AttendanceCategory[] = ['REGULAR', 'NON_SUBSCRIBED', 'NON_PAYING', 'UNKNOWN'];

  const attendanceForm = formBuilder.nonNullable.group({
    eventId: ['event-story-1'],
    identifierType: ['userId'],
    identifier: [''],
  });
  const majorEventAttendanceForm = formBuilder.nonNullable.group({ majorEventId: ['major-event-story'] });

  const mock = {
    majorEvents: () => [createMajorEvent()],
    attendanceEventFiltersForm: formBuilder.group({
      startDateFrom: formBuilder.control<Date | null>(null),
      startDateUntil: formBuilder.control<Date | null>(null),
      isInGroup: formBuilder.nonNullable.control('ALL'),
      isInMajorEvent: formBuilder.nonNullable.control('ALL'),
      query: formBuilder.nonNullable.control(''),
    }),
    attendanceEventResults: events,
    attendanceEventResultsPagination: createPagination(() => events().length),
    selectedAttendanceEvent: selectedEvent,
    attendancePersonMatches: () => createPeople(3),
    attendances,
    explicitAbsences,
    implicitAbsences: (): EventAttendanceScannerFeedItem[] =>
      createPeople(clamp(getControls().implicitAbsenceCount, 20)).map((person, index) => ({
        personId: person.id,
        eventId: selectedEvent()?.id ?? 'event-story-1',
        fullName: person.name,
        subscriptionStatus: index % 2 === 0 ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD',
      })),
    attendanceTotalCount: () => attendances().length + explicitAbsences().length,
    attendancesPagination: createPagination(() => attendances().length),
    offlineAttendanceSubmissions: () => createOfflineSubmissions(getControls(), selectedEvent()),
    attendanceGroups: () =>
      categories
        .map((category) => ({
          category,
          label: categoryLabel(category),
          description: categoryDescription(category),
          attendances: attendances().filter((item) => item.category === category),
        }))
        .filter((group) => group.attendances.length > 0),
    majorEventUserAttendances: majorAttendances,
    majorEventUserAttendancesPagination: createPagination(() => majorAttendances().length),
    majorEventUserAttendanceGroups: () =>
      categories
        .map((category) => ({
          category,
          label: categoryLabel(category),
          description: categoryDescription(category),
          attendances: majorAttendances().filter((item) =>
            item.attendances.some((attendance) => attendance.attended && attendance.category === category),
          ),
        }))
        .filter((group) => group.attendances.length > 0),
    selectedMajorEventUserAttendance: selectedMajorAttendance,
    selectedMajorEventAttendances: () =>
      selectedMajorAttendance()?.attendances.filter((attendance) => attendance.attended) ?? [],
    isImportingCsv: () => false,
    attendanceForm,
    majorEventAttendanceForm,
    searchAttendanceEvents: fn(async () => undefined),
    resetAttendanceEventFilters: fn(async () => undefined),
    previousAttendanceEventResultsPage: fn(async () => undefined),
    nextAttendanceEventResultsPage: fn(async () => undefined),
    selectAttendanceEvent: fn(async () => undefined),
    selectAttendanceEventById: fn(async () => undefined),
    findAttendancePerson: fn(async () => undefined),
    registerAttendance: fn(async () => undefined),
    scanAttendance: fn(async () => undefined),
    importAttendancesFromCsv: fn(async () => undefined),
    loadAttendances: fn(async () => undefined),
    closeAttendanceLiveStream: fn(() => undefined),
    exportEventAttendancesCsv: fn(async () => undefined),
    showAttendanceInfo: fn(() => undefined),
    deleteAttendance: fn(async () => undefined),
    previousAttendancesPage: fn(async () => undefined),
    nextAttendancesPage: fn(async () => undefined),
    approveAllOfflineAttendanceSubmissions: fn(async () => undefined),
    rejectAllOfflineAttendanceSubmissions: fn(async () => undefined),
    inspectOfflineAttendanceSubmission: fn(async () => undefined),
    editOfflineAttendanceSubmission: fn(async () => undefined),
    approveOfflineAttendanceSubmission: fn(async () => undefined),
    rejectOfflineAttendanceSubmission: fn(async () => undefined),
    canApproveOfflineAttendanceSubmission: (submission: { resolutionError?: string | null }) =>
      !submission.resolutionError,
    offlineSubmissionIssueLabel: (issue: string | null | undefined) =>
      issue === 'LOCATION_MISSING'
        ? 'Sem localização'
        : issue === 'DUPLICATE_ATTENDANCE'
          ? 'Presença duplicada'
          : 'Revisão manual',
    loadMajorEventUserAttendancesFromFirstPage: fn(async () => undefined),
    previousMajorEventUserAttendancesPage: fn(async () => undefined),
    nextMajorEventUserAttendancesPage: fn(async () => undefined),
    selectMajorEventAttendancesById: fn(async () => undefined),
    selectMajorEventUserAttendance: fn(() => undefined),
    getAttendanceCategoryLabel: categoryLabel,
    getAttendanceCategoryHistoricalExplanation: (category: AttendanceCategory) =>
      category === 'UNKNOWN' ? 'Registro anterior à classificação automática.' : null,
    getAttendanceCurrentAssessmentLabel: currentAssessmentLabel,
    getMajorEventCurrentAssessmentLabel: (attendance: MajorEventUserAttendance) => {
      const assessments = [
        ...new Set(
          attendance.attendances
            .filter((eventAttendance) => eventAttendance.attended && eventAttendance.category === 'UNKNOWN')
            .map((eventAttendance) => eventAttendance.currentAssessment)
            .filter((assessment): assessment is AttendanceCurrentAssessment => Boolean(assessment)),
        ),
      ];
      return assessments.length === 1 ? currentAssessmentLabel(assessments[0]) : null;
    },
  };

  return mock as unknown as AttendancesService;
}

function createEvents(controls: AttendanceWorkspaceStoryControls): Event[] {
  faker.seed(20_260_819);
  const count = clamp(controls.eventCount, 30);
  const sportsCount = clamp(controls.sportsEventCount, count);

  return Array.from({ length: count }, (_, index) => {
    const now = new Date();
    const startDate = new Date(now.getTime() + index * 90 * 60_000);
    const frozenDate = new Date(now.getFullYear(), now.getMonth() - 4, 1);
    const name = controls.longNames
      ? `Atividade interdisciplinar de tecnologia, ciência, extensão e acessibilidade ${index + 1}`
      : ['Arquitetura Angular com Signals', 'Acessibilidade em produtos digitais', 'Robótica para a comunidade'][
          index % 3
        ];
    return {
      id: `event-story-${index + 1}`,
      name,
      startDate: startDate.toISOString(),
      endDate: new Date(startDate.getTime() + 75 * 60_000).toISOString(),
      createdAt: (controls.frozenEvent && index === 0 ? frozenDate : now).toISOString(),
      updatedAt: now.toISOString(),
      emoji: ['🧠', '♿', '🤖'][index % 3],
      type: ['MINICURSO', 'PALESTRA', 'OTHER'][index % 3] as Event['type'],
      isSportsMatch: index < sportsCount,
      allowSubscription: true,
      autoSubscribe: false,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldCollectAttendance: true,
      shouldAllowOralAttendance: true,
      isOnlineAttendanceAllowed: true,
      isPubliclyListed: true,
      displayLecturerProfile: true,
      publicationState: 'PUBLISHED',
    };
  });
}

function createAttendances(controls: AttendanceWorkspaceStoryControls, event: Event | null) {
  const people = createPeople(clamp(controls.attendanceCount, 80), controls.longNames);
  const categories: AttendanceCategory[] = ['REGULAR', 'NON_SUBSCRIBED', 'NON_PAYING', 'UNKNOWN'];
  const now = new Date();
  return people.map((person, index) => ({
    eventId: event?.id ?? 'event-story-1',
    eventName: event?.name ?? 'Evento de demonstração',
    personId: person.id,
    personName: person.name,
    person,
    attendedAt: new Date(now.getTime() - index * 8 * 60_000).toISOString(),
    createdAt: now.toISOString(),
    createdByMethod: ['SCANNER', 'MANUAL_INPUT', 'CSV_IMPORT', 'ONLINE_CODE'][index % 4],
    category: categories[index % categories.length],
    currentAssessment:
      categories[index % categories.length] === 'UNKNOWN' ? 'ACTIVITY_SUBSCRIPTION_MISSING' : undefined,
    status: 'PRESENT' as const,
  }));
}

function createExplicitAbsences(controls: AttendanceWorkspaceStoryControls, event: Event | null) {
  const now = new Date();
  return createPeople(clamp(controls.explicitAbsenceCount, 20), controls.longNames).map((person) => ({
    eventId: event?.id ?? 'event-story-1',
    eventName: event?.name ?? 'Evento de demonstração',
    personId: `absent-${person.id}`,
    personName: person.name,
    person,
    attendedAt: now.toISOString(),
    createdAt: now.toISOString(),
    createdByMethod: 'ORAL_CALL',
    category: 'REGULAR' as const,
    status: 'ABSENT' as const,
  }));
}

function createOfflineSubmissions(controls: AttendanceWorkspaceStoryControls, event: Event | null) {
  const issues = ['LOCATION_MISSING', 'DUPLICATE_ATTENDANCE', 'UNKNOWN'] as const;
  return createPeople(clamp(controls.offlineSubmissionCount, 30), controls.longNames).map((person, index) => ({
    id: `offline-story-${index + 1}`,
    clientId: `client-story-${index + 1}`,
    eventId: event?.id ?? 'event-story-1',
    eventName: event?.name ?? 'Evento de demonstração',
    personId: person.id,
    person,
    personName: person.name,
    status: 'PENDING' as const,
    createdByMethod: 'SCANNER' as const,
    collectedAt: new Date(Date.now() - index * 60_000).toISOString(),
    submittedById: 'storybook-uploader',
    submittedByFullName: 'Equipe de sincronização',
    submittedAt: new Date().toISOString(),
    resolutionIssue: issues[index % issues.length],
    resolutionError: index % 4 === 0 ? 'Requer confirmação manual.' : null,
  }));
}

function createMajorEventAttendances(controls: AttendanceWorkspaceStoryControls): MajorEventUserAttendance[] {
  const people = createPeople(clamp(controls.majorEventPersonCount, 50), controls.longNames);
  const activityCount = clamp(controls.attendedActivitiesPerPerson, 12);
  const categories: AttendanceCategory[] = ['REGULAR', 'NON_SUBSCRIBED', 'NON_PAYING', 'UNKNOWN'];
  return people.map((person, personIndex) => ({
    majorEventId: 'major-event-story',
    subscriptionId: `major-subscription-${personIndex + 1}`,
    personId: person.id,
    person,
    subscriptionStatus: 'CONFIRMED',
    amountPaid: personIndex % 3 === 0 ? null : 2_500,
    attendances: Array.from({ length: Math.max(activityCount, 1) }, (_, eventIndex) => ({
      eventId: `major-event-activity-${eventIndex + 1}`,
      eventName: `Atividade ${eventIndex + 1} do grande evento`,
      eventEmoji: ['🧠', '♿', '🤖'][eventIndex % 3],
      eventStartDate: new Date(Date.now() + eventIndex * 60 * 60_000).toISOString(),
      attended: eventIndex < activityCount,
      attendedAt: eventIndex < activityCount ? new Date().toISOString() : null,
      category: categories[(personIndex + eventIndex) % categories.length],
      currentAssessment:
        categories[(personIndex + eventIndex) % categories.length] === 'UNKNOWN'
          ? 'ACTIVITY_SUBSCRIPTION_MISSING'
          : undefined,
    })),
  }));
}

function createPeople(count: number, longNames = false): Person[] {
  faker.seed(20_260_820 + count);
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({
    id: `person-story-${index + 1}`,
    name: longNames
      ? `Maria Eduarda de ${faker.person.lastName()} ${faker.person.lastName()} — representante da comunidade ${index + 1}`
      : faker.person.fullName(),
    email: faker.internet.email(),
    createdAt: now,
    updatedAt: now,
  }));
}

function createMajorEvent(): MajorEvent {
  const now = new Date();
  return {
    id: 'major-event-story',
    name: 'CACiC Storybook',
    emoji: '💻',
    startDate: now.toISOString(),
    endDate: new Date(now.getTime() + 3 * 24 * 60 * 60_000).toISOString(),
    isPaymentRequired: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    majorEventPrices: [],
    publicationState: 'PUBLISHED',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function createPagination(getCount: () => number) {
  return {
    label: () => (getCount() === 0 ? '0' : `1–${getCount()} de ${getCount()}`),
    hasPreviousPage: () => false,
    hasNextPage: () => getCount() >= 20,
    pageIndex: () => 0,
  };
}

function categoryLabel(category: AttendanceCategory): string {
  return {
    REGULAR: 'Regulares',
    NON_SUBSCRIBED: 'Sem inscrição na atividade',
    NON_PAYING: 'Sem pagamento',
    UNKNOWN: 'Indefinidas',
  }[category];
}

function categoryDescription(category: AttendanceCategory): string {
  return {
    REGULAR: 'Presenças esperadas para inscrição e pagamento atuais.',
    NON_SUBSCRIBED: 'Presenças em atividades com inscrição obrigatória.',
    NON_PAYING: 'Presenças em grande evento pago sem pagamento confirmado.',
    UNKNOWN: 'Registros anteriores à classificação automática. A situação atual aparece em cada presença.',
  }[category];
}

function currentAssessmentLabel(assessment: AttendanceCurrentAssessment | null | undefined): string | null {
  switch (assessment) {
    case 'ACTIVITY_SUBSCRIPTION_MISSING':
      return 'Sem inscrição ativa na atividade.';
    case 'MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT':
      return 'Pagamento do grande evento aguardando comprovante.';
    case 'MAJOR_EVENT_PAYMENT_UNDER_REVIEW':
      return 'Comprovante de pagamento do grande evento em análise.';
    case 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED':
      return 'Pagamento do grande evento não confirmado.';
    case 'REQUIREMENTS_CURRENTLY_MET':
      return 'Requisitos atuais atendidos.';
    case null:
    case undefined:
      return null;
  }
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
