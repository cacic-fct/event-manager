import { DOCUMENT } from '@angular/common';
import { computed, Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseCsv } from '@cacic-fct/shared-utils';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { SubscriptionApiService } from '../../graphql/subscription-api.service';
import {
  AttendanceCategory,
  Event,
  EventAttendance,
  MajorEventPriceTier,
  MajorEventUserAttendance,
  OfflineEventAttendanceSubmission,
  Person,
  SubscriptionStatus,
} from '../../graphql/models';
import { AttendanceCsvColumnDialogComponent } from '../../workspace/dialogs/attendance-csv-column-dialog.component';
import { AttendanceCsvImportResultDialogComponent } from '../../workspace/dialogs/attendance-csv-import-result-dialog.component';
import { SubscriberCsvExportDialogComponent } from '../../workspace/dialogs/subscriber-csv-export-dialog.component';
import { WorkspaceAttendanceInfoDialogComponent } from '../../workspace/dialogs/workspace-attendance-info-dialog.component';
import { WorkspaceAttendanceScannerDialogComponent } from '../../workspace/dialogs/workspace-attendance-scanner-dialog.component';
import { WorkspaceOfflineAttendanceSubmissionDialogComponent } from '../../workspace/dialogs/workspace-offline-attendance-submission-dialog.component';
import { ConfirmationDialogComponent } from '../components/confirmation-dialog.component';
import { getErrorMessage } from '../error-message';
import { buildEventListFilters, resetEventFiltersForm } from '../event-list-filters';
import { buildSubscriberCsv } from '../subscriber-csv-export';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';

type AttendanceListItem = {
  eventId: string;
  eventName: string;
  personId: string;
  personName: string;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  committedById?: string | null;
  createdByMethod: string;
  collectedByFullName?: string | null;
  committedByFullName?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
  category: AttendanceCategory;
  person?: Person | null;
};

type OfflineAttendanceSubmissionListItem = OfflineEventAttendanceSubmission & {
  eventName: string;
  personName: string;
};

type AttendanceCategoryGroup = {
  category: AttendanceCategory;
  label: string;
  description: string;
  attendances: MajorEventUserAttendance[];
};

