import { computed, inject, signal, type Provider } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import {
  createStoryPublicEventGroups,
  createStoryPublicEvents,
  createStoryPublicMajorEvents,
  publicStoryFixtureDate,
} from '@cacic-fct/event-manager-public-testing';
import type { PublicEvent, PublicEventGroup, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { Permission, type Permission as PermissionScope } from '@cacic-fct/shared-permissions';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { applicationConfig, type Decorator } from '@storybook/angular';
import type {
  Event,
  EventDraft,
  EventGroup,
  EventSummary,
  MajorEvent,
  Person,
  PlacePreset,
} from '@cacic-fct/event-manager-admin-contracts';
import { createWorkspaceListPagination } from '../pagination/list-pagination';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { EventGroupsService } from '../event-groups/event-groups.service';
import { EventsService } from '../events/events.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { PermissionsService } from '../permissions/permissions.service';

export type PageStoryMode = 'populated' | 'empty' | 'readonly' | 'loading' | 'drafts';

export interface PageStoryArgs {
  mode: PageStoryMode;
  itemCount: number;
  selectedIndex: number;
  publicationState: Event['publicationState'];
  longContent: boolean;
  sportsEvery: number;
  frozenSelected: boolean;
  requiresPayment: boolean;
  coordinates: boolean;
  certificateMode: 'mixed' | 'all' | 'none';
}

export const defaultPageStoryArgs: PageStoryArgs = {
  mode: 'populated',
  itemCount: 4,
  selectedIndex: 0,
  publicationState: 'PUBLISHED',
  longContent: false,
  sportsEvery: 3,
  frozenSelected: false,
  requiresPayment: true,
  coordinates: true,
  certificateMode: 'mixed',
};

export const pageStoryArgTypes = {
  mode: { control: 'select', options: ['populated', 'empty', 'readonly', 'loading', 'drafts'] },
  itemCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
  selectedIndex: { control: { type: 'range', min: 0, max: 29, step: 1 } },
  publicationState: { control: 'select', options: ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'UNPUBLISHED'] },
  longContent: { control: 'boolean' },
  sportsEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  frozenSelected: { control: 'boolean' },
  requiresPayment: { control: 'boolean' },
  coordinates: { control: 'boolean' },
  certificateMode: { control: 'select', options: ['mixed', 'all', 'none'] },
} as const;

const storyNow = publicStoryFixtureDate;
const permissions: PermissionScope[] = [
  Permission.Event.Read,
  Permission.Event.Create,
  Permission.Event.Update,
  Permission.Event.Delete,
  Permission.EventLecturer.Create,
  Permission.EventLecturer.Delete,
  Permission.EventAttendanceCollector.Create,
  Permission.EventAttendanceCollector.Delete,
  Permission.EventGroup.Read,
  Permission.EventGroup.Create,
  Permission.EventGroup.Update,
  Permission.EventGroup.Delete,
  Permission.MajorEvent.Read,
  Permission.MajorEvent.Create,
  Permission.MajorEvent.Update,
  Permission.MajorEvent.Delete,
  Permission.Person.Read,
  Permission.Person.Create,
  Permission.Frozen.Update,
  Permission.Frozen.Delete,
];

export function createPageStoryProviders(args: PageStoryArgs): Provider[] {
  return [
    {
      provide: PermissionsService,
      useValue: createPermissionsStoryService(args.mode !== 'readonly'),
    },
    {
      provide: AuditLogService,
      useValue: {
        openHistory: () => undefined,
        openEventAttendanceHistory: () => undefined,
      },
    },
    {
      provide: MajorEventsService,
      useFactory: () => createMajorEventsStoryService(inject(FormBuilder), args),
    },
    {
      provide: EventGroupsService,
      useFactory: () => createEventGroupsStoryService(inject(FormBuilder), args),
    },
    {
      provide: EventsService,
      useFactory: () => createEventsStoryService(inject(FormBuilder), args),
    },
  ];
}

export const withPageStoryProviders: Decorator<PageStoryArgs> = (story, context) =>
  applicationConfig({
    providers: createPageStoryProviders({
      ...defaultPageStoryArgs,
      ...context.args,
    }),
  })(story, context);

