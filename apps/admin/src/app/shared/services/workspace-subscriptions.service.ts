import { DOCUMENT } from '@angular/common';
import { DestroyRef, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseCsv } from '@cacic-fct/shared-utils';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import {
  Event,
  MajorEventPriceTier,
  Person,
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../graphql/people-api.service';
import { SubscriptionApiService } from '../../graphql/subscription-api.service';
import { SubscriptionCsvColumnDialogComponent } from '../../workspace/dialogs/subscription-csv-column-dialog.component';
import { SubscriptionCsvImportResultDialogComponent } from '../../workspace/dialogs/subscription-csv-import-result-dialog.component';
import { SubscriberCsvExportDialogComponent } from '../../workspace/dialogs/subscriber-csv-export-dialog.component';
import { getErrorMessage } from '../error-message';
import { buildEventListFilters, resetEventFiltersForm } from '../event-list-filters';
import { bindLiveSearch } from '../live-search';
import {
  WORKSPACE_LIST_PAGE_SIZE,
  applyPagedResult,
  createWorkspaceListPagination,
  resetPagination,
} from '../list-pagination';
import { buildSubscriberCsv } from '../subscriber-csv-export';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceAttendancesService } from './workspace-attendances.service';

const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = 'CONFIRMED';
const EXPORT_PAGE_SIZE = 1000;

@Injectable({
  providedIn: 'root',
})
export class WorkspaceSubscriptionsService {
  private readonly api = inject(SubscriptionApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);
  private readonly attendancesService = inject(WorkspaceAttendancesService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly attendanceApi = inject(AttendanceApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly majorEvents = this.majorEventsService.majorEvents;
  readonly eventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateUntil: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
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
  private readonly selectedMajorEventId = signal('');
  private readonly majorEventSearchQuery = signal('');
  readonly majorEventPersonForm = this.formBuilder.nonNullable.group({
    identifierType: ['email'],
    identifier: ['', [Validators.required]],
  });
  readonly majorEventEditForm = this.formBuilder.group({
    subscriptionStatus: this.formBuilder.nonNullable.control<SubscriptionStatus>(DEFAULT_SUBSCRIPTION_STATUS, [
      Validators.required,
    ]),
    amountPaid: this.formBuilder.control<number | null>(null),
    paymentDate: this.formBuilder.control<string | null>(null),
    paymentTier: this.formBuilder.control<string | null>(null),
  });
  readonly majorEventSubscriptions = signal<WorkspaceMajorEventSubscription[]>([]);
  readonly majorEventSubscriptionsPagination = createWorkspaceListPagination();
  readonly majorEventEvents = signal<WorkspaceMajorEventSubscriptionEvent[]>([]);
  readonly selectedMajorEventSubscription = signal<WorkspaceMajorEventSubscription | null>(null);
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
    this.majorEventForm.controls.majorEventId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((majorEventId) => this.selectedMajorEventId.set(majorEventId));
    this.majorEventSearchForm.controls.query.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.majorEventSearchQuery.set(query));
    bindLiveSearch({
      control: this.eventFiltersForm,
      destroyRef: this.destroyRef,
      search: () => this.searchEvents(),
    });
  }

  async searchEvents(): Promise<void> {
    resetPagination(this.eventResultsPagination);
    await this.loadEventResultsPage();
  }

  async previousEventResultsPage(): Promise<void> {
    this.eventResultsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadEventResultsPage();
  }

  async nextEventResultsPage(): Promise<void> {
    if (!this.eventResultsPagination.hasNextPage()) {
      return;
    }
    this.eventResultsPagination.pageIndex.update((page) => page + 1);
    await this.loadEventResultsPage();
  }