const ATTENDANCE_CATEGORY_ORDER: AttendanceCategory[] = ['REGULAR', 'NON_SUBSCRIBED', 'NON_PAYING', 'UNKNOWN'];
const EXPORT_PAGE_SIZE = 1000;
const OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE = 1000;
const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = 'CONFIRMED';

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
  private readonly subscriptionApi = inject(SubscriptionApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly majorEvents = this.majorEventsService.majorEvents;

  readonly attendanceEventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateUntil: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
  });

  readonly attendanceEventResults = signal<Event[]>([]);
  readonly selectedAttendanceEvent = signal<Event | null>(null);
  readonly attendancePersonMatches = signal<Person[]>([]);
  readonly attendances = signal<AttendanceListItem[]>([]);
  readonly offlineAttendanceSubmissions = signal<OfflineAttendanceSubmissionListItem[]>([]);
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
  readonly majorEventAttendanceEditMode = signal(false);
  readonly majorEventAttendanceEditForm = this.formBuilder.group({
    subscriptionStatus: this.formBuilder.nonNullable.control<SubscriptionStatus>(DEFAULT_SUBSCRIPTION_STATUS, [
      Validators.required,
    ]),
    amountPaid: this.formBuilder.control<number | null>(null),
    paymentDate: this.formBuilder.control<string | null>(null),
    paymentTier: this.formBuilder.control<string | null>(null),
  });
  readonly majorEventAttendancePaymentTiers = computed<MajorEventPriceTier[]>(() => {
    const majorEventId = this.majorEventAttendanceForm.controls.majorEventId.value;
    const majorEvent = this.majorEvents().find((item) => item.id === majorEventId);
    const tiers = majorEvent?.majorEventPrices[0]?.tiers ?? [];
    const selectedTier = this.selectedMajorEventUserAttendance()?.paymentTier?.trim();
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
  readonly selectedMajorEventAttendanceEventIds = signal<Set<string>>(new Set());
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
      this.peopleApi.listPeopleSummaries({
        ...(identifierType === 'query' ? { query: identifier } : {}),
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível registrar a presença.'), 'Fechar', {
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
      const parsedCsv = parseCsv(csvContent);
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível importar o CSV.'), 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  async loadAttendances(eventId: string): Promise<void> {
    if (!eventId) {
      this.attendances.set([]);
      this.offlineAttendanceSubmissions.set([]);
      return;
    }
    const [data, submissions] = await Promise.all([
      firstValueFrom(this.api.listEventAttendances(eventId, { take: EXPORT_PAGE_SIZE })),
      firstValueFrom(this.api.listOfflineEventAttendanceSubmissions(eventId)),
    ]);
    this.attendances.set(
      data.map((attendance) => ({
        eventId: attendance.eventId,
        eventName: attendance.event?.name ?? attendance.eventId,
        personId: attendance.personId,
        personName: attendance.person?.name ?? attendance.personId,
        attendedAt: attendance.attendedAt,
        createdAt: attendance.createdAt,
        createdById: attendance.createdById,
        committedById: attendance.committedById,
        createdByMethod: attendance.createdByMethod,
        collectedByFullName: attendance.collectedByFullName,
        committedByFullName: attendance.committedByFullName,
        collectedLatitude: attendance.collectedLatitude,
        collectedLongitude: attendance.collectedLongitude,
        collectedAccuracyMeters: attendance.collectedAccuracyMeters,
        category: attendance.category,
        person: attendance.person,
      })),
    );
    this.offlineAttendanceSubmissions.set(
      submissions.map((submission) => ({
        ...submission,
        eventName: submission.event?.name ?? submission.eventId,
        personName: submission.person?.name ?? submission.manualValue ?? submission.scannerCode ?? submission.personId ?? 'Pessoa não resolvida',
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

  async approveOfflineAttendanceSubmission(submission: OfflineAttendanceSubmissionListItem): Promise<void> {
    await firstValueFrom(this.api.approveOfflineEventAttendanceSubmission(submission.id));
    await this.loadAttendances(submission.eventId);
    this.snackbar.open('Presença off-line aprovada.', 'Fechar', { duration: 2500 });
  }

  async approveAllOfflineAttendanceSubmissions(): Promise<void> {
    const submissions = this.offlineAttendanceSubmissions().filter((submission) => !submission.resolutionError);
    if (submissions.length === 0) {
      this.snackbar.open('Não há presenças off-line prontas para aprovação.', 'Fechar', { duration: 3000 });
      return;
    }

    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          width: 'min(28rem, 94vw)',
          data: {
            title: 'Aprovar presenças off-line',
            message: `Aprovar ${submissions.length} presença(s) off-line em revisão?`,
            confirmLabel: 'Aprovar',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }

    await this.reviewOfflineAttendanceSubmissionBatches(
      submissions.map((submission) => submission.id),
      (submissionIds) => firstValueFrom(this.api.approveOfflineEventAttendanceSubmissions(submissionIds)),
    );
    await this.loadAttendances(submissions[0].eventId);
    this.snackbar.open('Presenças off-line aprovadas.', 'Fechar', { duration: 2500 });
  }

  async rejectOfflineAttendanceSubmission(submission: OfflineAttendanceSubmissionListItem): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          width: 'min(28rem, 94vw)',
          data: {
            title: 'Rejeitar presença off-line',
            message: `Rejeitar a presença enviada para ${submission.personName}?`,
            confirmLabel: 'Rejeitar',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }

    await firstValueFrom(this.api.rejectOfflineEventAttendanceSubmission(submission.id));
    await this.loadAttendances(submission.eventId);
    this.snackbar.open('Presença off-line rejeitada.', 'Fechar', { duration: 2500 });
  }

  async rejectAllOfflineAttendanceSubmissions(): Promise<void> {
    const submissions = this.offlineAttendanceSubmissions();
    if (submissions.length === 0) {
      this.snackbar.open('Não há presenças off-line para rejeitar.', 'Fechar', { duration: 3000 });
      return;
    }

    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          width: 'min(28rem, 94vw)',
          data: {
            title: 'Rejeitar presenças off-line',
            message: `Rejeitar ${submissions.length} presença(s) off-line em revisão?`,
            confirmLabel: 'Rejeitar',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }

    await this.reviewOfflineAttendanceSubmissionBatches(
      submissions.map((submission) => submission.id),
      (submissionIds) =>
        firstValueFrom(
          this.api.rejectOfflineEventAttendanceSubmissions(
            submissionIds,
            'Rejeitada em lote pelo painel administrativo.',
          ),
        ),
    );
    await this.loadAttendances(submissions[0].eventId);
    this.snackbar.open('Presenças off-line rejeitadas.', 'Fechar', { duration: 2500 });
  }

  async inspectOfflineAttendanceSubmission(
    submission: OfflineAttendanceSubmissionListItem,
    canReview: boolean,
  ): Promise<void> {
    const action = await firstValueFrom(
      this.dialog
        .open(WorkspaceOfflineAttendanceSubmissionDialogComponent, {
          width: 'min(38rem, 96vw)',
          maxWidth: '96vw',
          data: {
            submission,
            canReview,
          },
        })
        .afterClosed(),
    );

    if (action === 'approve') {
      await this.approveOfflineAttendanceSubmission(submission);
    }
    if (action === 'reject') {
      await this.rejectOfflineAttendanceSubmission(submission);
    }
  }

  private async reviewOfflineAttendanceSubmissionBatches(
    submissionIds: readonly string[],
    reviewBatch: (submissionIds: string[]) => Promise<unknown>,
  ): Promise<void> {
    for (let index = 0; index < submissionIds.length; index += OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE) {
      await reviewBatch(submissionIds.slice(index, index + OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE));
    }
  }

  async loadMajorEventUserAttendances(): Promise<void> {
    const majorEventId = this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventUserAttendances.set([]);
      this.selectMajorEventUserAttendance(null);
      return;
    }
    void this.router.navigate(['/attendances/major-event', majorEventId]);

    const attendances = await firstValueFrom(
      this.api.listMajorEventUserAttendances(majorEventId, { take: EXPORT_PAGE_SIZE }),
    );
    this.majorEventUserAttendances.set(attendances);

    const selected = this.selectedMajorEventUserAttendance();
    if (selected) {
      const refreshedSelection = attendances.find(
        (attendance) => attendance.subscriptionId === selected.subscriptionId,
      );
      if (refreshedSelection) {
        this.selectMajorEventUserAttendance(refreshedSelection);
        return;
      }
    }

    this.selectMajorEventUserAttendance(attendances[0] ?? null);
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

  selectMajorEventUserAttendance(attendance: MajorEventUserAttendance | null): void {
    this.selectedMajorEventUserAttendance.set(attendance);
    this.majorEventAttendanceEditMode.set(false);
    this.resetMajorEventAttendanceDraft(attendance);
  }

  enableMajorEventAttendanceEdit(): void {
    if (!this.selectedMajorEventUserAttendance()) {
      return;
    }
    this.majorEventAttendanceEditMode.set(true);
  }

  cancelMajorEventAttendanceEdit(): void {
    this.resetMajorEventAttendanceDraft(this.selectedMajorEventUserAttendance());
    this.majorEventAttendanceEditMode.set(false);
  }

  toggleMajorEventAttendanceEvent(eventId: string): void {
    if (!this.majorEventAttendanceEditMode()) {
      return;
    }

    const selectedEventIds = new Set(this.selectedMajorEventAttendanceEventIds());
    if (selectedEventIds.has(eventId)) {
      selectedEventIds.delete(eventId);
    } else {
      selectedEventIds.add(eventId);
    }
    this.selectedMajorEventAttendanceEventIds.set(selectedEventIds);
  }

  setMajorEventAttendanceEvent(eventId: string, attended: boolean): void {
    if (!this.majorEventAttendanceEditMode()) {
      return;
    }

    const selectedEventIds = new Set(this.selectedMajorEventAttendanceEventIds());
    if (attended) {
      selectedEventIds.add(eventId);
    } else {
      selectedEventIds.delete(eventId);
    }
    this.selectedMajorEventAttendanceEventIds.set(selectedEventIds);
  }

  async saveMajorEventAttendanceEdit(): Promise<void> {
    const selected = this.selectedMajorEventUserAttendance();
    if (!selected) {
      return;
    }

    const selectedEventIds = this.selectedMajorEventAttendanceEventIds();
    const previousEventIds = new Set(
      selected.attendances.filter((attendance) => attendance.attended).map((attendance) => attendance.eventId),
    );
    const formValue = this.majorEventAttendanceEditForm.getRawValue();

    try {
      if (selected.subscriptionId) {
        await firstValueFrom(
          this.subscriptionApi.updateMajorEventSubscription(selected.subscriptionId, {
            subscriptionStatus: formValue.subscriptionStatus,
            amountPaid: formValue.amountPaid,
            paymentDate: formValue.paymentDate,
            paymentTier: formValue.paymentTier,
          }),
        );
      }

      for (const eventId of selectedEventIds) {
        if (!previousEventIds.has(eventId)) {
          await firstValueFrom(this.api.createEventAttendance({ eventId, personId: selected.personId }));
        }
      }

      for (const eventId of previousEventIds) {
        if (!selectedEventIds.has(eventId)) {
          await firstValueFrom(this.api.deleteEventAttendance({ eventId, personId: selected.personId }));
        }
      }

      this.majorEventAttendanceEditMode.set(false);
      await this.loadMajorEventUserAttendances();
      this.snackbar.open('Presença atualizada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar a presença.'), 'Fechar', { duration: 5000 });
    }
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

  private resetMajorEventAttendanceDraft(attendance: MajorEventUserAttendance | null): void {
    this.majorEventAttendanceEditForm.reset({
      subscriptionStatus:
        (attendance?.subscriptionStatus as SubscriptionStatus | undefined) ?? DEFAULT_SUBSCRIPTION_STATUS,
      amountPaid: attendance?.amountPaid ?? null,
      paymentDate: attendance?.paymentDate?.slice(0, 10) ?? null,
      paymentTier: attendance?.paymentTier ?? null,
    });
    this.selectedMajorEventAttendanceEventIds.set(
      new Set(
        attendance?.attendances
          .filter((attendanceStatus) => attendanceStatus.attended)
          .map((attendanceStatus) => attendanceStatus.eventId) ?? [],
      ),
    );
  }

  async exportEventAttendancesCsv(): Promise<void> {
    const event = this.selectedAttendanceEvent();
    const eventId = this.attendanceForm.controls.eventId.value;
    if (!event || !eventId) {
      this.snackbar.open('Selecione um evento antes de baixar o CSV.', 'Fechar', { duration: 3000 });
      return;
    }

    const attendances = await this.fetchAllEventAttendances(eventId);
    this.attendances.set(
      attendances.map((attendance) => ({
        eventId: attendance.eventId,
        eventName: attendance.event?.name ?? attendance.eventId,
        personId: attendance.personId,
        personName: attendance.person?.name ?? attendance.personId,
        attendedAt: attendance.attendedAt,
        createdAt: attendance.createdAt,
        createdById: attendance.createdById,
        committedById: attendance.committedById,
        createdByMethod: attendance.createdByMethod,
        collectedByFullName: attendance.collectedByFullName,
        committedByFullName: attendance.committedByFullName,
        collectedLatitude: attendance.collectedLatitude,
        collectedLongitude: attendance.collectedLongitude,
        collectedAccuracyMeters: attendance.collectedAccuracyMeters,
        category: attendance.category,
        person: attendance.person,
      })),
    );

    const options = await this.openExportDialog('Baixar lista de presença', attendances.length);
    if (!options) {
      return;
    }

    this.downloadCsv(`presencas-${this.slugify(event.name)}.csv`, buildSubscriberCsv(attendances, options));
  }

  async exportMajorEventAttendancesCsv(): Promise<void> {
    const majorEventId = this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventAttendanceForm.controls.majorEventId.markAsTouched();
      this.snackbar.open('Selecione um grande evento antes de baixar o CSV.', 'Fechar', { duration: 3000 });
      return;
    }

    const attendances = await this.fetchAllMajorEventUserAttendances(majorEventId);
    this.majorEventUserAttendances.set(attendances);
    const options = await this.openExportDialog('Baixar lista de presença do grande evento', attendances.length);
    if (!options) {
      return;
    }

    const majorEventName = this.majorEvents().find((item) => item.id === majorEventId)?.name ?? majorEventId;
    this.downloadCsv(`presencas-${this.slugify(majorEventName)}.csv`, buildSubscriberCsv(attendances, options));
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

  private async fetchAllEventAttendances(eventId: string): Promise<EventAttendance[]> {
    const attendances: EventAttendance[] = [];
    for (let skip = 0; ; skip += EXPORT_PAGE_SIZE) {
      const page = await firstValueFrom(this.api.listEventAttendances(eventId, { skip, take: EXPORT_PAGE_SIZE }));
      attendances.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) {
        return attendances;
      }
    }
  }

  private async fetchAllMajorEventUserAttendances(majorEventId: string): Promise<MajorEventUserAttendance[]> {
    const attendances: MajorEventUserAttendance[] = [];
    for (let skip = 0; ; skip += EXPORT_PAGE_SIZE) {
      const page = await firstValueFrom(
        this.api.listMajorEventUserAttendances(majorEventId, { skip, take: EXPORT_PAGE_SIZE }),
      );
      attendances.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) {
        return attendances;
      }
    }
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
