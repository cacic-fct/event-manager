import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom, from } from 'rxjs';
import { parseCsv } from '@cacic-fct/shared-utils';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { EventApiService } from '../graphql/event-api.service';
import {
  Event,
  MajorEventPriceTier,
  Person,
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../graphql/people-api.service';
import { SubscriptionApiService } from '../graphql/subscription-api.service';
import { SubscriptionCsvColumnDialogComponent } from './dialogs/import/subscription-csv-column-dialog.component';
import { SubscriptionCsvImportResultDialogComponent } from './dialogs/import/subscription-csv-import-result-dialog.component';
import { SubscriberCsvExportDialogComponent } from './dialogs/export/subscriber-csv-export-dialog.component';
import { SubscriberBadgeExportErrorDialogComponent } from './dialogs/export/subscriber-badge-export-error-dialog.component';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { getErrorMessage } from '../feedback/error-message';
import { buildEventListFilters, resetEventFiltersForm } from '../event-filters/event-list-filters';
import { bindLiveSearch } from '../search/live-search';
import { buildPeopleCandidateLookupFilters, buildPeopleLookupFilters } from '../people/people-lookup';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
} from '../pagination/list-pagination';
import { buildSubscriberCsv, SubscriberCsvExportDialogOptions } from './subscriber-csv-export';
import { MajorEventsService } from '../major-events/major-events.service';
import { AttendancesService } from '../attendances/attendances.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { formatDateOnly, parseDateOnly } from '@cacic-fct/shared-utils';
import { PermissionsService } from '../permissions/permissions.service';
import type { SportsApplication } from '../sports/sports.models';
import { SportsTextDialogComponent } from '../sports/sports-text-dialog.component';
import type {
  MajorEventSportsParticipant,
  MajorEventSportsSubscriptionWorkspace,
} from '../graphql/subscription-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';

const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = 'CONFIRMED';
const EXPORT_PAGE_SIZE = 1000;

