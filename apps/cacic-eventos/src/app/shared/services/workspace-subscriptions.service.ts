import { computed, inject, Injectable, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import {
  Event,
  Person,
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '../../graphql/models';
import { PeopleApiService } from '../../graphql/people-api.service';
import { SubscriptionApiService } from '../../graphql/subscription-api.service';
import { SubscriptionCsvColumnDialogComponent } from '../../workspace/dialogs/subscription-csv-column-dialog.component';
import { SubscriptionCsvImportResultDialogComponent } from '../../workspace/dialogs/subscription-csv-import-result-dialog.component';
import { buildEventListFilters, resetEventFiltersForm } from '../event-list-filters';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceAttendancesService } from './workspace-attendances.service';

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = 'CONFIRMED';

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

  readonly majorEvents = this.majorEventsService.majorEvents;
  readonly eventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateTo: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
  });
  readonly eventResults = signal<Event[]>([]);
  readonly selectedEvent = signal<Event | null>(null);
  readonly eventSubscriptions = signal<WorkspaceEventSubscription[]>([]);
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
  readonly majorEventEvents = signal<WorkspaceMajorEventSubscriptionEvent[]>([]);
  readonly selectedMajorEventSubscription = signal<WorkspaceMajorEventSubscription | null>(null);
  readonly majorEventPersonMatches = signal<Person[]>([]);
  readonly selectedMajorEventPerson = signal<Person | null>(null);
  readonly editMode = signal(false);
  readonly selectedEventIds = signal<Set<string>>(new Set());
  readonly isImportingCsv = signal(false);

  async searchEvents(): Promise<void> {
    const events = await firstValueFrom(
      this.eventApi.listEvents(buildEventListFilters(this.eventFiltersForm.value, 80)),
    );
    this.eventResults.set(events);
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm);
    await this.searchEvents();
  }

  async selectEvent(eventItem: Event): Promise<void> {
    void this.router.navigate(['/subscriptions/event', eventItem.id]);
    this.selectedEvent.set(eventItem);
    this.eventSubscriptionForm.controls.eventId.setValue(eventItem.id);
    await this.loadEventSubscriptions(eventItem.id);
  }

  async selectEventById(eventId: string): Promise<void> {
    if (this.selectedEvent()?.id !== eventId) {
      this.selectedEvent.set(await firstValueFrom(this.eventApi.getEvent(eventId)));
    }
    this.eventSubscriptionForm.controls.eventId.setValue(eventId);
    await this.loadEventSubscriptions(eventId);
  }

  async loadEventSubscriptions(eventId?: string): Promise<void> {
    const resolvedEventId = eventId || this.eventSubscriptionForm.controls.eventId.value;
    if (!resolvedEventId) {
      this.eventSubscriptions.set([]);
      return;
    }
    this.eventSubscriptions.set(await firstValueFrom(this.api.listEventSubscriptions(resolvedEventId)));
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
    await firstValueFrom(this.api.createEventSubscription({ eventId, personId: person.id }));
    await this.loadEventSubscriptions(eventId);
    await this.refreshMajorEventAttendancesForEvent(eventId);
    this.eventPersonMatches.set([]);
    this.snackbar.open('Inscrição criada.', 'Fechar', { duration: 2500 });
  }

  async selectMajorEventById(majorEventId: string): Promise<void> {
    this.majorEventForm.controls.majorEventId.setValue(majorEventId);
    void this.router.navigate(['/subscriptions/major-event', majorEventId]);
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
    const subscriptions = await firstValueFrom(this.api.listMajorEventSubscriptions(majorEventId));
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
    this.majorEventSubscriptions.set(subscriptions);
    this.selectMajorEventSubscription(subscriptions[0] ?? null);
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

  toggleSelectedEvent(eventId: string): void {
    const selectedEventIds = new Set(this.selectedEventIds());
    if (selectedEventIds.has(eventId)) {
      selectedEventIds.delete(eventId);
    } else {
      selectedEventIds.add(eventId);
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

    const saved = selected
      ? await firstValueFrom(this.api.updateMajorEventSubscription(selected.id, input))
      : await this.createMajorEventSubscription(input);

    this.replaceMajorEventSubscription(saved);
    this.selectMajorEventSubscription(saved);
    await this.attendancesService.refreshMajorEventUserAttendancesFor(saved.majorEventId);
    this.snackbar.open('Inscrição salva.', 'Fechar', { duration: 2500 });
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
      this.peopleApi.listPeople({
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
      const parsedCsv = this.parseCsv(csvContent);
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
      this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível importar o CSV.', 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  private parseCsv(csvContent: string): CsvParseResult {
    const records: string[][] = [];
    const delimiter = this.detectCsvDelimiter(csvContent);
    let currentField = '';
    let currentRecord: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < csvContent.length; index += 1) {
      const char = csvContent[index];
      const nextChar = csvContent[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        currentRecord.push(currentField);
        currentField = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          index += 1;
        }
        currentRecord.push(currentField);
        if (currentRecord.some((field) => field.trim().length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        continue;
      }

      currentField += char;
    }

    currentRecord.push(currentField);
    if (currentRecord.some((field) => field.trim().length > 0)) {
      records.push(currentRecord);
    }

    const [headerRecord, ...dataRecords] = records;
    const headers = (headerRecord ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
    if (headers.length === 0) {
      throw new Error('O CSV precisa incluir uma linha de cabeçalho.');
    }

    return {
      headers,
      rows: dataRecords.map((record) =>
        headers.reduce<Record<string, string>>((row, header, index) => {
          row[header] = record[index]?.trim() ?? '';
          return row;
        }, {}),
      ),
    };
  }

  private detectCsvDelimiter(csvContent: string): string {
    const firstLine = csvContent.split(/\r?\n/, 1)[0] ?? '';
    const candidates = [',', ';', '\t'];
    return candidates.reduce((bestDelimiter, delimiter) => {
      const bestCount = firstLine.split(bestDelimiter).length;
      const candidateCount = firstLine.split(delimiter).length;
      return candidateCount > bestCount ? delimiter : bestDelimiter;
    }, ',');
  }
}