export async function exercisePageStory(canvasElement: HTMLElement): Promise<void> {
  const { expect, userEvent, within } = await import('storybook/test');
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /novo/i })).toBeVisible();
  await userEvent.tab();
  const enabledButton = canvas
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
}

function createPermissionsStoryService(
  canWrite: boolean,
): Pick<
  PermissionsService,
  'has' | 'hasAll' | 'hasAny' | 'missing' | 'canEdit' | 'canDelete' | 'rawPermissions' | 'granted'
> {
  const grantedSet = new Set<PermissionScope>(
    canWrite ? permissions : permissions.filter((permission) => permission.endsWith('#read')),
  );
  return {
    granted: computed(() => grantedSet),
    rawPermissions: computed(() => [...grantedSet]),
    has: (scope) => grantedSet.has(scope),
    hasAll: (scopes) => scopes.every((scope) => grantedSet.has(scope)),
    hasAny: (scopes) => scopes.some((scope) => grantedSet.has(scope)),
    missing: (scopes) => scopes.filter((scope) => !grantedSet.has(scope)),
    canEdit: (...scopes) => canWrite && scopes.every((scope) => grantedSet.has(scope)),
    canDelete: (...scopes) => canWrite && scopes.every((scope) => grantedSet.has(scope)),
  };
}

function createMajorEventsStoryService(formBuilder: FormBuilder, args: PageStoryArgs) {
  const majorEvents = args.mode === 'empty' ? [] : buildMajorEvents(args);
  const selectedMajorEvent = majorEvents[selectedIndex(args, majorEvents.length)] ?? null;
  const linkedEvents = selectedMajorEvent
    ? buildEvents({ ...args, itemCount: 3 }, majorEvents, buildEventGroups(args))
    : [];
  const searchResults =
    args.mode === 'empty' ? [] : buildEvents({ ...args, itemCount: 2 }, majorEvents, buildEventGroups(args), 20);
  const majorEventForm = formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    emoji: ['', [Validators.required]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    description: [''],
    subscriptionStartDate: [''],
    subscriptionEndDate: [''],
    maxCoursesPerAttendee: [''],
    maxLecturesPerAttendee: [''],
    maxUncategorizedPerAttendee: [''],
    rankedSubscriptionEnabled: [false],
    requiresImageLicenseAgreement: [false],
    buttonText: [''],
    buttonLink: [''],
    contactInfo: [''],
    contactType: [''],
    isPaymentRequired: [false],
    shouldIssueCertificateForNonPayingAttendees: [false],
    shouldIssueCertificateForNonSubscribedAttendees: [false],
    additionalPaymentInfo: [''],
    paymentBankName: [''],
    paymentAgency: [''],
    paymentAccount: [''],
    paymentHolder: [''],
    paymentDocument: [''],
    pixKey: [''],
    pixCity: [''],
    priceType: ['TIERED' as const],
    priceTiers: formBuilder.array([
      formBuilder.nonNullable.group({ name: ['Estudante'], value: ['40'], includesSportsRegistration: [false] }),
      formBuilder.nonNullable.group({
        name: ['Comunidade externa'],
        value: ['80'],
        includesSportsRegistration: [false],
      }),
    ]),
  });

  if (selectedMajorEvent) {
    majorEventForm.patchValue({
      id: selectedMajorEvent.id,
      name: selectedMajorEvent.name,
      emoji: selectedMajorEvent.emoji,
      startDate: localDateTime(selectedMajorEvent.startDate),
      endDate: localDateTime(selectedMajorEvent.endDate),
      description: selectedMajorEvent.description ?? '',
      subscriptionStartDate: localDateTime(selectedMajorEvent.subscriptionStartDate),
      subscriptionEndDate: localDateTime(selectedMajorEvent.subscriptionEndDate),
      rankedSubscriptionEnabled: Boolean(selectedMajorEvent.rankedSubscriptionEnabled),
      requiresImageLicenseAgreement: Boolean(selectedMajorEvent.requiresImageLicenseAgreement),
      isPaymentRequired: selectedMajorEvent.isPaymentRequired,
      contactInfo: selectedMajorEvent.contactInfo ?? '',
      contactType: selectedMajorEvent.contactType ?? '',
      additionalPaymentInfo: selectedMajorEvent.additionalPaymentInfo ?? '',
    });
  }

  return {
    loading: signal(args.mode === 'loading'),
    majorEvents: signal(majorEvents),
    majorEventsPagination: createWorkspaceListPagination(),
    selectedMajorEvent: signal(selectedMajorEvent),
    majorEventEvents: signal(linkedEvents),
    majorEventEventSearchResults: signal(searchResults),
    majorEventForm,
    majorEventEventSearchForm: formBuilder.nonNullable.group({ query: ['Angular', [Validators.required]] }),
    get priceTiers() {
      return majorEventForm.controls.priceTiers;
    },
    addPriceTier: () => undefined,
    removePriceTier: () => undefined,
    previousMajorEventsPage: async () => undefined,
    nextMajorEventsPage: async () => undefined,
    resetMajorEventForm: () => undefined,
    pickMajorEvent: async () => undefined,
    pickMajorEventById: async () => undefined,
    cloneMajorEvent: async () => undefined,
    deleteMajorEvent: async () => undefined,
    saveMajorEvent: async () => undefined,
    openMajorEventPublication: () => undefined,
    searchEventsForSelectedMajorEvent: async () => undefined,
    addEventToSelectedMajorEvent: async () => undefined,
    removeEventFromSelectedMajorEvent: async () => undefined,
  };
}