  private async loadEventResultsPage(): Promise<void> {
    const events = await firstValueFrom(
      this.eventApi.listEvents({
        ...buildEventListFilters(this.eventFiltersForm.value, WORKSPACE_LIST_PAGE_SIZE + 1),
        skip: this.eventResultsPagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE,
      }),
    );
    this.eventResults.set(applyPagedResult(events, this.eventResultsPagination));
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm, { emitEvent: false });
    await this.searchEvents();
  }

  async selectEvent(eventItem: Event): Promise<void> {
    void this.router.navigate(['/subscriptions/event', eventItem.id]);
    this.selectedEvent.set(eventItem);
    this.eventSubscriptionForm.controls.eventId.setValue(eventItem.id);
    resetPagination(this.eventSubscriptionsPagination);
    await this.loadEventSubscriptions(eventItem.id);
  }

  async selectEventById(eventId: string): Promise<void> {
    if (this.selectedEvent()?.id !== eventId) {
      this.selectedEvent.set(await firstValueFrom(this.eventApi.getEvent(eventId)));
    }
    this.eventSubscriptionForm.controls.eventId.setValue(eventId);
    resetPagination(this.eventSubscriptionsPagination);
    await this.loadEventSubscriptions(eventId);
  }

  async loadEventSubscriptions(eventId?: string): Promise<void> {
    const resolvedEventId = eventId || this.eventSubscriptionForm.controls.eventId.value;
    if (!resolvedEventId) {
      this.eventSubscriptions.set([]);
      return;
    }
    this.eventSubscriptions.set(
      applyPagedResult(
        await firstValueFrom(
          this.api.listEventSubscriptions(resolvedEventId, {
            skip: this.eventSubscriptionsPagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE,
            take: WORKSPACE_LIST_PAGE_SIZE + 1,
          }),
        ),
        this.eventSubscriptionsPagination,
      ),
    );
  }

  async previousEventSubscriptionsPage(): Promise<void> {
    this.eventSubscriptionsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadEventSubscriptions();
  }

  async nextEventSubscriptionsPage(): Promise<void> {
    if (!this.eventSubscriptionsPagination.hasNextPage()) {
      return;
    }
    this.eventSubscriptionsPagination.pageIndex.update((page) => page + 1);
    await this.loadEventSubscriptions();
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível criar a inscrição.'), 'Fechar', { duration: 5000 });
    }
  }

  async selectMajorEventById(majorEventId: string): Promise<void> {
    this.majorEventForm.controls.majorEventId.setValue(majorEventId);
    void this.router.navigate(['/subscriptions/major-event', majorEventId]);
    resetPagination(this.majorEventSubscriptionsPagination);
    await this.loadMajorEventSubscriptions();
  }

  async loadMajorEventSubscriptions(): Promise<void> {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventSubscriptions.set([]);
      this.selectedMajorEventSubscription.set(null);
      return;
    }
    void this.router.navigate(['/subscriptions/major-event', majorEventId]);
    const subscriptions = await firstValueFrom(
      this.api.listMajorEventSubscriptions(majorEventId, {
        skip: this.majorEventSubscriptionsPagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE,
        take: WORKSPACE_LIST_PAGE_SIZE + 1,
      }),
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
    this.selectMajorEventSubscription(visibleSubscriptions[0] ?? null);
  }

  async previousMajorEventSubscriptionsPage(): Promise<void> {
    this.majorEventSubscriptionsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadMajorEventSubscriptions();
  }

  async nextMajorEventSubscriptionsPage(): Promise<void> {
    if (!this.majorEventSubscriptionsPagination.hasNextPage()) {
      return;
    }
    this.majorEventSubscriptionsPagination.pageIndex.update((page) => page + 1);
    await this.loadMajorEventSubscriptions();
  }

  selectMajorEventSubscription(subscription: WorkspaceMajorEventSubscription | null): void {
    this.selectedMajorEventSubscription.set(subscription);
    this.selectedMajorEventPerson.set(null);
    this.editMode.set(false);
    if (!subscription) {
      this.selectedEventIds.set(new Set());
      return;
    }
    this.majorEventEditForm.reset({
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: subscription.amountPaid ?? null,
      paymentDate: subscription.paymentDate?.slice(0, 10) ?? null,
      paymentTier: subscription.paymentTier ?? null,
    });
    this.selectedEventIds.set(
      new Set(subscription.events.filter((eventItem) => eventItem.subscribed).map((eventItem) => eventItem.eventId)),
    );
  }

  startNewMajorEventSubscription(): void {
    this.selectedMajorEventSubscription.set(null);
    this.selectedMajorEventPerson.set(null);
    this.majorEventPersonMatches.set([]);
    this.editMode.set(true);
    this.majorEventEditForm.reset({
      subscriptionStatus: DEFAULT_SUBSCRIPTION_STATUS,
      amountPaid: null,
      paymentDate: null,
      paymentTier: null,
    });
    this.selectedEventIds.set(new Set());
  }

  readonly selectedMajorEventEvents = computed(
    () => this.selectedMajorEventSubscription()?.events ?? this.majorEventEvents(),
  );

  enableMajorEventEdit(): void {
    this.editMode.set(true);
  }

  cancelMajorEventSubscriptionEdit(): void {
    this.selectMajorEventSubscription(this.selectedMajorEventSubscription());
  }

  toggleSelectedEvent(eventId: string): void {
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
    this.selectedMajorEventPerson.set(person);
    this.majorEventPersonMatches.set([]);
  }

  async saveMajorEventSubscription(): Promise<void> {
    const selected = this.selectedMajorEventSubscription();
    const selectedEventIds = [...this.selectedEventIds()];
    const formValue = this.majorEventEditForm.getRawValue();
    const input = {
      subscriptionStatus: formValue.subscriptionStatus,
      amountPaid: formValue.amountPaid,
      paymentDate: formValue.paymentDate,
      paymentTier: formValue.paymentTier,
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar a inscrição.'), 'Fechar', { duration: 5000 });
    }
  }

  private async createMajorEventSubscription(input: {
    subscriptionStatus: SubscriptionStatus;
    amountPaid: number | null;
    paymentDate: string | null;
    paymentTier: string | null;
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
    const identifier = identifierValue.trim();
    if (!identifier) {
      return [];
    }
    return firstValueFrom(
      this.peopleApi.listPeopleSummaries({
        ...(identifierType === 'userId' ? { userId: identifier } : {}),
        ...(identifierType === 'identityDocument' ? { identityDocument: identifier } : {}),
        ...(identifierType === 'email' ? { email: identifier } : {}),
        ...(identifierType === 'phone' ? { phone: identifier } : {}),
        ...(identifierType === 'query' ? { query: identifier } : {}),
        take: 10,
      }),
    );
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível importar o CSV.'), 'Fechar', {
        duration: 5000,
      });
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

    const subscriptions = await this.fetchAllEventSubscriptions(eventId);
    this.eventSubscriptions.set(subscriptions);
    const options = await this.openExportDialog('Baixar inscrições do evento', subscriptions.length);
    if (!options) {
      return;
    }

    this.downloadCsv(`inscricoes-${this.slugify(event.name)}.csv`, buildSubscriberCsv(subscriptions, options));
  }

  async exportMajorEventSubscriptionsCsv(): Promise<void> {
    const majorEventId = this.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventForm.controls.majorEventId.markAsTouched();
      this.snackbar.open('Selecione um grande evento antes de baixar o CSV.', 'Fechar', { duration: 3000 });
      return;
    }

    const subscriptions = await this.fetchAllMajorEventSubscriptions(majorEventId);
    this.majorEventSubscriptions.set(subscriptions);
    const options = await this.openExportDialog('Baixar inscrições do grande evento', subscriptions.length);
    if (!options) {
      return;
    }

    const majorEventName =
      subscriptions[0]?.majorEvent?.name ??
      this.majorEvents().find((item) => item.id === majorEventId)?.name ??
      majorEventId;
    this.downloadCsv(`inscricoes-${this.slugify(majorEventName)}.csv`, buildSubscriberCsv(subscriptions, options));
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

  private async openExportDialog(title: string, recordCount: number) {
    const dialogRef = this.dialog.open(SubscriberCsvExportDialogComponent, {
      width: '32rem',
      data: {
        title,
        recordCount,
      },
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private downloadCsv(fileName: string, csvContent: string): void {
    const windowRef = this.document.defaultView;
    const body = this.document.body;
    if (!windowRef || !body) {
      return;
    }

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const url = windowRef.URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    windowRef.URL.revokeObjectURL(url);
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
