import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { Event, MajorEventUserAttendance, Person } from '../../graphql/models';
import { AttendanceCsvColumnDialogComponent } from '../../workspace/dialogs/attendance-csv-column-dialog.component';
import { AttendanceCsvImportResultDialogComponent } from '../../workspace/dialogs/attendance-csv-import-result-dialog.component';
import { SubscriptionCsvColumnDialogComponent } from '../../workspace/dialogs/subscription-csv-column-dialog.component';
import { SubscriptionCsvImportResultDialogComponent } from '../../workspace/dialogs/subscription-csv-import-result-dialog.component';
import {
  buildEventListFilters,
  resetEventFiltersForm,
} from '../event-list-filters';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

type AttendanceListItem = {
  eventName: string;
  personName: string;
  attendedAt: string;
  createdByMethod: string;
};

@Injectable({
  providedIn: 'root',
})
export class WorkspaceAttendancesService {
  private readonly api = inject(AttendanceApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);

  readonly majorEvents = this.majorEventsService.majorEvents;

  readonly attendanceEventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateTo: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
  });

  readonly attendanceEventResults = signal<Event[]>([]);
  readonly selectedAttendanceEvent = signal<Event | null>(null);
  readonly attendancePersonMatches = signal<Person[]>([]);
  readonly attendances = signal<AttendanceListItem[]>([]);
  readonly majorEventUserAttendances = signal<MajorEventUserAttendance[]>([]);
  readonly selectedMajorEventUserAttendance =
    signal<MajorEventUserAttendance | null>(null);
  readonly isImportingCsv = signal(false);

  readonly attendanceForm = this.formBuilder.nonNullable.group({
    eventId: ['', [Validators.required]],
    identifierType: ['userId'],
    identifier: ['', [Validators.required]],
  });

  readonly majorEventAttendanceForm = this.formBuilder.nonNullable.group({
    majorEventId: ['', [Validators.required]],
  });

  async searchAttendanceEvents(): Promise<void> {
    const events = await firstValueFrom(
      this.eventApi.listEvents(
        buildEventListFilters(this.attendanceEventFiltersForm.value, 80),
      ),
    );
    this.attendanceEventResults.set(events);

    const selectedEventId = this.attendanceForm.controls.eventId.value;
    const refreshedSelection = events.find(
      (eventItem) => eventItem.id === selectedEventId,
    );

    if (refreshedSelection) {
      this.selectedAttendanceEvent.set(refreshedSelection);
      return;
    }

    if (!selectedEventId) {
      this.selectedAttendanceEvent.set(null);
      return;
    }
  }

  async resetAttendanceEventFilters(): Promise<void> {
    resetEventFiltersForm(this.attendanceEventFiltersForm);
    await this.searchAttendanceEvents();
  }

  async selectAttendanceEvent(eventItem: Event): Promise<void> {
    this.selectedAttendanceEvent.set(eventItem);
    this.attendanceForm.controls.eventId.setValue(eventItem.id);
    this.attendancePersonMatches.set([]);
    await this.loadAttendances(eventItem.id);
  }

  async findAttendancePerson(): Promise<void> {
    if (this.attendanceForm.invalid) {
      this.attendanceForm.markAllAsTouched();
      return;
    }

    const identifierType = this.attendanceForm.controls.identifierType.value;
    const identifier = this.attendanceForm.controls.identifier.value.trim();

    const people = await firstValueFrom(
      this.peopleApi.listPeople({
        ...(identifierType === 'userId' ? { userId: identifier } : {}),
        ...(identifierType === 'identityDocument'
          ? { identityDocument: identifier }
          : {}),
        ...(identifierType === 'email' ? { email: identifier } : {}),
        ...(identifierType === 'phone' ? { phone: identifier } : {}),
        take: 10,
      }),
    );
    this.attendancePersonMatches.set(people);
  }

  async registerAttendance(person: Person): Promise<void> {
    const eventId = this.attendanceForm.controls.eventId.value;
    if (!eventId) {
      return;
    }
    await firstValueFrom(
      this.api.createEventAttendance({
        eventId,
        personId: person.id,
      }),
    );
    await this.loadAttendances(eventId);
    this.snackbar.open('Presença registrada.', 'Fechar', { duration: 2500 });
  }

  async importAttendancesFromCsv(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    const eventId = this.attendanceForm.controls.eventId.value;
    if (!eventId) {
      this.attendanceForm.controls.eventId.markAsTouched();
      this.snackbar.open('Selecione um evento antes de importar.', 'Fechar', {
        duration: 3000,
      });
      return;
    }

    this.isImportingCsv.set(true);
    try {
      const csvContent = await file.text();
      const parsedCsv = this.parseCsv(csvContent);
      const columnDialogRef = this.dialog.open(
        AttendanceCsvColumnDialogComponent,
        {
          width: '32rem',
          data: {
            fileName: file.name,
            headers: parsedCsv.headers,
            previewRows: parsedCsv.rows.slice(0, 12),
          },
        },
      );
      const selectedHeader = await firstValueFrom(
        columnDialogRef.afterClosed(),
      );
      if (!selectedHeader) {
        return;
      }

      const result = await firstValueFrom(
        this.api.importEventAttendancesFromCsv({
          eventId,
          csvContent,
          selectedHeader,
        }),
      );

      await this.loadAttendances(eventId);
      this.dialog.open(AttendanceCsvImportResultDialogComponent, {
        width: '36rem',
        maxHeight: '80vh',
        data: result,
      });
    } catch (error) {
      this.snackbar.open(
        error instanceof Error
          ? error.message
          : 'Não foi possível importar o CSV.',
        'Fechar',
        { duration: 5000 },
      );
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  async importMajorEventSubscriptionsFromCsv(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    const majorEventId =
      this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventAttendanceForm.controls.majorEventId.markAsTouched();
      this.snackbar.open(
        'Selecione um grande evento antes de importar.',
        'Fechar',
        { duration: 3000 },
      );
      return;
    }

    this.isImportingCsv.set(true);
    try {
      const csvContent = await file.text();
      const parsedCsv = this.parseCsv(csvContent);
      const columnDialogRef = this.dialog.open(
        SubscriptionCsvColumnDialogComponent,
        {
          width: '40rem',
          maxHeight: '80vh',
          data: {
            fileName: file.name,
            headers: parsedCsv.headers,
            previewRows: parsedCsv.rows.slice(0, 12),
          },
        },
      );
      const importConfig = await firstValueFrom(columnDialogRef.afterClosed());
      if (!importConfig) {
        return;
      }

      const result = await firstValueFrom(
        this.api.importMajorEventSubscriptionsFromCsv({
          majorEventId,
          csvContent,
          subscriptionStatus: importConfig.subscriptionStatus,
          columnMapping: importConfig.columnMapping,
        }),
      );

      await this.loadMajorEventUserAttendances();
      this.dialog.open(SubscriptionCsvImportResultDialogComponent, {
        width: '40rem',
        maxHeight: '80vh',
        data: result,
      });
    } catch (error) {
      this.snackbar.open(
        error instanceof Error
          ? error.message
          : 'Não foi possível importar o CSV.',
        'Fechar',
        { duration: 5000 },
      );
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  async loadAttendances(eventId: string): Promise<void> {
    if (!eventId) {
      this.attendances.set([]);
      return;
    }
    const data = await firstValueFrom(this.api.listEventAttendances(eventId));
    this.attendances.set(
      data.map((attendance) => ({
        eventName: attendance.event?.name ?? attendance.eventId,
        personName: attendance.person?.name ?? attendance.personId,
        attendedAt: attendance.attendedAt,
        createdByMethod: attendance.createdByMethod,
      })),
    );
  }

  async loadMajorEventUserAttendances(): Promise<void> {
    const majorEventId =
      this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventUserAttendances.set([]);
      this.selectedMajorEventUserAttendance.set(null);
      return;
    }

    const attendances = await firstValueFrom(
      this.api.listMajorEventUserAttendances(majorEventId, { take: 200 }),
    );
    this.majorEventUserAttendances.set(attendances);

    const selected = this.selectedMajorEventUserAttendance();
    if (selected) {
      const refreshedSelection = attendances.find(
        (attendance) => attendance.subscriptionId === selected.subscriptionId,
      );
      if (refreshedSelection) {
        this.selectedMajorEventUserAttendance.set(refreshedSelection);
        return;
      }
    }

    this.selectedMajorEventUserAttendance.set(attendances[0] ?? null);
  }

  selectMajorEventUserAttendance(attendance: MajorEventUserAttendance): void {
    this.selectedMajorEventUserAttendance.set(attendance);
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
    const headers = (headerRecord ?? []).map((header) =>
      header.replace(/^\uFEFF/, '').trim(),
    );
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