function createEventGroupsStoryService(formBuilder: FormBuilder, args: PageStoryArgs) {
  const groups = args.mode === 'empty' ? [] : buildEventGroups(args);
  const majorEvents = buildMajorEvents(args);
  const eventSummaries: EventSummary[] = buildEvents(args, majorEvents, groups).map((eventItem) => ({
    ...eventItem,
    eventGroupId: eventItem.eventGroupId ?? null,
  }));
  const selectedGroup = groups[selectedIndex(args, groups.length)] ?? null;
  const linkedEvents = selectedGroup
    ? eventSummaries.filter((eventItem) => eventItem.eventGroupId === selectedGroup.id)
    : [];
  const eventGroupForm = formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    emoji: ['❔'],
    shouldIssueCertificate: [false],
    requiresImageLicenseAgreement: [false],
    shouldIssueCertificateForNonPayingAttendees: [false],
    shouldIssueCertificateForNonSubscribedAttendees: [false],
    shouldIssueCertificateForEachEvent: [false],
    shouldIssuePartialCertificate: [false],
  });

  if (selectedGroup) {
    eventGroupForm.patchValue(selectedGroup);
  }

  const eventSummariesSignal = signal<EventSummary[]>(eventSummaries);
  const eventGroupsSignal = signal(groups);
  const firstEventsByGroupId = computed(() => {
    const result = new Map<string, EventSummary | undefined>();
    for (const group of eventGroupsSignal()) {
      result.set(
        group.id,
        eventSummariesSignal()
          .filter((eventItem) => eventItem.eventGroupId === group.id)
          .sort((a, b) => compareIsoDateAsc(a.startDate, b.startDate))[0],
      );
    }
    return result;
  });

  return {
    eventGroups: eventGroupsSignal,
    eventGroupsPagination: createWorkspaceListPagination(),
    eventSummaries: eventSummariesSignal,
    selectedEventGroup: signal(selectedGroup),
    eventGroupEvents: signal(linkedEvents),
    eventGroupEventSearchResults: signal(eventSummaries.slice(0, 2)),
    savingEventGroup: signal(args.mode === 'loading'),
    selectedEventGroupHasMajorEventEvents: computed(() =>
      linkedEvents.some((eventItem) => Boolean(eventItem.majorEvent)),
    ),
    sortedEventGroups: computed(() => eventGroupsSignal()),
    eventGroupForm,
    eventGroupEventSearchForm: formBuilder.nonNullable.group({ query: ['certificado', [Validators.required]] }),
    eventGroupsSearchForm: formBuilder.nonNullable.group({ query: [''] }),
    getFirstEventForGroupDisplay: (groupId: string) => firstEventsByGroupId().get(groupId) ?? null,
    searchEventGroups: async () => undefined,
    previousEventGroupsPage: async () => undefined,
    nextEventGroupsPage: async () => undefined,
    startNewEventGroup: () => undefined,
    pickEventGroup: async () => undefined,
    pickEventGroupById: async () => undefined,
    cloneEventGroup: async () => undefined,
    deleteEventGroup: async () => undefined,
    saveEventGroup: async () => undefined,
    openEventGroupPublication: () => undefined,
    searchEventsForSelectedGroup: async () => undefined,
    addEventToSelectedGroup: async () => undefined,
    removeEventFromSelectedGroup: async () => undefined,
  };
}