@Service()
export class SubscriptionsService {
  private readonly api = inject(SubscriptionApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventsService = inject(MajorEventsService);
  private readonly attendancesService = inject(AttendancesService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly attendanceApi = inject(AttendanceApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionsService);
  private readonly realtime = inject(RealtimeApiService);
  private eventLiveSubscription?: Subscription;
  private majorEventLiveSubscription?: Subscription;
  private eventSubscriptionsRequest = 0;
  private majorEventSubscriptionsRequest = 0;

  readonly majorEvents = this.majorEventsService.majorEvents;
  readonly eventFiltersForm = this.formBuilder.group({
    startDateFrom: this.formBuilder.control<Date | null>(null),
    startDateUntil: this.formBuilder.control<Date | null>(null),
    isInGroup: this.formBuilder.nonNullable.control('ALL'),
    isInMajorEvent: this.formBuilder.nonNullable.control('ALL'),
    query: this.formBuilder.nonNullable.control(''),
  });
  readonly eventResults = signal<Event[]>([]);
  readonly eventResultsPagination = createWorkspaceListPagination();
  readonly selectedEvent = signal<Event | null>(null);
  readonly eventSubscriptions = signal<WorkspaceEventSubscription[]>([]);
  readonly eventSubscriptionsPagination = createWorkspaceListPagination();
  readonly eventLecturerSubscriptions = computed(() =>
    this.eventSubscriptions().filter((subscription) => subscription.isLecturerSubscription),
  );
  readonly eventRegularSubscriptions = computed(() =>
    this.eventSubscriptions().filter((subscription) => !subscription.isLecturerSubscription),
  );
  readonly eventPersonMatches = signal<Person[]>([]);

  readonly eventSubscriptionForm = this.formBuilder.nonNullable.group({
    eventId: ['', [Validators.required]],
    identifierType: ['email'],
    identifier: ['', [Validators.required]],
  });

  readonly majorEventForm = this.formBuilder.nonNullable.group({
    majorEventId: ['', [Validators.required]],
  });
  readonly majorEventSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
  });
  readonly majorEventSubscriptionSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
  });
  private readonly selectedMajorEventId = signal('');
  private readonly majorEventSearchQuery = signal('');
  private majorEventSubscriptionSelectionRequest = 0;
  readonly majorEventPersonForm = this.formBuilder.nonNullable.group({
    identifierType: ['email'],
    identifier: ['', [Validators.required]],
  });
  readonly majorEventEditForm = this.formBuilder.group({
    subscriptionStatus: this.formBuilder.nonNullable.control<SubscriptionStatus>(DEFAULT_SUBSCRIPTION_STATUS, [
      Validators.required,
    ]),
    amountPaid: this.formBuilder.control<number | null>(null),
    paymentDate: this.formBuilder.control<Date | null>(null),
    paymentTier: this.formBuilder.control<string | null>(null),
    imageLicenseAgreementAccepted: this.formBuilder.nonNullable.control(false),
  });
  readonly majorEventSubscriptions = signal<WorkspaceMajorEventSubscription[]>([]);
  readonly majorEventSubscriptionsPagination = createWorkspaceListPagination();
  readonly majorEventEvents = signal<WorkspaceMajorEventSubscriptionEvent[]>([]);
  readonly selectedMajorEventSubscription = signal<WorkspaceMajorEventSubscription | null>(null);
  readonly majorEventSportsWorkspace = signal<MajorEventSportsSubscriptionWorkspace | null>(null);
  private readonly sportsAssignedTeams = signal<Record<string, string | null>>({});
  private readonly sportsParticipantTeams = signal<Record<string, string | null>>({});
  readonly selectedMajorEvent = computed(() => {
    return this.majorEvents().find((item) => item.id === this.selectedMajorEventId()) ?? null;
  });
  readonly filteredMajorEvents = computed(() => {
    const query = this.majorEventSearchQuery().trim().toLocaleLowerCase('pt-BR');
    if (!query) {
      return this.majorEvents();
    }

    return this.majorEvents().filter((majorEvent) => {
      const searchable = `${majorEvent.name} ${majorEvent.emoji ?? ''}`.toLocaleLowerCase('pt-BR');
      return searchable.includes(query);
    });
  });
  readonly majorEventPaymentTiers = computed<MajorEventPriceTier[]>(() => {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    const majorEvent = this.majorEvents().find((item) => item.id === majorEventId);
    const tiers = majorEvent?.majorEventPrices[0]?.tiers ?? [];
    const selectedTier = this.selectedMajorEventSubscription()?.paymentTier?.trim();
    if (!selectedTier || tiers.some((tier) => tier.name === selectedTier)) {
      return tiers;
    }

    return [
      {
        id: `selected-${selectedTier}`,
        name: selectedTier,
        value: 0,
        includesSportsRegistration: false,
      },
      ...tiers,
    ];
  });
  readonly majorEventPersonMatches = signal<Person[]>([]);
  readonly selectedMajorEventPerson = signal<Person | null>(null);
  readonly editMode = signal(false);
  readonly selectedEventIds = signal<Set<string>>(new Set());
  readonly isImportingCsv = signal(false);

  constructor() {
    this.setMajorEventEditMode(false);
    this.majorEventForm.controls.majorEventId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((majorEventId) => {
        this.selectedMajorEventId.set(majorEventId);
        if (!majorEventId) this.stopMajorEventLiveUpdates();
      });
    this.majorEventSearchForm.controls.query.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.majorEventSearchQuery.set(query));
    bindLiveSearch({
      control: this.eventFiltersForm,
      destroyRef: this.destroyRef,
      search: () => this.searchEvents(),
    });
    bindLiveSearch({
      control: this.majorEventSubscriptionSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchMajorEventSubscriptions(),
    });
    this.destroyRef.onDestroy(() => {
      this.eventLiveSubscription?.unsubscribe();
      this.majorEventLiveSubscription?.unsubscribe();
    });
  }

  async searchEvents(): Promise<void> {
    resetPagination(this.eventResultsPagination);
    await this.loadEventResultsPage();
  }

  async previousEventResultsPage(): Promise<void> {
    await loadPreviousPage(this.eventResultsPagination, () => this.loadEventResultsPage());
  }

  async nextEventResultsPage(): Promise<void> {
    await loadNextPage(this.eventResultsPagination, () => this.loadEventResultsPage());
  }

  private async loadEventResultsPage(): Promise<void> {
    const events = await firstValueFrom(
      this.eventApi.listEvents({
        ...buildEventListFilters(this.eventFiltersForm.value),
        ...pageVariables(this.eventResultsPagination.pageIndex()),
      }),
    );
    this.eventResults.set(applyPagedResult(events, this.eventResultsPagination));
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm, { emitEvent: false });
    await this.searchEvents();
  }

  async selectEvent(eventItem: Event): Promise<void> {
    this.stopMajorEventLiveUpdates();
    void this.router.navigate(['/subscriptions/event', eventItem.id]);
    this.selectedEvent.set(eventItem);
    this.eventSubscriptionForm.controls.eventId.setValue(eventItem.id);
    resetPagination(this.eventSubscriptionsPagination);
    await this.loadEventSubscriptions(eventItem.id);
    this.watchEventSubscriptions(eventItem.id);
  }

  async selectEventById(eventId: string): Promise<void> {
    this.stopMajorEventLiveUpdates();
    if (this.selectedEvent()?.id !== eventId) {
      this.selectedEvent.set(await firstValueFrom(this.eventApi.getEvent(eventId)));
    }
    this.eventSubscriptionForm.controls.eventId.setValue(eventId);
    resetPagination(this.eventSubscriptionsPagination);
    await this.loadEventSubscriptions(eventId);
    this.watchEventSubscriptions(eventId);
  }

  async loadEventSubscriptions(eventId?: string): Promise<void> {
    const resolvedEventId = eventId || this.eventSubscriptionForm.controls.eventId.value;
    if (!resolvedEventId) {
      this.eventSubscriptions.set([]);
      return;
    }
    const request = ++this.eventSubscriptionsRequest;
    const subscriptions = await firstValueFrom(
      this.api.listEventSubscriptions(resolvedEventId, {
        ...pageVariables(this.eventSubscriptionsPagination.pageIndex()),
      }),
    );
    if (
      request !== this.eventSubscriptionsRequest ||
      this.eventSubscriptionForm.controls.eventId.value !== resolvedEventId
    ) {
      return;
    }
    this.eventSubscriptions.set(applyPagedResult(subscriptions, this.eventSubscriptionsPagination));
  }

  async previousEventSubscriptionsPage(): Promise<void> {
    await loadPreviousPage(this.eventSubscriptionsPagination, () => this.loadEventSubscriptions());
  }

  async nextEventSubscriptionsPage(): Promise<void> {
    await loadNextPage(this.eventSubscriptionsPagination, () => this.loadEventSubscriptions());
  }

  async findEventPerson(): Promise<void> {
    this.eventPersonMatches.set(
      await this.findPeople(
        this.eventSubscriptionForm.controls.identifierType.value,
        this.eventSubscriptionForm.controls.identifier.value,
      ),
    );
  }

  async createEventSubscription(person: Person): Promise<void> {
    const eventId = this.eventSubscriptionForm.controls.eventId.value;
    if (!eventId) {
      return;
    }
    try {
      await firstValueFrom(this.api.createEventSubscription({ eventId, personId: person.id }));
      await this.loadEventSubscriptions(eventId);
      await this.refreshMajorEventAttendancesForEvent(eventId);
      this.eventPersonMatches.set([]);
      this.snackbar.open('Inscrição criada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível criar a inscrição.');
    }
  }

  async selectMajorEventById(majorEventId: string, navigate = true): Promise<void> {
    this.eventLiveSubscription?.unsubscribe();
    this.eventLiveSubscription = undefined;
    this.majorEventSubscriptionSelectionRequest++;
    this.majorEventForm.controls.majorEventId.setValue(majorEventId);
    if (navigate) {
      void this.router.navigate(['/subscriptions/major-event', majorEventId]);
    }
    resetPagination(this.majorEventSubscriptionsPagination);
    await this.loadMajorEventSubscriptions();
    this.watchMajorEventSubscriptions(majorEventId);
  }

  async loadMajorEventSubscriptions(options: { preserveSelection?: boolean } = {}): Promise<void> {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventSubscriptions.set([]);
      this.majorEventEvents.set([]);
      this.selectMajorEventSubscription(null, false);
      this.majorEventSportsWorkspace.set(null);
      this.sportsAssignedTeams.set({});
      this.sportsParticipantTeams.set({});
      return;
    }
    const request = ++this.majorEventSubscriptionsRequest;
    const selected = options.preserveSelection ? this.selectedMajorEventSubscription() : null;
    const [subscriptions, sportsWorkspace] = await Promise.all([
      firstValueFrom(
        this.api.listMajorEventSubscriptions(majorEventId, {
          query: this.majorEventSubscriptionSearchForm.controls.query.value.trim() || undefined,
          ...pageVariables(this.majorEventSubscriptionsPagination.pageIndex()),
        }),
      ),
      this.permissions.has(Permission.SportsRegistration.Read) && this.permissions.has(Permission.SportsTournament.Read)
        ? firstValueFrom(this.api.majorEventSportsWorkspace(majorEventId))
        : Promise.resolve(null),
    ]);
    if (request !== this.majorEventSubscriptionsRequest || this.majorEventForm.controls.majorEventId.value !== majorEventId) {
      return;
    }
    this.majorEventSportsWorkspace.set(sportsWorkspace);
    this.sportsAssignedTeams.set(
      Object.fromEntries(
        (sportsWorkspace?.applications ?? []).map((application) => [
          application.id,
          application.requestedTeam?.id ?? null,
        ]),
      ),
    );
    this.sportsParticipantTeams.set(
      Object.fromEntries(
        (sportsWorkspace?.participants ?? []).map((participant) => [
          participant.id,
          participant.teams.find((membership) => membership.status === 'APPROVED')?.teamId ?? null,
        ]),
      ),
    );
    const events =
      subscriptions[0]?.events ??
      (await firstValueFrom(this.eventApi.listEvents({ majorEventId, take: 200 }))).map((eventItem) => ({
        eventId: eventItem.id,
        eventName: eventItem.name,
        eventStartDate: eventItem.startDate,
        subscribed: false,
        isLecturerSubscription: false,
      }));
    this.majorEventEvents.set(events);
    const visibleSubscriptions = applyPagedResult(subscriptions, this.majorEventSubscriptionsPagination);
    this.majorEventSubscriptions.set(visibleSubscriptions);
    if (!options.preserveSelection) {
      this.selectMajorEventSubscription(null, false);
      return;
    }
    if (!selected || this.editMode()) return;
    const refreshed = visibleSubscriptions.find((item) => item.id === selected.id);
    if (refreshed) this.selectMajorEventSubscription(refreshed, false);
  }

  private watchEventSubscriptions(eventId: string): void {
    this.eventLiveSubscription?.unsubscribe();
    this.eventLiveSubscription = this.realtime
      .watchEventSubscriptions(eventId, () => from(this.loadEventSubscriptions(eventId)))
      .subscribe(() => void this.loadEventSubscriptions(eventId));
  }

  private watchMajorEventSubscriptions(majorEventId: string): void {
    this.majorEventLiveSubscription?.unsubscribe();
    this.majorEventLiveSubscription = this.realtime
      .watchMajorEventSubscriptions(majorEventId, () =>
        from(this.loadMajorEventSubscriptions({ preserveSelection: true })),
      )
      .subscribe(() => void this.loadMajorEventSubscriptions({ preserveSelection: true }));
  }

  private stopMajorEventLiveUpdates(): void {
    this.majorEventLiveSubscription?.unsubscribe();
    this.majorEventLiveSubscription = undefined;
  }

  closeLiveUpdates(): void {
    this.eventSubscriptionsRequest++;
    this.majorEventSubscriptionsRequest++;
    this.eventLiveSubscription?.unsubscribe();
    this.eventLiveSubscription = undefined;
    this.stopMajorEventLiveUpdates();
  }

  sportsAssignedTeamId(applicationId: string): string | null {
    return this.sportsAssignedTeams()[applicationId] ?? null;
  }

  setSportsAssignedTeam(applicationId: string, teamId: string | null): void {
    this.sportsAssignedTeams.update((current) => ({ ...current, [applicationId]: teamId || null }));
  }

  sportsParticipantTeamId(participantId: string): string | null {
    return this.sportsParticipantTeams()[participantId] ?? null;
  }

  setSportsParticipantTeamSelection(participantId: string, teamId: string | null): void {
    this.sportsParticipantTeams.update((current) => ({ ...current, [participantId]: teamId || null }));
  }

  async saveSportsParticipantTeam(participant: MajorEventSportsParticipant): Promise<void> {
    try {
      await firstValueFrom(
        this.api.setSportsParticipantTeam({
          participantId: participant.id,
          teamId: this.sportsParticipantTeamId(participant.id),
        }),
      );
      await this.loadMajorEventSubscriptions();
      this.snackbar.open('Equipe da participação esportiva atualizada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível atualizar a equipe da participação.');
    }
  }

  sportsParticipantFor(personId: string): MajorEventSportsParticipant | null {
    return (
      this.majorEventSportsWorkspace()?.participants.find((participant) => participant.person.id === personId) ?? null
    );
  }

  sportsParticipantsWithoutApplication(): MajorEventSportsParticipant[] {
    const workspace = this.majorEventSportsWorkspace();
    if (!workspace) {
      return [];
    }
    const applicantIds = new Set(workspace.applications.map((application) => application.applicant.personId));
    return workspace.participants.filter((participant) => !applicantIds.has(participant.person.id));
  }

  async reviewSportsApplication(
    application: SportsApplication,
    decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED',
  ): Promise<void> {
    const reviewMessage =
      decision === 'APPROVED'
        ? null
        : await firstValueFrom(
            this.dialog
              .open<SportsTextDialogComponent, unknown, string>(SportsTextDialogComponent, {
                data: {
                  title: 'Mensagem da revisão',
                  description: 'Explique de forma objetiva o que precisa mudar ou por que a inscrição foi negada.',
                  label: 'Mensagem para a pessoa inscrita',
                  required: true,
                },
              })
              .afterClosed(),
          );
    if (decision !== 'APPROVED' && !reviewMessage) {
      return;
    }
    try {
      await firstValueFrom(
        this.api.reviewSportsApplication({
          applicationId: application.id,
          decision,
          assignedTeamId: decision === 'APPROVED' ? this.sportsAssignedTeamId(application.id) : undefined,
          reviewMessage: reviewMessage || null,
        }),
      );
      await this.loadMajorEventSubscriptions();
      this.snackbar.open('Inscrição esportiva revisada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível revisar a inscrição esportiva.');
    }
  }

  async searchMajorEventSubscriptions(): Promise<void> {
    resetPagination(this.majorEventSubscriptionsPagination);
    await this.loadMajorEventSubscriptions();
  }

  async previousMajorEventSubscriptionsPage(): Promise<void> {
    await loadPreviousPage(this.majorEventSubscriptionsPagination, () => this.loadMajorEventSubscriptions());
  }

  async nextMajorEventSubscriptionsPage(): Promise<void> {
    await loadNextPage(this.majorEventSubscriptionsPagination, () => this.loadMajorEventSubscriptions());
  }

  async selectMajorEventSubscriptionById(majorEventId: string, subscriptionId: string): Promise<void> {
    const selectionRequest = ++this.majorEventSubscriptionSelectionRequest;
    const subscription = await firstValueFrom(this.api.getMajorEventSubscription(majorEventId, subscriptionId));
    if (selectionRequest !== this.majorEventSubscriptionSelectionRequest) {
      return;
    }
    this.selectMajorEventSubscription(subscription, false);
  }

  selectMajorEventSubscription(subscription: WorkspaceMajorEventSubscription | null, navigate = true): void {
    this.selectedMajorEventSubscription.set(subscription);
    this.selectedMajorEventPerson.set(null);
    this.setMajorEventEditMode(false);
    if (!subscription) {
      this.selectedEventIds.set(new Set());
      return;
    }
    if (navigate) {
      void this.router.navigate([
        '/subscriptions/major-event',
        subscription.majorEventId,
        'subscription',
        subscription.id,
      ]);
    }
    this.majorEventEditForm.reset({
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: this.fromCentsToCurrencyInput(subscription.amountPaid),
      paymentDate: parseDateOnly(subscription.paymentDate?.slice(0, 10)),
      paymentTier: subscription.paymentTier ?? null,
      imageLicenseAgreementAccepted: Boolean(subscription.imageLicenseAgreementAccepted),
    });
    this.selectedEventIds.set(
      new Set(subscription.events.filter((eventItem) => eventItem.subscribed).map((eventItem) => eventItem.eventId)),
    );
  }

  closeMajorEventSubscriptionDetail(): void {
    this.majorEventSubscriptionSelectionRequest++;
    this.selectMajorEventSubscription(null, false);
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    void this.router.navigate(majorEventId ? ['/subscriptions/major-event', majorEventId] : ['/subscriptions']);
  }

  startNewMajorEventSubscription(): void {
    this.selectedMajorEventSubscription.set(null);
    this.selectedMajorEventPerson.set(null);
    this.majorEventPersonMatches.set([]);
    this.setMajorEventEditMode(true);
    this.majorEventEditForm.reset({
      subscriptionStatus: DEFAULT_SUBSCRIPTION_STATUS,
      amountPaid: null,
      paymentDate: null,
      paymentTier: null,
      imageLicenseAgreementAccepted: false,
    });
    this.selectedEventIds.set(new Set());
  }

  readonly selectedMajorEventEvents = computed(
    () => this.selectedMajorEventSubscription()?.events ?? this.majorEventEvents(),
  );

  enableMajorEventEdit(): void {
    if (!this.selectedMajorEventSubscription()) {
      return;
    }
    this.setMajorEventEditMode(true);
  }

  cancelMajorEventSubscriptionEdit(): void {
    this.selectMajorEventSubscription(this.selectedMajorEventSubscription());
  }

  toggleSelectedEvent(eventId: string): void {
    if (!this.editMode()) {
      return;
    }
    const selectedEventIds = new Set(this.selectedEventIds());
    if (selectedEventIds.has(eventId)) {
      selectedEventIds.delete(eventId);
    } else {
      selectedEventIds.add(eventId);
    }
    this.selectedEventIds.set(selectedEventIds);
  }

  setSelectedEvent(eventId: string, selected: boolean): void {
    if (!this.editMode()) {
      return;
    }

    const selectedEventIds = new Set(this.selectedEventIds());
    if (selected) {
      selectedEventIds.add(eventId);
    } else {
      selectedEventIds.delete(eventId);
    }
    this.selectedEventIds.set(selectedEventIds);
  }

  async findMajorEventPerson(): Promise<void> {
    this.majorEventPersonMatches.set(
      await this.findPeople(
        this.majorEventPersonForm.controls.identifierType.value,
        this.majorEventPersonForm.controls.identifier.value,
      ),
    );
  }

  selectMajorEventPerson(person: Person): void {
    if (!this.editMode()) {
      return;
    }
    this.selectedMajorEventPerson.set(person);
    this.majorEventPersonMatches.set([]);
  }

  async saveMajorEventSubscription(): Promise<void> {
    if (!this.editMode()) {
      return;
    }
    const selected = this.selectedMajorEventSubscription();
    const selectedEventIds = [...this.selectedEventIds()];
    const formValue = this.majorEventEditForm.getRawValue();
    const input = {
      subscriptionStatus: formValue.subscriptionStatus,
      amountPaid: this.toCents(formValue.amountPaid),
      paymentDate: formatDateOnly(formValue.paymentDate),
      paymentTier: formValue.paymentTier,
      imageLicenseAgreementAccepted: formValue.imageLicenseAgreementAccepted,
      selectedEventIds,
    };

    try {
      const saved = selected
        ? await firstValueFrom(this.api.updateMajorEventSubscription(selected.id, input))
        : await this.createMajorEventSubscription(input);

      this.replaceMajorEventSubscription(saved);
      this.selectMajorEventSubscription(saved);
      await this.attendancesService.refreshMajorEventUserAttendancesFor(saved.majorEventId);
      this.snackbar.open('Inscrição salva.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar a inscrição.');
    }
  }

  private async createMajorEventSubscription(input: {
    subscriptionStatus: SubscriptionStatus;
    amountPaid: number | null;
    paymentDate: string | null;
    paymentTier: string | null;
    imageLicenseAgreementAccepted: boolean;
    selectedEventIds: string[];
  }): Promise<WorkspaceMajorEventSubscription> {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    const person = this.selectedMajorEventPerson();
    if (!majorEventId || !person) {
      throw new Error('Selecione um grande evento e uma pessoa.');
    }

    return firstValueFrom(
      this.api.createMajorEventSubscription({
        majorEventId,
        personId: person.id,
        ...input,
      }),
    );
  }

  private toCents(value: number | null): number | null {
    return value === null || !Number.isFinite(value) ? null : Math.round(value * 100);
  }

  private fromCentsToCurrencyInput(value: number | null | undefined): number | null {
    return value === null || value === undefined ? null : value / 100;
  }

  private setMajorEventEditMode(enabled: boolean): void {
    this.editMode.set(enabled);
    if (enabled) {
      this.majorEventEditForm.enable({ emitEvent: false });
      return;
    }
    this.majorEventEditForm.disable({ emitEvent: false });
  }

  private replaceMajorEventSubscription(subscription: WorkspaceMajorEventSubscription): void {
    const subscriptions = this.majorEventSubscriptions();
    const index = subscriptions.findIndex((item) => item.id === subscription.id);
    if (index === -1) {
      this.majorEventSubscriptions.set([subscription, ...subscriptions]);
      return;
    }
    this.majorEventSubscriptions.set(subscriptions.map((item) => (item.id === subscription.id ? subscription : item)));
  }

  private async findPeople(identifierType: string, identifierValue: string): Promise<Person[]> {
    if (identifierType === 'query') {
      const searches = buildPeopleCandidateLookupFilters(identifierValue, 10).map((filters) =>
        firstValueFrom(this.peopleApi.listPeopleSummaries(filters)),
      );
      const peopleById = new Map<string, Person>();
      for (const person of (await Promise.all(searches)).flat()) {
        peopleById.set(person.id, person);
      }
      return [...peopleById.values()].slice(0, 10);
    }

    const filters = buildPeopleLookupFilters(identifierType, identifierValue, { take: 10 });
    if (!filters) {
      return [];
    }
    return firstValueFrom(this.peopleApi.listPeopleSummaries(filters));
  }

  private async refreshMajorEventAttendancesForEvent(eventId: string): Promise<void> {
    const event = this.selectedEvent();
    if (event?.id !== eventId || !event.majorEventId) {
      return;
    }

    await this.attendancesService.refreshMajorEventUserAttendancesFor(event.majorEventId);
  }

  async importMajorEventSubscriptionsFromCsv(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventForm.controls.majorEventId.markAsTouched();
      this.snackbar.open('Selecione um grande evento antes de importar.', 'Fechar', { duration: 3000 });
      return;
    }

    this.isImportingCsv.set(true);
    try {
      const csvContent = await file.text();
      const parsedCsv = parseCsv(csvContent);
      const columnDialogRef = this.dialog.open(SubscriptionCsvColumnDialogComponent, {
        width: '40rem',
        maxHeight: '80vh',
        data: {
          fileName: file.name,
          headers: parsedCsv.headers,
          previewRows: parsedCsv.rows.slice(0, 12),
        },
      });
      const importConfig = await firstValueFrom(columnDialogRef.afterClosed());
      if (!importConfig) {
        return;
      }

      const result = await firstValueFrom(
        this.attendanceApi.importMajorEventSubscriptionsFromCsv({
          majorEventId,
          csvContent,
          subscriptionStatus: importConfig.subscriptionStatus,
          columnMapping: importConfig.columnMapping,
        }),
      );

      await this.loadMajorEventSubscriptions();
      this.dialog.open(SubscriptionCsvImportResultDialogComponent, {
        width: '40rem',
        maxHeight: '80vh',
        data: result,
      });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível importar o CSV.');
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  async exportEventSubscriptionsCsv(): Promise<void> {
    const event = this.selectedEvent();
    const eventId = this.eventSubscriptionForm.controls.eventId.value;
    if (!event || !eventId) {
      this.snackbar.open('Selecione um evento antes de baixar o CSV.', 'Fechar', { duration: 3000 });
      return;
    }

    let subscriptions: WorkspaceEventSubscription[];
    let options: SubscriberCsvExportDialogOptions | null;
    try {
      subscriptions = await this.fetchAllEventSubscriptions(eventId);
      this.eventSubscriptions.set(subscriptions);
      options = await this.openExportDialog('Baixar inscrições do evento', subscriptions.length);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível preparar a exportação do CSV.');
      return;
    }
    if (!options) {
      return;
    }

    try {
      if (options.badgeCodes.enabled) {
        const archive = await firstValueFrom(this.api.downloadEventSubscriptionBadgeArchive(eventId, options));
        this.downloadBlob(archive.fileName, archive.blob);
        return;
      }

      this.downloadCsv(`inscricoes-${this.slugify(event.name)}.csv`, buildSubscriberCsv(subscriptions, options));
    } catch (error) {
      await this.openBadgeExportError(error);
    }
  }

  async exportMajorEventSubscriptionsCsv(): Promise<void> {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventForm.controls.majorEventId.markAsTouched();
      this.snackbar.open('Selecione um grande evento antes de baixar o CSV.', 'Fechar', { duration: 3000 });
      return;
    }

    let subscriptions: WorkspaceMajorEventSubscription[];
    let options: SubscriberCsvExportDialogOptions | null;
    try {
      subscriptions = await this.fetchAllMajorEventSubscriptions(majorEventId);
      this.majorEventSubscriptions.set(subscriptions);
      options = await this.openExportDialog('Baixar inscrições do grande evento', subscriptions.length);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível preparar a exportação do CSV.');
      return;
    }
    if (!options) {
      return;
    }

    try {
      if (options.badgeCodes.enabled) {
        const archive = await firstValueFrom(
          this.api.downloadMajorEventSubscriptionBadgeArchive(majorEventId, options),
        );
        this.downloadBlob(archive.fileName, archive.blob);
        return;
      }

      const majorEventName =
        subscriptions[0]?.majorEvent?.name ??
        this.majorEvents().find((item) => item.id === majorEventId)?.name ??
        majorEventId;
      this.downloadCsv(`inscricoes-${this.slugify(majorEventName)}.csv`, buildSubscriberCsv(subscriptions, options));
    } catch (error) {
      await this.openBadgeExportError(error);
    }
  }

  private async fetchAllEventSubscriptions(eventId: string): Promise<WorkspaceEventSubscription[]> {
    const subscriptions: WorkspaceEventSubscription[] = [];
    for (let skip = 0; ; skip += EXPORT_PAGE_SIZE) {
      const page = await firstValueFrom(this.api.listEventSubscriptions(eventId, { skip, take: EXPORT_PAGE_SIZE }));
      subscriptions.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) {
        return subscriptions;
      }
    }
  }

  private async fetchAllMajorEventSubscriptions(majorEventId: string): Promise<WorkspaceMajorEventSubscription[]> {
    const subscriptions: WorkspaceMajorEventSubscription[] = [];
    for (let skip = 0; ; skip += EXPORT_PAGE_SIZE) {
      const page = await firstValueFrom(
        this.api.listMajorEventSubscriptions(majorEventId, { skip, take: EXPORT_PAGE_SIZE }),
      );
      subscriptions.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) {
        return subscriptions;
      }
    }
  }

  private async openExportDialog(title: string, recordCount: number): Promise<SubscriberCsvExportDialogOptions | null> {
    const dialogRef = this.dialog.open<
      SubscriberCsvExportDialogComponent,
      { title: string; recordCount: number },
      SubscriberCsvExportDialogOptions | null
    >(SubscriberCsvExportDialogComponent, {
      width: 'min(58rem, calc(100vw - 2rem))',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: '90vh',
      data: {
        title,
        recordCount,
      },
    });

    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  private downloadCsv(fileName: string, csvContent: string): void {
    this.downloadBlob(fileName, new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' }));
  }

  private downloadBlob(fileName: string, blob: Blob): void {
    const windowRef = this.document.defaultView;
    const body = this.document.body;
    if (!windowRef || !body) {
      return;
    }

    const url = windowRef.URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    body.append(anchor);
    anchor.click();
    anchor.remove();
    windowRef.URL.revokeObjectURL(url);
  }

  private async openBadgeExportError(error: unknown): Promise<void> {
    this.dialog.open(SubscriberBadgeExportErrorDialogComponent, {
      width: 'min(32rem, calc(100vw - 2rem))',
      data: {
        message: await this.badgeExportErrorMessage(error),
      },
    });
  }

  private async badgeExportErrorMessage(error: unknown): Promise<string> {
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      try {
        const payload = JSON.parse(await error.error.text()) as { message?: string | string[] };
        if (typeof payload.message === 'string') {
          return payload.message;
        }
        if (Array.isArray(payload.message)) {
          return payload.message.join(' ');
        }
      } catch {
        // Fall through to the generic error message.
      }
    }

    return getErrorMessage(error, 'Não foi possível gerar o arquivo de inscrições.');
  }

  private slugify(value: string): string {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'dados'
    );
  }
}
