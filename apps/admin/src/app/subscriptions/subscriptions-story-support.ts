import { computed, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { fakerPT_BR as faker } from '@faker-js/faker';
import {
  Event,
  MajorEvent,
  Person,
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { ReceiptValidationApiService } from '../graphql/receipt-validation-api.service';
import { parseDateOnly } from '@cacic-fct/shared-utils';
import { WorkspacePermissionScope, PermissionsService } from '../permissions/permissions.service';
import { SubscriptionsService } from './subscriptions.service';
import { createAdminEvent, createAdminMajorEvent, createAdminPerson } from '../testing/admin-entity-fixtures';

const storyDateReference = new Date();

function storyDate(daysFromNow: number, hour = 12): string {
  const date = new Date(storyDateReference);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export interface StoryWorkspaceOptions {
  majorEventId?: string | null;
  selectedMajorEventSubscriptionId?: string | null;
  pendingReceiptsCount?: number;
  permissions?: WorkspacePermissionScope[];
  majorEventCount?: number;
  eventCount?: number;
  majorSubscriptionCount?: number;
  eventSubscriptionCount?: number;
  longNames?: boolean;
  sportsEvery?: number;
}

function createStoryPagination(total: number) {
  return {
    label: () => `1-${total} de ${total}`,
    hasPreviousPage: () => false,
    hasNextPage: () => false,
  };
}

export function createWorkspaceSubscriptionsStoryProviders(options: StoryWorkspaceOptions = {}) {
  const workspace = createWorkspaceSubscriptionsStoryService(options);
  const permissions = createWorkspacePermissionsStoryService(options.permissions);
  const receiptValidationApi = createReceiptValidationStoryApi(options.pendingReceiptsCount ?? 0);

  return [
    { provide: SubscriptionsService, useValue: workspace },
    { provide: PermissionsService, useValue: permissions },
    { provide: ReceiptValidationApiService, useValue: receiptValidationApi },
  ];
}

function createWorkspacePermissionsStoryService(permissions: WorkspacePermissionScope[] = defaultPermissions()) {
  const granted = signal(new Set(permissions));

  return {
    has: (scope: WorkspacePermissionScope) => granted().has(scope),
    hasAny: (scopes: WorkspacePermissionScope[]) => scopes.some((scope) => granted().has(scope)),
    hasAll: (scopes: WorkspacePermissionScope[]) => scopes.every((scope) => granted().has(scope)),
    canEdit: (...scopes: WorkspacePermissionScope[]) => scopes.every((scope) => granted().has(scope)),
    evaluateWorkspacePermissions: () => Promise.resolve(),
  } satisfies Partial<PermissionsService>;
}

function createReceiptValidationStoryApi(pendingReceiptsCount: number) {
  return {
    getPendingCount: () => of({ pendingCount: pendingReceiptsCount }),
    getQueue: () => of({ pendingCount: pendingReceiptsCount, items: [] }),
    watchQueue: () => of({ pendingCount: pendingReceiptsCount, items: [] }),
  } satisfies Partial<ReceiptValidationApiService>;
}

function createWorkspaceSubscriptionsStoryService(options: StoryWorkspaceOptions) {
  const selectedMajorEventId = options.majorEventId === undefined ? 'major-event-1' : options.majorEventId;
  const majorEventCount = clampStoryCount(options.majorEventCount ?? 4, 30);
  const eventCount = clampStoryCount(options.eventCount ?? 8, 40);
  const majorSubscriptionCount = clampStoryCount(options.majorSubscriptionCount ?? 12, 60);
  const eventSubscriptionCount = clampStoryCount(options.eventSubscriptionCount ?? 10, 60);
  faker.seed(20_260_822);
  const majorEvents = signal<MajorEvent[]>(
    Array.from({ length: majorEventCount }, (_, index) =>
      buildMajorEvent(
        `major-event-${index + 1}`,
        options.longNames
          ? `Grande evento interdisciplinar de tecnologia, ciência e extensão ${index + 1}`
          : (['Semana da Computação', 'Jornada de Dados', 'Mostra de Extensão'][index % 3] ?? 'Grande evento'),
        ['💻', '📊', '🌎'][index % 3] ?? '💻',
      ),
    ),
  );
  const eventResults = signal<Event[]>(
    Array.from({ length: eventCount }, (_, index) => ({
      ...buildEvent(
        `event-${index + 1}`,
        options.longNames
          ? `Atividade interdisciplinar de arquitetura, acessibilidade e dados ${index + 1}`
          : (['Arquitetura Angular', 'GraphQL com NestJS', 'Acessibilidade digital'][index % 3] ?? 'Atividade'),
        ['💻', '📡', '♿'][index % 3] ?? '💻',
      ),
      isSportsMatch: (options.sportsEvery ?? 3) > 0 && index % (options.sportsEvery ?? 3) === 0,
    })),
  );
  const selectedEvent = signal<Event | null>(eventResults()[0] ?? null);
  const statuses: WorkspaceMajorEventSubscription['subscriptionStatus'][] = [
    'RECEIPT_UNDER_REVIEW',
    'CONFIRMED',
    'WAITING_RECEIPT_UPLOAD',
    'REJECTED_INVALID_RECEIPT',
    'REJECTED_NO_SLOTS',
    'REJECTED_SCHEDULE_CONFLICT',
    'CANCELED',
  ];
  const majorEventSubscriptions = signal<WorkspaceMajorEventSubscription[]>(
    Array.from({ length: majorSubscriptionCount }, (_, index) =>
      buildMajorEventSubscription(
        `subscription-${index + 1}`,
        selectedMajorEventId || 'major-event-1',
        options.longNames
          ? `Maria Eduarda de ${faker.person.lastName()} ${faker.person.lastName()} — participante ${index + 1}`
          : index === 0
            ? 'Ana Oliveira'
            : index === 1
              ? 'Bruna Santos'
              : faker.person.fullName(),
        statuses[index % statuses.length] ?? 'CONFIRMED',
      ),
    ),
  );
  const selectedMajorEventSubscription = signal<WorkspaceMajorEventSubscription | null>(
    majorEventSubscriptions().find((subscription) => subscription.id === options.selectedMajorEventSubscriptionId) ??
      null,
  );
  const majorEventPaymentTiers = computed(() => {
    const tiers =
      majorEvents().find((majorEvent) => majorEvent.id === majorEventForm.controls.majorEventId.value)
        ?.majorEventPrices[0]?.tiers ?? [];
    const selectedTier = selectedMajorEventSubscription()?.paymentTier?.trim();
    if (!selectedTier || tiers.some((tier) => tier.name === selectedTier)) {
      return tiers;
    }

    return [{ id: `selected-${selectedTier}`, name: selectedTier, value: 0 }, ...tiers];
  });
  const majorEventEvents = signal<WorkspaceMajorEventSubscriptionEvent[]>(
    majorEventSubscriptions()[0]?.events ??
      eventResults()
        .filter((eventItem) => !eventItem.isSportsMatch)
        .map((eventItem, index) => ({
          eventId: eventItem.id,
          eventName: eventItem.name,
          eventEmoji: eventItem.emoji,
          eventType: eventItem.type,
          eventShortDescription: eventItem.shortDescription,
          eventStartDate: eventItem.startDate,
          eventEndDate: eventItem.endDate,
          eventLocationDescription: eventItem.locationDescription,
          eventSlots: eventItem.slots ?? null,
          availableSlots: eventItem.slots == null ? null : Math.max(eventItem.slots - 8, 0),
          projectedQueuePosition: index + 1,
          subscribed: false,
          isLecturerSubscription: false,
        })),
  );
  const eventSubscriptions = signal<WorkspaceEventSubscription[]>(
    Array.from({ length: eventSubscriptionCount }, (_, index) => ({
      id: `event-subscription-${index + 1}`,
      eventId: eventResults()[index % Math.max(eventResults().length, 1)]?.id ?? 'event-1',
      personId: `event-person-${index + 1}`,
      person: buildPerson(
        `event-person-${index + 1}`,
        options.longNames
          ? `Participante com nome extenso para validação responsiva ${index + 1}`
          : faker.person.fullName(),
      ),
      isLecturerSubscription: index % 4 === 0,
      createdAt: storyDate(-1),
      createdById: 'storybook-user',
      createdByMethod: 'ADMIN_DASHBOARD',
    })),
  );
  const selectedEventIds = signal(
    new Set(
      selectedMajorEventSubscription()
        ?.events.filter((event) => event.subscribed)
        .map((event) => event.eventId) ?? [],
    ),
  );
  const majorEventForm = new FormGroup({
    majorEventId: new FormControl(selectedMajorEventId ?? '', { nonNullable: true }),
  });
  const majorEventSubscriptionSearchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });
  const selectedMajorEventIdSignal = signal(selectedMajorEventId ?? '');
  const editMode = signal(false);
  const majorEventEditForm = new FormGroup({
    subscriptionStatus: new FormControl<SubscriptionStatus>('CONFIRMED', { nonNullable: true }),
    amountPaid: new FormControl<number | null>(1.2),
    paymentDate: new FormControl<Date | null>(parseDateOnly(storyDate(-1).slice(0, 10))),
    paymentTier: new FormControl<string | null>('Estudante'),
    imageLicenseAgreementAccepted: new FormControl(false, { nonNullable: true }),
  });
  const setMajorEventEditMode = (enabled: boolean) => {
    editMode.set(enabled);
    if (enabled) {
      majorEventEditForm.enable({ emitEvent: false });
      return;
    }
    majorEventEditForm.disable({ emitEvent: false });
  };
  setMajorEventEditMode(false);

  const service = {
    majorEvents,
    selectedEvent,
    eventSubscriptions,
    eventSubscriptionCount: () => eventSubscriptions().length,
    eventSubscriptionSearchForm: new FormGroup({
      query: new FormControl('', { nonNullable: true }),
    }),
    eventSubscriptionsPagination: createStoryPagination(eventSubscriptions().length),
    eventRegularSubscriptions: computed(() =>
      eventSubscriptions().filter((subscription) => !subscription.isLecturerSubscription),
    ),
    eventLecturerSubscriptions: computed(() =>
      eventSubscriptions().filter((subscription) => subscription.isLecturerSubscription),
    ),
    eventPersonMatches: signal<Person[]>([buildPerson('person-3', 'Katherine Johnson')]),
    eventSubscriptionForm: new FormGroup({
      eventId: new FormControl('event-1', { nonNullable: true }),
      identifierType: new FormControl('email', { nonNullable: true }),
      identifier: new FormControl('', { nonNullable: true }),
    }),
    majorEventForm,
    majorEventSubscriptionSearchForm,
    selectedMajorEvent: computed(
      () => majorEvents().find((majorEvent) => majorEvent.id === selectedMajorEventIdSignal()) ?? null,
    ),
    majorEventSportsWorkspace: signal(null),
    majorEventPersonForm: new FormGroup({
      identifierType: new FormControl('email', { nonNullable: true }),
      identifier: new FormControl('', { nonNullable: true }),
    }),
    majorEventEditForm,
    majorEventSubscriptions,
    majorEventSubscriptionCount: () => majorEventSubscriptions().length,
    majorEventSubscriptionsPagination: createStoryPagination(majorEventSubscriptions().length),
    majorEventEvents,
    selectedMajorEventSubscription,
    majorEventPaymentTiers,
    majorEventPersonMatches: signal<Person[]>([buildPerson('person-4', 'Dorothy Vaughan')]),
    selectedMajorEventPerson: signal<Person | null>(null),
    editMode,
    selectedEventIds,
    isImportingCsv: signal(false),
    selectedMajorEventEvents: computed(() => selectedMajorEventSubscription()?.events ?? majorEventEvents()),
    selectEvent: (event: Event) => {
      selectedEvent.set(event);
      return Promise.resolve();
    },
    loadEventSubscriptions: () => Promise.resolve(),
    closeLiveUpdates: () => undefined,
    previousEventSubscriptionsPage: () => Promise.resolve(),
    nextEventSubscriptionsPage: () => Promise.resolve(),
    exportEventSubscriptionsCsv: () => Promise.resolve(),
    findEventPerson: () => Promise.resolve(),
    createEventSubscription: () => Promise.resolve(),
    selectMajorEventById: (majorEventId: string): Promise<void> => {
      majorEventForm.controls.majorEventId.setValue(majorEventId);
      selectedMajorEventIdSignal.set(majorEventId);
      selectedMajorEventSubscription.set(null);
      setMajorEventEditMode(false);
      return Promise.resolve();
    },
    loadMajorEventSubscriptions: () => Promise.resolve(),
    searchMajorEventSubscriptions: () => Promise.resolve(),
    previousMajorEventSubscriptionsPage: () => Promise.resolve(),
    nextMajorEventSubscriptionsPage: () => Promise.resolve(),
    selectMajorEventSubscriptionById: (_majorEventId: string, subscriptionId: string): Promise<void> => {
      const subscription = majorEventSubscriptions().find((item) => item.id === subscriptionId) ?? null;
      selectedMajorEventSubscription.set(subscription);
      setMajorEventEditMode(false);
      majorEventEditForm.patchValue({
        subscriptionStatus: subscription?.subscriptionStatus ?? 'CONFIRMED',
        amountPaid: subscription?.amountPaid == null ? null : subscription.amountPaid / 100,
        paymentDate: parseDateOnly(subscription?.paymentDate?.slice(0, 10)),
        paymentTier: subscription?.paymentTier ?? null,
        imageLicenseAgreementAccepted: Boolean(subscription?.imageLicenseAgreementAccepted),
      });
      selectedEventIds.set(
        new Set(subscription?.events.filter((event) => event.subscribed).map((event) => event.eventId) ?? []),
      );
      return Promise.resolve();
    },
    closeMajorEventSubscriptionDetail: () => {
      selectedMajorEventSubscription.set(null);
      setMajorEventEditMode(false);
    },
    exportMajorEventSubscriptionsCsv: () => Promise.resolve(),
    startNewMajorEventSubscription: () => {
      selectedMajorEventSubscription.set(null);
      setMajorEventEditMode(true);
      majorEventEditForm.reset({
        subscriptionStatus: 'CONFIRMED',
        amountPaid: null,
        paymentDate: null,
        paymentTier: null,
        imageLicenseAgreementAccepted: false,
      });
    },
    importMajorEventSubscriptionsFromCsv: () => Promise.resolve(),
    selectMajorEventSubscription: (subscription: WorkspaceMajorEventSubscription | null) => {
      selectedMajorEventSubscription.set(subscription);
      setMajorEventEditMode(false);
      majorEventEditForm.patchValue({
        subscriptionStatus: subscription?.subscriptionStatus ?? 'CONFIRMED',
        amountPaid: subscription?.amountPaid == null ? null : subscription.amountPaid / 100,
        paymentDate: parseDateOnly(subscription?.paymentDate?.slice(0, 10)),
        paymentTier: subscription?.paymentTier ?? null,
        imageLicenseAgreementAccepted: Boolean(subscription?.imageLicenseAgreementAccepted),
      });
      selectedEventIds.set(
        new Set(subscription?.events.filter((event) => event.subscribed).map((event) => event.eventId) ?? []),
      );
    },
    enableMajorEventEdit: () => setMajorEventEditMode(true),
    cancelMajorEventSubscriptionEdit: () => setMajorEventEditMode(false),
    saveMajorEventSubscription: () => Promise.resolve(),
    findMajorEventPerson: () => Promise.resolve(),
    selectMajorEventPerson: () => undefined,
    toggleSelectedEvent: (eventId: string) => {
      if (!editMode()) {
        return;
      }
      const next = new Set(selectedEventIds());
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      selectedEventIds.set(next);
    },
    setSelectedEvent: (eventId: string, selected: boolean) => {
      if (!editMode()) {
        return;
      }
      const next = new Set(selectedEventIds());
      if (selected) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      selectedEventIds.set(next);
    },
  };

  return service as unknown as SubscriptionsService;
}

function defaultPermissions(): WorkspacePermissionScope[] {
  return ['event#read', 'major-event#read', 'subscription#read', 'subscription#update', 'receipt#read'];
}

function buildMajorEvent(id: string, name: string, emoji: string): MajorEvent {
  return createAdminMajorEvent({
    id,
    name,
    emoji,
    startDate: storyDate(1),
    endDate: storyDate(4, 21),
    isPaymentRequired: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: storyDate(-1),
    unpublishedAt: null,
    majorEventPrices: [
      {
        id: `${id}-price`,
        type: 'TIERED',
        tiers: [
          { id: `${id}-student-tier`, name: 'Estudante', value: 12000, includesSportsRegistration: false },
          {
            id: `${id}-regular-tier`,
            name: 'Comunidade externa',
            value: 18000,
            includesSportsRegistration: false,
          },
        ],
      },
    ],
    createdAt: storyDate(-4),
    updatedAt: storyDate(-1),
  });
}

function buildEvent(id: string, name: string, emoji: string): Event {
  return createAdminEvent({
    id,
    name,
    emoji,
    type: 'MINICURSO',
    startDate: storyDate(2),
    endDate: storyDate(2, 15),
    shouldCollectAttendance: true,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    allowSubscription: true,
    autoSubscribe: false,
    isOnlineAttendanceAllowed: false,
    isPubliclyListed: true,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: storyDate(-1),
    unpublishedAt: null,
    createdAt: storyDate(-4),
    updatedAt: storyDate(-1),
  });
}

function buildPerson(id: string, name: string): Person {
  return createAdminPerson({
    id,
    name,
    email: `${id}@cacic.com.br`,
    identityDocument: '123.456.789-00',
    createdAt: storyDate(-4),
    updatedAt: storyDate(-1),
  });
}

function buildMajorEventSubscription(
  id: string,
  majorEventId: string,
  personName: string,
  subscriptionStatus: WorkspaceMajorEventSubscription['subscriptionStatus'],
): WorkspaceMajorEventSubscription {
  return {
    id,
    majorEventId,
    majorEvent: buildMajorEvent(majorEventId, 'Semana da Computação', '💻'),
    personId: `${id}-person`,
    person: buildPerson(`${id}-person`, personName),
    subscriptionStatus,
    amountPaid: 120,
    paymentDate: storyDate(-1),
    paymentTier: 'Estudante',
    createdAt: storyDate(-1, 9),
    createdById: 'storybook-user',
    createdByMethod: 'ADMIN_DASHBOARD',
    imageLicenseAgreementAccepted: false,
    events: [
      {
        eventId: 'major-event-item-1',
        eventName: 'Arquitetura Angular',
        eventEmoji: '📐',
        eventType: 'MINICURSO',
        eventShortDescription: 'Projeto de interfaces para a comunidade acadêmica',
        eventStartDate: storyDate(2),
        eventEndDate: storyDate(2, 14),
        eventLocationDescription: 'Laboratório 1',
        eventSlots: 40,
        availableSlots: 12,
        projectedQueuePosition: 1,
        subscribed: true,
        isLecturerSubscription: false,
      },
      {
        eventId: 'major-event-item-2',
        eventName: 'GraphQL com NestJS',
        eventEmoji: '📡',
        eventType: 'PALESTRA',
        eventShortDescription: 'Inscrições e consultas de dados com GraphQL',
        eventStartDate: storyDate(3),
        eventEndDate: storyDate(3, 13),
        eventLocationDescription: 'Auditório principal',
        eventSlots: 30,
        availableSlots: 0,
        projectedQueuePosition: 5,
        subscribed: true,
        isLecturerSubscription: true,
      },
    ],
  };
}

function clampStoryCount(value: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