function createEventsStoryService(formBuilder: FormBuilder, args: PageStoryArgs) {
  const majorEvents = buildMajorEvents(args);
  const eventGroups = buildEventGroups(args);
  const events = args.mode === 'empty' ? [] : buildEvents(args, majorEvents, eventGroups);
  const selectedEvent = events[selectedIndex(args, events.length)] ?? null;
  const draft = selectedEvent && args.mode === 'drafts' ? buildEventDraft(selectedEvent) : null;
  const eventForm = formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    creditDisplayMode: ['hours'],
    creditValue: formBuilder.control<number | string | null>(null),
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    emoji: ['', [Validators.required]],
    type: ['OTHER' as Event['type'], [Validators.required]],
    description: [''],
    shortDescription: [''],
    latitude: [''],
    longitude: [''],
    locationDescription: [''],
    locationPresetId: ['PERSONALIZADO'],
    majorEventId: [''],
    eventGroupId: [''],
    allowSubscription: [false],
    requiresImageLicenseAgreement: [false],
    subscriptionStartDate: [''],
    subscriptionEndDate: [''],
    slots: [''],
    autoSubscribe: [false],
    shouldIssueCertificate: [false],
    shouldIssueCertificateForNonPayingAttendees: [false],
    shouldIssueCertificateForNonSubscribedAttendees: [false],
    shouldCollectAttendance: [false],
    shouldAllowOralAttendance: [false],
    isOnlineAttendanceAllowed: [false],
    shouldProvideSubscriberListToLecturer: [false],
    onlineAttendanceCode: [''],
    onlineAttendanceStartDate: [''],
    onlineAttendanceEndDate: [''],
    isPubliclyListed: [true],
    displayLecturerProfile: [true],
    youtubeCode: [''],
    buttonText: [''],
    buttonLink: [''],
  });

  if (selectedEvent) {
    eventForm.patchValue({
      id: selectedEvent.id,
      name: draft?.name ?? selectedEvent.name,
      creditDisplayMode: 'hours',
      creditValue: selectedEvent.creditMinutes ? selectedEvent.creditMinutes / 60 : '',
      startDate: localDateTime(selectedEvent.startDate),
      endDate: localDateTime(selectedEvent.endDate),
      emoji: selectedEvent.emoji,
      type: selectedEvent.type,
      description: selectedEvent.description ?? '',
      shortDescription: selectedEvent.shortDescription ?? '',
      latitude: selectedEvent.latitude?.toString() ?? '',
      longitude: selectedEvent.longitude?.toString() ?? '',
      locationDescription: selectedEvent.locationDescription ?? '',
      majorEventId: selectedEvent.majorEventId ?? '',
      eventGroupId: selectedEvent.eventGroupId ?? '',
      allowSubscription: selectedEvent.allowSubscription,
      requiresImageLicenseAgreement: Boolean(selectedEvent.requiresImageLicenseAgreement),
      subscriptionStartDate: localDateTime(selectedEvent.subscriptionStartDate),
      subscriptionEndDate: localDateTime(selectedEvent.subscriptionEndDate),
      slots: selectedEvent.slots?.toString() ?? '',
      autoSubscribe: selectedEvent.autoSubscribe,
      shouldIssueCertificate: selectedEvent.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees: selectedEvent.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: selectedEvent.shouldIssueCertificateForNonSubscribedAttendees,
      shouldCollectAttendance: selectedEvent.shouldCollectAttendance,
      shouldAllowOralAttendance: selectedEvent.shouldAllowOralAttendance,
      isOnlineAttendanceAllowed: selectedEvent.isOnlineAttendanceAllowed,
      shouldProvideSubscriberListToLecturer: Boolean(selectedEvent.shouldProvideSubscriberListToLecturer),
      onlineAttendanceCode: selectedEvent.onlineAttendanceCode ?? '',
      onlineAttendanceStartDate: localDateTime(selectedEvent.onlineAttendanceStartDate),
      onlineAttendanceEndDate: localDateTime(selectedEvent.onlineAttendanceEndDate),
      isPubliclyListed: selectedEvent.isPubliclyListed,
      displayLecturerProfile: selectedEvent.displayLecturerProfile,
      youtubeCode: selectedEvent.youtubeCode ?? '',
      buttonText: selectedEvent.buttonText ?? '',
      buttonLink: selectedEvent.buttonLink ?? '',
    });
  }

  const people = buildPeople();
  const draftsByEventId = draft ? { [draft.sourceEventId]: [draft] } : {};
  const placePresets: PlacePreset[] = [
    {
      id: 'place-auditorio',
      name: 'Auditório principal',
      latitude: -22.1211,
      longitude: -51.4086,
      locationDescription: 'Auditório da FCT',
      createdAt: storyNow,
      updatedAt: storyNow,
    },
  ];

  return {
    majorEvents: signal(majorEvents),
    loading: signal(args.mode === 'loading'),
    events: signal(events),
    eventDraftsByEventId: signal<Record<string, EventDraft[]>>(draftsByEventId),
    eventsPagination: createWorkspaceListPagination(),
    selectedEvent: signal(selectedEvent),
    selectedEventDraft: signal(draft),
    eventLecturers: signal([{ personId: people[0].id, name: people[0].name }]),
    eventAttendanceCollectors: signal([{ personId: people[1].id, name: people[1].name }]),
    selectedMajorEventName: signal(selectedEvent?.majorEvent?.name ?? ''),
    majorEventSearchResults: signal(majorEvents),
    selectedEventGroupName: signal(selectedEvent?.eventGroup?.name ?? ''),
    selectedEventGroupAllowsCertificates: signal(true),
    selectedEventGroupAllowsNonPayingCertificates: signal(false),
    selectedEventGroupAllowsNonSubscribedCertificates: signal(false),
    eventGroupSearchResults: signal(eventGroups),
    placePresetSuggestions: signal(placePresets),
    lecturerSearchResults: signal(people),
    attendanceCollectorSearchResults: signal(people.slice(1)),
    groupLecturerSuggestions: signal(people.slice(2)),
    suggestedGroupLecturers: computed(() => people.slice(2)),
    eventFiltersForm: formBuilder.group({
      startDateFrom: formBuilder.control<Date | null>(null),
      startDateUntil: formBuilder.control<Date | null>(null),
      isInGroup: formBuilder.nonNullable.control('ALL'),
      isInMajorEvent: formBuilder.nonNullable.control('ALL'),
      query: formBuilder.nonNullable.control(''),
    }),
    eventForm,
    majorEventLookupForm: formBuilder.nonNullable.group({ query: [''] }),
    eventGroupLookupForm: formBuilder.nonNullable.group({ query: ['grupo'] }),
    lecturerLookupForm: formBuilder.nonNullable.group({ query: ['ana', [Validators.required]] }),
    attendanceCollectorLookupForm: formBuilder.nonNullable.group({ query: ['bruno', [Validators.required]] }),
    placePresetsService: {
      placePresets: signal(placePresets),
      sortedPlacePresets: computed(() => placePresets),
      searchPlacePresets: async (query: string) =>
        placePresets.filter((place) =>
          `${place.name} ${place.locationDescription ?? ''}`
            .toLocaleLowerCase('pt-BR')
            .includes(query.toLocaleLowerCase('pt-BR')),
        ),
    },
    draftsForEvent: (eventId: string) => draftsByEventId[eventId] ?? [],
    applyEventFilters: async () => undefined,
    resetEventFilters: async () => undefined,
    previousEventsPage: async () => undefined,
    nextEventsPage: async () => undefined,
    selectEvent: async () => undefined,
    selectEventDraft: async () => undefined,
    selectEventById: async () => true,
    resetEventForm: () => undefined,
    cloneEvent: async () => undefined,
    deleteEventFromList: async () => undefined,
    openEventPublication: () => undefined,
    chooseSelectedEventVersion: () => undefined,
    deleteDraftsForSelectedEvent: () => undefined,
    saveEvent: async () => undefined,
    loadMajorEventsForEvent: async () => undefined,
    searchMajorEventsForEvent: async () => undefined,
    clearMajorEventFromEvent: () => undefined,
    assignMajorEventToEvent: () => undefined,
    majorEventNameById: (majorEventId: string) =>
      majorEvents.find((majorEvent) => majorEvent.id === majorEventId)?.name ?? 'Nenhum grande evento',
    searchEventGroupsForEvent: async () => undefined,
    clearEventGroupFromEvent: () => undefined,
    assignEventGroupToEvent: () => undefined,
    eventGroupNameById: (groupId: string) => eventGroups.find((group) => group.id === groupId)?.name ?? 'Nenhum grupo',
    applyPlacePreset: () => undefined,
    displayPlacePresetSuggestion: (placeId: string) =>
      placePresets.find((place) => place.id === placeId)?.locationDescription ?? '',
    randomizeOnlineAttendanceCode: () => undefined,
    searchLecturerCandidates: async () => undefined,
    createAndAddLecturer: async () => undefined,
    addLecturer: async () => undefined,
    removeLecturer: async () => undefined,
    searchAttendanceCollectorCandidates: async () => undefined,
    addAttendanceCollector: async () => undefined,
    removeAttendanceCollector: async () => undefined,
  };
}

