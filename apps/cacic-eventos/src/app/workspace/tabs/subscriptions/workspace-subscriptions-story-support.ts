import { computed, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import {
  Event,
  MajorEvent,
  Person,
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '../../../graphql/models';
import { ReceiptValidationApiService } from '../../../graphql/receipt-validation-api.service';
import {
  WorkspacePermissionScope,
  WorkspacePermissionsService,
} from '../../../shared/services/workspace-permissions.service';
import { WorkspaceSubscriptionsService } from '../../../shared/services/workspace-subscriptions.service';

interface StoryWorkspaceOptions {
  majorEventId?: string;
  pendingReceiptsCount?: number;
  permissions?: WorkspacePermissionScope[];
}

export function createWorkspaceSubscriptionsStoryProviders(options: StoryWorkspaceOptions = {}) {
  const workspace = createWorkspaceSubscriptionsStoryService(options);
  const permissions = createWorkspacePermissionsStoryService(options.permissions);
  const receiptValidationApi = createReceiptValidationStoryApi(options.pendingReceiptsCount ?? 0);

  return [
    { provide: WorkspaceSubscriptionsService, useValue: workspace },
    { provide: WorkspacePermissionsService, useValue: permissions },
    { provide: ReceiptValidationApiService, useValue: receiptValidationApi },
  ];
}

function createWorkspacePermissionsStoryService(permissions: WorkspacePermissionScope[] = defaultPermissions()) {
  const granted = signal(new Set(permissions));

  return {
    has: (scope: WorkspacePermissionScope) => granted().has(scope),
    canEdit: (...scopes: WorkspacePermissionScope[]) => scopes.every((scope) => granted().has(scope)),
    evaluateWorkspacePermissions: () => Promise.resolve(),
  } satisfies Partial<WorkspacePermissionsService>;
}

function createReceiptValidationStoryApi(pendingReceiptsCount: number) {
  return {
    getPendingCount: () => of({ pendingCount: pendingReceiptsCount }),
    getQueue: () => of({ pendingCount: pendingReceiptsCount, items: [] }),
  } satisfies Partial<ReceiptValidationApiService>;
}

function createWorkspaceSubscriptionsStoryService(options: StoryWorkspaceOptions) {
  const selectedMajorEventId = options.majorEventId ?? 'major-event-1';
  const majorEvents = signal<MajorEvent[]>([
    buildMajorEvent('major-event-1', 'Semana da Computação', '💻'),
    buildMajorEvent('major-event-2', 'Jornada de Dados', '📊'),
  ]);
  const eventResults = signal<Event[]>([buildEvent('event-1', 'Arquitetura Angular', '💻')]);
  const selectedEvent = signal<Event | null>(eventResults()[0] ?? null);
  const majorEventSubscriptions = signal<WorkspaceMajorEventSubscription[]>([
    buildMajorEventSubscription('subscription-1', selectedMajorEventId, 'Ada Lovelace', 'RECEIPT_UNDER_REVIEW'),
    buildMajorEventSubscription('subscription-2', selectedMajorEventId, 'Grace Hopper', 'CONFIRMED'),
  ]);
  const selectedMajorEventSubscription = signal<WorkspaceMajorEventSubscription | null>(majorEventSubscriptions()[0]);
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
  const majorEventEvents = signal<WorkspaceMajorEventSubscriptionEvent[]>(majorEventSubscriptions()[0]?.events ?? []);
  const eventSubscriptions = signal<WorkspaceEventSubscription[]>([
    {
      id: 'event-subscription-1',
      eventId: 'event-1',
      personId: 'person-1',
      person: buildPerson('person-1', 'Ada Lovelace'),
      isLecturerSubscription: false,
      createdAt: '2026-05-20T12:00:00.000Z',
      createdById: 'storybook-user',
      createdByMethod: 'ADMIN_DASHBOARD',
    },
  ]);
  const selectedEventIds = signal(new Set(['major-event-item-1']));
  const majorEventForm = new FormGroup({
    majorEventId: new FormControl(selectedMajorEventId, { nonNullable: true }),
  });
  const editMode = signal(false);

  const service = {
    majorEvents,
    eventFiltersForm: new FormGroup({
      startDateFrom: new FormControl('', { nonNullable: true }),
      startDateTo: new FormControl('', { nonNullable: true }),
      isInGroup: new FormControl('ALL', { nonNullable: true }),
      isInMajorEvent: new FormControl('ALL', { nonNullable: true }),
      query: new FormControl('', { nonNullable: true }),
    }),
    eventResults,
    selectedEvent,
    eventSubscriptions,
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
    majorEventPersonForm: new FormGroup({
      identifierType: new FormControl('email', { nonNullable: true }),
      identifier: new FormControl('', { nonNullable: true }),
    }),
    majorEventEditForm: new FormGroup({
      subscriptionStatus: new FormControl<SubscriptionStatus>('CONFIRMED', { nonNullable: true }),
      amountPaid: new FormControl<number | null>(120),
      paymentDate: new FormControl<string | null>('2026-05-19'),
      paymentTier: new FormControl<string | null>('Estudante'),
    }),
    majorEventSubscriptions,
    majorEventEvents,
    selectedMajorEventSubscription,
    majorEventPaymentTiers,
    majorEventPersonMatches: signal<Person[]>([buildPerson('person-4', 'Dorothy Vaughan')]),
    selectedMajorEventPerson: signal<Person | null>(null),
    editMode,
    selectedEventIds,
    isImportingCsv: signal(false),
    selectedMajorEventEvents: computed(() => selectedMajorEventSubscription()?.events ?? majorEventEvents()),
    searchEvents: () => Promise.resolve(),
    resetEventFilters: () => Promise.resolve(),
    selectEvent: (event: Event) => {
      selectedEvent.set(event);
      return Promise.resolve();
    },
    loadEventSubscriptions: () => Promise.resolve(),
    exportEventSubscriptionsCsv: () => Promise.resolve(),
    findEventPerson: () => Promise.resolve(),
    createEventSubscription: () => Promise.resolve(),
    selectMajorEventById: (majorEventId: string): Promise<void> => {
      majorEventForm.controls.majorEventId.setValue(majorEventId);
      return Promise.resolve();
    },
    loadMajorEventSubscriptions: () => Promise.resolve(),
    exportMajorEventSubscriptionsCsv: () => Promise.resolve(),
    startNewMajorEventSubscription: () => {
      selectedMajorEventSubscription.set(null);
      editMode.set(true);
    },
    importMajorEventSubscriptionsFromCsv: () => Promise.resolve(),
    selectMajorEventSubscription: (subscription: WorkspaceMajorEventSubscription | null) => {
      selectedMajorEventSubscription.set(subscription);
      selectedEventIds.set(
        new Set(subscription?.events.filter((event) => event.subscribed).map((event) => event.eventId) ?? []),
      );
    },
    enableMajorEventEdit: () => editMode.set(true),
    saveMajorEventSubscription: () => Promise.resolve(),
    findMajorEventPerson: () => Promise.resolve(),
    selectMajorEventPerson: () => undefined,
    toggleSelectedEvent: (eventId: string) => {
      const next = new Set(selectedEventIds());
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      selectedEventIds.set(next);
    },
    setSelectedEvent: (eventId: string, selected: boolean) => {
      const next = new Set(selectedEventIds());
      if (selected) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      selectedEventIds.set(next);
    },
  };

  return service as unknown as WorkspaceSubscriptionsService;
}

function defaultPermissions(): WorkspacePermissionScope[] {
  return [
    'event#read',
    'major-event#read',
    'person#read',
    'subscription#read',
    'subscription#edit',
    'validate-receipt:read',
  ];
}

function buildMajorEvent(id: string, name: string, emoji: string): MajorEvent {
  return {
    id,
    name,
    emoji,
    startDate: '2026-06-01T12:00:00.000Z',
    endDate: '2026-06-05T21:00:00.000Z',
    isPaymentRequired: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    majorEventPrices: [
      {
        id: `${id}-price`,
        type: 'TIERED',
        tiers: [
          { id: `${id}-student-tier`, name: 'Estudante', value: 12000 },
          { id: `${id}-regular-tier`, name: 'Comunidade externa', value: 18000 },
        ],
      },
    ],
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-20T12:00:00.000Z',
  };
}

function buildEvent(id: string, name: string, emoji: string): Event {
  return {
    id,
    name,
    emoji,
    type: 'MINICURSO',
    startDate: '2026-06-02T12:00:00.000Z',
    endDate: '2026-06-02T15:00:00.000Z',
    shouldCollectAttendance: true,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    allowSubscription: true,
    autoSubscribe: false,
    isOnlineAttendanceAllowed: false,
    publiclyVisible: true,
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-20T12:00:00.000Z',
  };
}

function buildPerson(id: string, name: string): Person {
  return {
    id,
    name,
    email: `${id}@cacic.dev.br`,
    identityDocument: '123.456.789-00',
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-20T12:00:00.000Z',
  };
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
    paymentDate: '2026-05-19T12:00:00.000Z',
    paymentTier: 'Estudante',
    createdAt: '2026-05-18T12:00:00.000Z',
    createdById: 'storybook-user',
    createdByMethod: 'ADMIN_DASHBOARD',
    events: [
      {
        eventId: 'major-event-item-1',
        eventName: 'Arquitetura Angular',
        eventStartDate: '2026-06-02T12:00:00.000Z',
        subscribed: true,
        isLecturerSubscription: false,
      },
      {
        eventId: 'major-event-item-2',
        eventName: 'GraphQL com NestJS',
        eventStartDate: '2026-06-03T12:00:00.000Z',
        subscribed: false,
        isLecturerSubscription: false,
      },
    ],
  };
}
