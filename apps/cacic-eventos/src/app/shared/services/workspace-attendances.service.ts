import { computed, Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { AttendanceCategory, Event, MajorEventUserAttendance, Person } from '../../graphql/models';
import { AttendanceCsvColumnDialogComponent } from '../../workspace/dialogs/attendance-csv-column-dialog.component';
import { AttendanceCsvImportResultDialogComponent } from '../../workspace/dialogs/attendance-csv-import-result-dialog.component';
import { WorkspaceAttendanceInfoDialogComponent } from '../../workspace/dialogs/workspace-attendance-info-dialog.component';
import { WorkspaceAttendanceScannerDialogComponent } from '../../workspace/dialogs/workspace-attendance-scanner-dialog.component';
import { buildEventListFilters, resetEventFiltersForm } from '../event-list-filters';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

type AttendanceListItem = {
  eventId: string;
  eventName: string;
  personId: string;
  personName: string;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: string;
  collectedByFullName?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
  category: AttendanceCategory;
};

type AttendanceCategoryGroup = {
  category: AttendanceCategory;
  label: string;
  description: string;
  attendances: MajorEventUserAttendance[];
};

const ATTENDANCE_CATEGORY_ORDER: AttendanceCategory[] = ['REGULAR', 'NON_SUBSCRIBED', 'NON_PAYING', 'UNKNOWN'];

const ATTENDANCE_CATEGORY_LABELS: Record<AttendanceCategory, { label: string; description: string }> = {
  NON_PAYING: {
    label: 'Sem pagamento',
    description: 'Presenças em grande evento pago sem pagamento confirmado.',
  },
  NON_SUBSCRIBED: {
    label: 'Sem inscrição na atividade',
    description: 'Presenças em atividades com inscrição obrigatória.',
  },
  REGULAR: {
    label: 'Regulares',
    description: 'Presenças esperadas para inscrição e pagamento atuais.',
  },
  UNKNOWN: {
    label: 'Indefinidas',
    description: 'Registros antigos ou sem dados suficientes para classificar.',
  },
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
  private readonly router = inject(Router);

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
  readonly attendanceGroups = computed(() => {
    const groups = new Map<AttendanceCategory, AttendanceListItem[]>(
      ATTENDANCE_CATEGORY_ORDER.map((category) => [category, []]),
    );

    for (const attendance of this.attendances()) {
      groups.get(attendance.category)?.push(attendance);
    }

    return ATTENDANCE_CATEGORY_ORDER.map((category) => ({
      category,
      ...ATTENDANCE_CATEGORY_LABELS[category],
      attendances: groups.get(category) ?? [],
    })).filter((group) => group.attendances.length > 0);
  });
  readonly majorEventUserAttendances = signal<MajorEventUserAttendance[]>([]);
  readonly majorEventUserAttendanceGroups = computed<AttendanceCategoryGroup[]>(() => {
    const groups = new Map<AttendanceCategory, MajorEventUserAttendance[]>(
      ATTENDANCE_CATEGORY_ORDER.map((category) => [category, []]),
    );

    for (const attendance of this.majorEventUserAttendances()) {
      groups.get(this.getMajorEventUserAttendanceCategory(attendance))?.push(attendance);
    }

    return ATTENDANCE_CATEGORY_ORDER.map((category) => ({
      category,
      ...ATTENDANCE_CATEGORY_LABELS[category],
      attendances: groups.get(category) ?? [],
    })).filter((group) => group.attendances.length > 0);
  });
  readonly selectedMajorEventUserAttendance = signal<MajorEventUserAttendance | null>(null);
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
      this.eventApi.listEvents(buildEventListFilters(this.attendanceEventFiltersForm.value, 80)),
    );
    this.attendanceEventResults.set(events);

    const selectedEventId = this.attendanceForm.controls.eventId.value;
    const refreshedSelection = events.find((eventItem) => eventItem.id === selectedEventId);

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
    void this.router.navigate(['/attendances/event', eventItem.id]);
    this.selectedAttendanceEvent.set(eventItem);
    this.attendanceForm.controls.eventId.setValue(eventItem.id);
    this.attendancePersonMatches.set([]);
    await this.loadAttendances(eventItem.id);
  }

  async selectAttendanceEventById(eventId: string): Promise<void> {
    if (this.selectedAttendanceEvent()?.id !== eventId) {
      this.selectedAttendanceEvent.set(await firstValueFrom(this.eventApi.getEvent(eventId)));
    }
    this.attendanceForm.controls.eventId.setValue(eventId);
    this.attendancePersonMatches.set([]);
    await this.loadAttendances(eventId);
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
        ...(identifierType === 'identityDocument' ? { identityDocument: identifier } : {}),
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

  async scanAttendance(): Promise<void> {
    const eventId = this.attendanceForm.controls.eventId.value;
    if (!eventId) {
      this.attendanceForm.controls.eventId.markAsTouched();
      this.snackbar.open('Selecione um evento antes de escanear.', 'Fechar', {
        duration: 3000,
      });
      return;
    }

    const dialogRef = this.dialog.open(WorkspaceAttendanceScannerDialogComponent, {
      width: 'min(720px, 96vw)',
      maxWidth: '96vw',
      data: {
        eventId,
      },
    });

    dialogRef.afterClosed().subscribe(() => {
      void this.loadAttendances(eventId);
    });
  }

  async processScannedCode(eventId: string, code: string): Promise<void> {
    try {
      await firstValueFrom(
        this.api.createEventAttendanceFromAztecCode({
          eventId,
          code,
        }),
      );
      await this.loadAttendances(eventId);
      this.snackbar.open('Presença registrada pelo scanner.', 'Fechar', {
        duration: 2500,
      });
    } catch (error: unknown) {
      this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível registrar a presença.', 'Fechar', {
        duration: 5000,
      });
    }
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
      const columnDialogRef = this.dialog.open(AttendanceCsvColumnDialogComponent, {
        width: '32rem',
        data: {
          fileName: file.name,
          headers: parsedCsv.headers,
          previewRows: parsedCsv.rows.slice(0, 12),
        },
      });
      const selectedHeader = await firstValueFrom(columnDialogRef.afterClosed());
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
      this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível importar o CSV.', 'Fechar', {
        duration: 5000,
      });
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
        eventId: attendance.eventId,
        eventName: attendance.event?.name ?? attendance.eventId,
        personId: attendance.personId,
        personName: attendance.person?.name ?? attendance.personId,
        attendedAt: attendance.attendedAt,
        createdAt: attendance.createdAt,
        createdById: attendance.createdById,
        createdByMethod: attendance.createdByMethod,
        collectedByFullName: attendance.collectedByFullName,
        collectedLatitude: attendance.collectedLatitude,
        collectedLongitude: attendance.collectedLongitude,
        collectedAccuracyMeters: attendance.collectedAccuracyMeters,
        category: attendance.category,
      })),
    );
  }

  showAttendanceInfo(attendance: AttendanceListItem): void {
    this.dialog.open(WorkspaceAttendanceInfoDialogComponent, {
      width: 'min(680px, 96vw)',
      maxWidth: '96vw',
      data: attendance,
    });
  }

  async deleteAttendance(attendance: { eventId: string; personId: string }): Promise<void> {
    await firstValueFrom(
      this.api.deleteEventAttendance({
        eventId: attendance.eventId,
        personId: attendance.personId,
      }),
    );

    await this.loadAttendances(attendance.eventId);
    this.snackbar.open('Presença removida.', 'Fechar', { duration: 2500 });
  }

  async loadMajorEventUserAttendances(): Promise<void> {
    const majorEventId = this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventUserAttendances.set([]);
      this.selectedMajorEventUserAttendance.set(null);
      return;
    }
    void this.router.navigate(['/attendances/major-event', majorEventId]);

    const attendances = await firstValueFrom(this.api.listMajorEventUserAttendances(majorEventId, { take: 200 }));
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

  async refreshMajorEventUserAttendancesFor(majorEventId: string): Promise<void> {
    if (this.majorEventAttendanceForm.controls.majorEventId.value !== majorEventId) {
      return;
    }

    await this.loadMajorEventUserAttendances();
  }

  async selectMajorEventAttendancesById(majorEventId: string): Promise<void> {
    this.majorEventAttendanceForm.controls.majorEventId.setValue(majorEventId);
    void this.router.navigate(['/attendances/major-event', majorEventId]);
    await this.loadMajorEventUserAttendances();
  }

  selectMajorEventUserAttendance(attendance: MajorEventUserAttendance): void {
    this.selectedMajorEventUserAttendance.set(attendance);
  }

  getMajorEventUserAttendanceCategory(attendance: MajorEventUserAttendance): AttendanceCategory {
    for (const category of ATTENDANCE_CATEGORY_ORDER) {
      if (attendance.attendances.some((status) => status.attended && status.category === category)) {
        return category;
      }
    }

    return attendance.attendances.some((status) => status.attended) ? 'UNKNOWN' : 'REGULAR';
  }

  getAttendanceCategoryLabel(category: AttendanceCategory): string {
    return ATTENDANCE_CATEGORY_LABELS[category].label;
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