function buildMajorEvents(args: PageStoryArgs): MajorEvent[] {
  return createStoryPublicMajorEvents({ count: args.itemCount }).map((majorEvent, index) => {
    const adapted = adaptMajorEvent(majorEvent, args.publicationState);
    return {
      ...adapted,
      name: args.longContent
        ? `Grande evento interdisciplinar de tecnologia, ciência, cultura e extensão ${index + 1}`
        : adapted.name,
      description: args.longContent
        ? 'Programação extensa criada para validar formulários administrativos com títulos e descrições longas em diferentes larguras.'
        : adapted.description,
      isPaymentRequired: args.requiresPayment && index % 2 === 0,
      sportsTournament:
        args.sportsEvery > 0 && index % args.sportsEvery === 0 ? { id: `tournament-${index + 1}` } : null,
      createdAt:
        args.frozenSelected && index === selectedIndex(args, args.itemCount) ? offsetDate(-150) : adapted.createdAt,
      endDate:
        args.frozenSelected && index === selectedIndex(args, args.itemCount) ? offsetDate(-120) : adapted.endDate,
    };
  });
}

function buildEventGroups(args: PageStoryArgs): EventGroup[] {
  return createStoryPublicEventGroups({ count: args.itemCount }).map((group, index) => {
    const adapted = adaptEventGroup(group);
    const shouldIssueCertificate =
      args.certificateMode === 'all' || (args.certificateMode === 'mixed' && index % 2 === 0);
    return {
      ...adapted,
      name: args.longContent
        ? `Grupo interdisciplinar de atividades acadêmicas e comunitárias ${index + 1}`
        : adapted.name,
      shouldIssueCertificate,
      shouldIssueCertificateForEachEvent: shouldIssueCertificate && index % 2 === 0,
      shouldIssuePartialCertificate: shouldIssueCertificate && index % 3 === 0,
      createdAt:
        args.frozenSelected && index === selectedIndex(args, args.itemCount) ? offsetDate(-150) : adapted.createdAt,
    };
  });
}

function buildEvents(args: PageStoryArgs, majorEvents: MajorEvent[], eventGroups: EventGroup[], offset = 0): Event[] {
  return createStoryPublicEvents({ count: args.itemCount }).map((eventItem, index) => {
    const adapted = adaptEvent(
      { ...eventItem, id: `event-${offset + index + 1}` },
      args.publicationState,
      majorEvents.find((majorEvent) => majorEvent.id === eventItem.majorEventId) ?? null,
      eventGroups.find((eventGroup) => eventGroup.id === eventItem.eventGroupId) ?? null,
    );
    const shouldIssueCertificate =
      args.certificateMode === 'all' || (args.certificateMode === 'mixed' && index % 2 === 0);
    return {
      ...adapted,
      name: args.longContent
        ? `Atividade interdisciplinar de tecnologia, ciência, extensão e acessibilidade ${offset + index + 1}`
        : adapted.name,
      description: args.longContent
        ? 'Descrição longa de demonstração com objetivos, metodologia, público-alvo e informações operacionais para a equipe organizadora.'
        : adapted.description,
      isSportsMatch: args.sportsEvery > 0 && index % args.sportsEvery === 0,
      latitude: args.coordinates ? -22.1211 + index * 0.0002 : null,
      longitude: args.coordinates ? -51.4086 + index * 0.0002 : null,
      shouldIssueCertificate,
      createdAt:
        args.frozenSelected && index === selectedIndex(args, args.itemCount) ? offsetDate(-150) : adapted.createdAt,
      endDate:
        args.frozenSelected && index === selectedIndex(args, args.itemCount) ? offsetDate(-120) : adapted.endDate,
    };
  });
}

function adaptMajorEvent(majorEvent: PublicMajorEvent, publicationState: Event['publicationState']): MajorEvent {
  return {
    id: majorEvent.id,
    name: majorEvent.name,
    emoji: iconToEmoji(majorEvent.emoji),
    startDate: majorEvent.startDate,
    endDate: majorEvent.endDate,
    description: majorEvent.description,
    subscriptionStartDate: majorEvent.subscriptionStartDate,
    subscriptionEndDate: majorEvent.subscriptionEndDate,
    requiresImageLicenseAgreement: Boolean(majorEvent.requiresImageLicenseAgreement),
    maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee,
    maxLecturesPerAttendee: majorEvent.maxLecturesPerAttendee,
    maxUncategorizedPerAttendee: majorEvent.maxUncategorizedPerAttendee,
    rankedSubscriptionEnabled: majorEvent.rankedSubscriptionEnabled,
    buttonText: majorEvent.buttonText,
    buttonLink: majorEvent.buttonLink,
    contactInfo: majorEvent.contactInfo,
    contactType: majorEvent.contactType,
    isPaymentRequired: Boolean(majorEvent.isPaymentRequired),
    shouldIssueCertificateForNonPayingAttendees: Boolean(majorEvent.shouldIssueCertificateForNonPayingAttendees),
    shouldIssueCertificateForNonSubscribedAttendees: Boolean(
      majorEvent.shouldIssueCertificateForNonSubscribedAttendees,
    ),
    additionalPaymentInfo: majorEvent.additionalPaymentInfo,
    paymentInfo: majorEvent.paymentInfo ?? null,
    majorEventPrices: majorEvent.majorEventPrices ?? [],
    publicationState,
    scheduledPublishAt: publicationState === 'SCHEDULED' ? offsetDate(1) : null,
    publishedAt: publicationState === 'PUBLISHED' ? offsetDate(-2) : null,
    unpublishedAt: null,
    createdAt: storyNow,
    updatedAt: storyNow,
  };
}

function adaptEventGroup(group: PublicEventGroup): EventGroup {
  return {
    id: group.id,
    name: group.name,
    emoji: iconToEmoji(group.emoji),
    requiresImageLicenseAgreement: Boolean(group.requiresImageLicenseAgreement),
    shouldIssueCertificate: Boolean(group.shouldIssueCertificate),
    shouldIssueCertificateForNonPayingAttendees: Boolean(group.shouldIssueCertificateForNonPayingAttendees),
    shouldIssueCertificateForNonSubscribedAttendees: Boolean(group.shouldIssueCertificateForNonSubscribedAttendees),
    shouldIssueCertificateForEachEvent: Boolean(group.shouldIssueCertificateForEachEvent),
    shouldIssuePartialCertificate: Boolean(group.shouldIssuePartialCertificate),
    createdAt: storyNow,
    updatedAt: storyNow,
  };
}

function adaptEvent(
  eventItem: PublicEvent,
  publicationState: Event['publicationState'],
  majorEvent: MajorEvent | null,
  eventGroup: EventGroup | null,
): Event {
  return {
    id: eventItem.id,
    name: eventItem.name,
    creditMinutes: eventItem.creditMinutes,
    startDate: eventItem.startDate,
    endDate: eventItem.endDate,
    emoji: iconToEmoji(eventItem.emoji),
    type: eventItem.type,
    description: eventItem.description,
    shortDescription: eventItem.shortDescription,
    latitude: eventItem.latitude,
    longitude: eventItem.longitude,
    locationDescription: eventItem.locationDescription,
    majorEventId: majorEvent?.id ?? null,
    majorEvent,
    eventGroupId: eventGroup?.id ?? null,
    eventGroup,
    allowSubscription: Boolean(eventItem.allowSubscription),
    requiresImageLicenseAgreement: Boolean(eventItem.requiresImageLicenseAgreement),
    subscriptionStartDate: eventItem.subscriptionStartDate,
    subscriptionEndDate: eventItem.subscriptionEndDate,
    slots: eventItem.slots,
    autoSubscribe: Boolean(eventItem.autoSubscribe),
    shouldIssueCertificate: Boolean(eventItem.shouldIssueCertificate),
    shouldIssueCertificateForNonPayingAttendees: Boolean(eventItem.shouldIssueCertificateForNonPayingAttendees),
    shouldIssueCertificateForNonSubscribedAttendees: Boolean(eventItem.shouldIssueCertificateForNonSubscribedAttendees),
    shouldCollectAttendance: Boolean(eventItem.shouldCollectAttendance),
    shouldAllowOralAttendance: Boolean(eventItem.shouldAllowOralAttendance),
    isOnlineAttendanceAllowed: Boolean(eventItem.isOnlineAttendanceAllowed),
    shouldProvideSubscriberListToLecturer: true,
    onlineAttendanceCode: eventItem.isOnlineAttendanceAllowed ? 'A7K9' : null,
    onlineAttendanceStartDate: eventItem.onlineAttendanceStartDate,
    onlineAttendanceEndDate: eventItem.onlineAttendanceEndDate,
    isPubliclyListed: Boolean(eventItem.isPubliclyListed),
    displayLecturerProfile: true,
    publicationState,
    scheduledPublishAt: publicationState === 'SCHEDULED' ? offsetDate(1) : null,
    publishedAt: publicationState === 'PUBLISHED' ? offsetDate(-1) : null,
    unpublishedAt: null,
    youtubeCode: eventItem.youtubeCode,
    buttonText: eventItem.buttonText,
    buttonLink: eventItem.buttonLink,
    createdAt: storyNow,
    updatedAt: storyNow,
  };
}

function buildEventDraft(eventItem: Event): EventDraft {
  return {
    id: `${eventItem.id}-draft`,
    sourceEventId: eventItem.id,
    name: `${eventItem.name} revisado`,
    payloadJson: '{}',
    createdByName: 'Renata Almeida',
    updatedByName: 'Renata Almeida',
    createdAt: offsetDate(-1),
    updatedAt: offsetDate(0),
    expiresAt: offsetDate(14),
  };
}

function buildPeople(): Person[] {
  return [
    {
      id: 'person-ana',
      name: 'Ana Clara Silva',
      email: 'ana@example.com',
      identityDocument: '12345678901',
      academicId: '2026001',
      userId: 'user-ana',
      externalRef: null,
      createdAt: storyNow,
      updatedAt: storyNow,
    },
    {
      id: 'person-bruno',
      name: 'Bruno Santos',
      email: 'bruno@example.com',
      identityDocument: '98765432100',
      academicId: '2026002',
      userId: 'user-bruno',
      externalRef: null,
      createdAt: storyNow,
      updatedAt: storyNow,
    },
    {
      id: 'person-carol',
      name: 'Carolina Pereira',
      email: 'carol@example.com',
      identityDocument: null,
      academicId: '2026003',
      userId: null,
      externalRef: null,
      createdAt: storyNow,
      updatedAt: storyNow,
    },
  ];
}

function selectedIndex(args: PageStoryArgs, length: number): number {
  if (length === 0) {
    return 0;
  }

  return Math.min(Math.max(args.selectedIndex, 0), length - 1);
}

function offsetDate(days: number, hours = 0): string {
  const date = new Date(storyNow);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function localDateTime(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : '';
}

function iconToEmoji(value: string): string {
  const emojisByIcon: Record<string, string> = {
    accessibility_new: '♿',
    computer: '💻',
    monitoring: '📡',
    nightlight: '🌙',
    psychology: '🧠',
    query_stats: '📊',
    record_voice_over: '🎤',
    rocket_launch: '🚀',
    school: '🎓',
    science: '🧪',
    security: '🔐',
    web: '🅰️',
  };

  return emojisByIcon[value] ?? value;
}
