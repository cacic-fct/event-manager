import { DOCUMENT } from '@angular/common';
import { DestroyRef, computed, Service, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { auditTime, firstValueFrom, Subscription } from 'rxjs';
import { parseCsv } from '@cacic-fct/shared-utils';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import {
  AttendanceCategory,
  AttendanceCurrentAssessment,
  Event,
  EventAttendance,
  EventAttendanceScannerFeedItem,
  EventAttendanceCsvImportResolution,
  MajorEventUserAttendance,
  OfflineEventAttendanceSubmission,
  OfflineEventAttendanceResolutionIssue,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';
import { AttendanceCsvColumnDialogComponent } from './dialogs/import/attendance-csv-column-dialog.component';
import { AttendanceCsvImportResultDialogComponent } from './dialogs/import/attendance-csv-import-result-dialog.component';
import { AttendancePersonResolutionDialogComponent } from './dialogs/import/attendance-person-resolution-dialog.component';
import { SubscriberCsvExportDialogComponent } from '../subscriptions/dialogs/export/subscriber-csv-export-dialog.component';
import { AttendanceInfoDialogComponent } from './dialogs/scanning/attendance-info-dialog.component';
import { AttendanceScannerDialogComponent } from './dialogs/scanning/attendance-scanner-dialog.component';
import { OfflineAttendanceSubmissionEditDialogComponent } from './dialogs/offline/offline-attendance-submission-edit-dialog.component';
import { OfflineAttendanceSubmissionDialogComponent } from './dialogs/offline/offline-attendance-submission-dialog.component';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
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
import { buildSubscriberCsv } from '../subscriptions/subscriber-csv-export';
import { MajorEventsService } from '../major-events/major-events.service';

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
  currentAssessment?: AttendanceCurrentAssessment | null;
  status: EventAttendance['status'];
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
    description: 'Registros anteriores à classificação automática. A situação atual aparece em cada presença.',
  },
};

function mapAttendanceListItem(attendance: EventAttendance): AttendanceListItem {
  return {
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
    currentAssessment: attendance.currentAssessment,
    status: attendance.status,
    person: attendance.person,
  };
}

@Service()
export class AttendancesService {
  private readonly api = inject(AttendanceApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventsService = inject(MajorEventsService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private attendanceStream: Subscription | null = null;
  private attendanceStreamEventId: string | null = null;
  private attendanceStreamGeneration = 0;
  private attendanceStreamRecoveryAttempted = false;
  private attendanceLoadRequestId = 0;

  readonly majorEvents = this.majorEventsService.majorEvents;

  readonly attendanceEventFiltersForm = this.formBuilder.group({
    startDateFrom: this.formBuilder.control<Date | null>(null),
    startDateUntil: this.formBuilder.control<Date | null>(null),
    isInGroup: this.formBuilder.nonNullable.control('ALL'),
    isInMajorEvent: this.formBuilder.nonNullable.control('ALL'),
    query: this.formBuilder.nonNullable.control(''),
  });

  readonly attendanceEventResults = signal<Event[]>([]);
  readonly attendanceEventResultsPagination = createWorkspaceListPagination();
  readonly selectedAttendanceEvent = signal<Event | null>(null);
  readonly attendancePersonMatches = signal<Person[]>([]);
  readonly attendances = signal<AttendanceListItem[]>([]);
  readonly explicitAbsences = signal<AttendanceListItem[]>([]);
  private readonly explicitAbsencesByEventId = new Map<string, Promise<EventAttendance[]>>();
  readonly implicitAbsences = signal<EventAttendanceScannerFeedItem[]>([]);
  readonly attendanceTotalCount = signal(0);
  readonly attendancesPagination = createWorkspaceListPagination();
  readonly offlineAttendanceSubmissions = signal<OfflineAttendanceSubmissionListItem[]>([]);
  readonly attendanceGroups = computed(() => {
    const groups = new Map<AttendanceCategory, AttendanceListItem[]>(
      ATTENDANCE_CATEGORY_ORDER.map((category) => [category, []]),
    );

    for (const attendance of this.attendances().filter((item) => item.status === 'PRESENT')) {
      groups.get(attendance.category)?.push(attendance);
    }

    return ATTENDANCE_CATEGORY_ORDER.map((category) => ({
      category,
      ...ATTENDANCE_CATEGORY_LABELS[category],
      attendances: groups.get(category) ?? [],
    })).filter((group) => group.attendances.length > 0);
  });
  readonly majorEventUserAttendances = signal<MajorEventUserAttendance[]>([]);
  readonly majorEventUserAttendancesPagination = createWorkspaceListPagination();
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
  readonly selectedMajorEventAttendances = computed(
    () => this.selectedMajorEventUserAttendance()?.attendances.filter((attendance) => attendance.attended) ?? [],
  );
  readonly isImportingCsv = signal(false);

  readonly attendanceForm = this.formBuilder.nonNullable.group({
    eventId: ['', [Validators.required]],
    identifierType: ['userId'],
    identifier: ['', [Validators.required]],
  });

  readonly majorEventAttendanceForm = this.formBuilder.nonNullable.group({
    majorEventId: ['', [Validators.required]],
  });

  constructor() {
    bindLiveSearch({
      control: this.attendanceEventFiltersForm,
      destroyRef: this.destroyRef,
      search: () => this.searchAttendanceEvents(),
    });
    this.destroyRef.onDestroy(() => {
      this.closeAttendanceLiveStream();
    });
  }

  async searchAttendanceEvents(): Promise<void> {
    resetPagination(this.attendanceEventResultsPagination);
    await this.loadAttendanceEventResultsPage();
  }

  async previousAttendanceEventResultsPage(): Promise<void> {
    await loadPreviousPage(this.attendanceEventResultsPagination, () => this.loadAttendanceEventResultsPage());
  }

  async nextAttendanceEventResultsPage(): Promise<void> {
    await loadNextPage(this.attendanceEventResultsPagination, () => this.loadAttendanceEventResultsPage());
  }

  private async loadAttendanceEventResultsPage(): Promise<void> {
    const events = await firstValueFrom(
      this.eventApi.listEvents({
        ...buildEventListFilters(this.attendanceEventFiltersForm.value),
        ...pageVariables(this.attendanceEventResultsPagination.pageIndex()),
      }),
    );
    this.attendanceEventResults.set(applyPagedResult(events, this.attendanceEventResultsPagination));

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
    resetEventFiltersForm(this.attendanceEventFiltersForm, { emitEvent: false });
    await this.searchAttendanceEvents();
  }

  async selectAttendanceEvent(eventItem: Event): Promise<void> {
    void this.router.navigate(['/attendances/event', eventItem.id]);
    this.selectedAttendanceEvent.set(eventItem);
    this.attendanceForm.controls.eventId.setValue(eventItem.id);
    this.attendancePersonMatches.set([]);
    resetPagination(this.attendancesPagination);
    this.startAttendanceLiveStream(eventItem.id);
    await this.loadAttendances(eventItem.id);
  }

  async selectAttendanceEventById(eventId: string): Promise<void> {
    if (this.selectedAttendanceEvent()?.id !== eventId) {
      this.closeAttendanceLiveStream();
      this.selectedAttendanceEvent.set(await firstValueFrom(this.eventApi.getEvent(eventId)));
    }
    this.attendanceForm.controls.eventId.setValue(eventId);
    this.attendancePersonMatches.set([]);
    resetPagination(this.attendancesPagination);
    this.startAttendanceLiveStream(eventId);
    await this.loadAttendances(eventId);
  }

  async findAttendancePerson(): Promise<void> {
    if (this.attendanceForm.invalid) {
      this.attendanceForm.markAllAsTouched();
      return;
    }

    const identifierType = this.attendanceForm.controls.identifierType.value;
    const identifierValue = this.attendanceForm.controls.identifier.value;
    let people: Person[] = [];
    if (identifierType === 'query') {
      const searches = buildPeopleCandidateLookupFilters(identifierValue, 10).map((filters) =>
        firstValueFrom(this.peopleApi.listPeopleSummaries(filters)),
      );
      const peopleById = new Map<string, Person>();
      for (const person of (await Promise.all(searches)).flat()) {
        peopleById.set(person.id, person);
      }
      people = [...peopleById.values()].slice(0, 10);
    } else {
      const filters = buildPeopleLookupFilters(identifierType, identifierValue, { take: 10 });
      people = filters ? await firstValueFrom(this.peopleApi.listPeopleSummaries(filters)) : [];
    }
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
    this.invalidateExplicitAbsences(eventId);
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

    const dialogRef = this.dialog.open(AttendanceScannerDialogComponent, {
      width: 'min(720px, 96vw)',
      maxWidth: '96vw',
      data: {
        eventId,
      },
    });

    dialogRef.afterClosed().subscribe(() => {
      this.invalidateExplicitAbsences(eventId);
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
      this.invalidateExplicitAbsences(eventId);
      await this.loadAttendances(eventId);
      this.snackbar.open('Presença registrada pelo scanner.', 'Fechar', {
        duration: 2500,
      });
    } catch (error: unknown) {
      this.feedback.error(error, 'Não foi possível registrar a presença.');
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

      let resolutions: EventAttendanceCsvImportResolution[] = [];
      let result = await firstValueFrom(
        this.api.importEventAttendancesFromCsv({
          eventId,
          csvContent,
          selectedHeader,
        }),
      );
      while (result.ambiguousValues.length > 0) {
        const selectedResolutions = await firstValueFrom(
          this.dialog
            .open(AttendancePersonResolutionDialogComponent, {
              width: 'min(48rem, 96vw)',
              maxWidth: '96vw',
              maxHeight: '86vh',
              data: {
                title: 'Resolver dados ambíguos',
                description:
                  'Alguns dados do CSV podem ser CPF ou telefone de pessoas diferentes. Selecione a pessoa correta para continuar a importação.',
                confirmLabel: 'Continuar importação',
                ambiguousValues: result.ambiguousValues,
              },
            })
            .afterClosed(),
        );
        if (!selectedResolutions) {
          return;
        }
        resolutions = [...resolutions, ...selectedResolutions];
        result = await firstValueFrom(
          this.api.importEventAttendancesFromCsv({
            eventId,
            csvContent,
            selectedHeader,
            resolutions,
          }),
        );
      }

      this.invalidateExplicitAbsences(eventId);
      await this.loadAttendances(eventId);
      this.dialog.open(AttendanceCsvImportResultDialogComponent, {
        width: '36rem',
        maxHeight: '80vh',
        data: result,
      });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível importar o CSV.');
    } finally {
      this.isImportingCsv.set(false);
    }
  }

  async loadAttendances(eventId: string): Promise<void> {
    const requestId = ++this.attendanceLoadRequestId;
    if (!eventId) {
      this.closeAttendanceLiveStream();
      this.attendances.set([]);
      this.explicitAbsences.set([]);
      this.implicitAbsences.set([]);
      this.attendanceTotalCount.set(0);
      this.offlineAttendanceSubmissions.set([]);
      return;
    }
    const [data, explicitAbsences, roster, attendanceTotalCount, submissions] = await Promise.all([
      firstValueFrom(
        this.api.listEventAttendances(eventId, {
          ...pageVariables(this.attendancesPagination.pageIndex()),
          status: 'PRESENT',
        }),
      ),
      this.fetchExplicitAbsences(eventId),
      firstValueFrom(this.api.listEventAttendanceScannerFeed(eventId)),
      firstValueFrom(this.api.getEventAttendanceCount(eventId, 'PRESENT')),
      firstValueFrom(this.api.listOfflineEventAttendanceSubmissions(eventId)),
    ]);
    if (!this.isCurrentAttendanceLoad(requestId, eventId)) {
      return;
    }
    const visibleAttendances = applyPagedResult(data, this.attendancesPagination);
    this.attendanceTotalCount.set(attendanceTotalCount);
    this.attendances.set(visibleAttendances.map(mapAttendanceListItem));
    this.explicitAbsences.set(explicitAbsences.map(mapAttendanceListItem));
    this.implicitAbsences.set(roster.filter((item) => !item.status));
    this.offlineAttendanceSubmissions.set(
      submissions.map((submission) => ({
        ...submission,
        eventName: submission.event?.name ?? submission.eventId,
        personName:
          submission.person?.name ??
          submission.manualValue ??
          submission.scannerCode ??
          submission.personId ??
          'Pessoa não resolvida',
      })),
    );
  }

  async previousAttendancesPage(): Promise<void> {
    await loadPreviousPage(this.attendancesPagination, () =>
      this.loadAttendances(this.attendanceForm.controls.eventId.value),
    );
  }

  async nextAttendancesPage(): Promise<void> {
    await loadNextPage(this.attendancesPagination, () =>
      this.loadAttendances(this.attendanceForm.controls.eventId.value),
    );
  }

  showAttendanceInfo(attendance: AttendanceListItem): void {
    this.dialog.open(AttendanceInfoDialogComponent, {
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

    this.invalidateExplicitAbsences(attendance.eventId);
    await this.loadAttendances(attendance.eventId);
    this.snackbar.open('Presença removida.', 'Fechar', { duration: 2500 });
  }

  async approveOfflineAttendanceSubmission(submission: OfflineAttendanceSubmissionListItem): Promise<void> {
    await firstValueFrom(this.api.approveOfflineEventAttendanceSubmission(submission.id));
    this.invalidateExplicitAbsences(submission.eventId);
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
    this.invalidateExplicitAbsences(submissions[0].eventId);
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
    this.invalidateExplicitAbsences(submission.eventId);
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
    this.invalidateExplicitAbsences(submissions[0].eventId);
    await this.loadAttendances(submissions[0].eventId);
    this.snackbar.open('Presenças off-line rejeitadas.', 'Fechar', { duration: 2500 });
  }

  async editOfflineAttendanceSubmission(submission: OfflineAttendanceSubmissionListItem): Promise<void> {
    const correction = await firstValueFrom(
      this.dialog
        .open(OfflineAttendanceSubmissionEditDialogComponent, {
          width: 'min(42rem, 96vw)',
          maxWidth: '96vw',
          data: {
            submission,
            issueLabel: this.offlineSubmissionIssueLabel(submission.resolutionIssue),
          },
        })
        .afterClosed(),
    );
    if (!correction) {
      return;
    }

    const updated = await firstValueFrom(this.api.updateOfflineEventAttendanceSubmission(submission.id, correction));
    this.invalidateExplicitAbsences(submission.eventId);
    await this.loadAttendances(submission.eventId);
    this.snackbar.open(
      updated.resolutionError
        ? 'Correção salva, mas a presença ainda precisa de ajuste.'
        : 'Presença off-line corrigida.',
      'Fechar',
      { duration: 3000 },
    );
  }

  async inspectOfflineAttendanceSubmission(
    submission: OfflineAttendanceSubmissionListItem,
    canReview: boolean,
  ): Promise<void> {
    const action = await firstValueFrom(
      this.dialog
        .open(OfflineAttendanceSubmissionDialogComponent, {
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
    if (action === 'edit') {
      await this.editOfflineAttendanceSubmission(submission);
    }
  }

  canApproveOfflineAttendanceSubmission(submission: OfflineAttendanceSubmissionListItem): boolean {
    return !submission.resolutionError;
  }

  offlineSubmissionIssueLabel(issue: OfflineEventAttendanceResolutionIssue | null | undefined): string {
    switch (issue) {
      case 'COLLECTION_WINDOW_EXPIRED':
        return 'Janela encerrada';
      case 'DUPLICATE_ATTENDANCE':
        return 'Presença duplicada';
      case 'DUPLICATE_PERSON':
        return 'Pessoa duplicada';
      case 'EVENT_DELETED':
        return 'Evento removido';
      case 'EVENT_LOCKED':
        return 'Evento bloqueado';
      case 'INVALID_SCANNER_CODE':
        return 'Código inválido';
      case 'LOCATION_IMPRECISE':
        return 'Localização imprecisa';
      case 'LOCATION_MISSING':
        return 'Sem localização';
      case 'PERSON_NOT_FOUND':
        return 'Pessoa não encontrada';
      case 'UNSUPPORTED_METHOD':
        return 'Origem incompatível';
      case 'UNKNOWN':
      case null:
      case undefined:
        return 'Revisão manual';
    }
  }

  private async reviewOfflineAttendanceSubmissionBatches(
    submissionIds: readonly string[],
    reviewBatch: (
      submissionIds: string[],
    ) => Promise<Array<{ submissionId: string; success: boolean; error?: string | null }>>,
  ): Promise<void> {
    const failures: Array<{ submissionId: string; error?: string | null }> = [];
    for (let index = 0; index < submissionIds.length; index += OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE) {
      const results = await reviewBatch(submissionIds.slice(index, index + OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE));
      failures.push(...results.filter((result) => !result.success));
    }
    if (failures.length > 0) {
      this.snackbar.open(
        `${failures.length} presença(s) não foram processadas. Tente novamente apenas os itens informados.`,
        'Fechar',
        { duration: 6000 },
      );
    }
  }

  async loadMajorEventUserAttendances(): Promise<void> {
    // Keep this cross-event aggregate HTTP-only: the existing live source is event-scoped,
    // so subscribing to every constituent event would either omit data or be unbounded.
    const majorEventId = this.majorEventAttendanceForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.majorEventUserAttendances.set([]);
      this.selectMajorEventUserAttendance(null);
      return;
    }
    void this.router.navigate(['/attendances/major-event', majorEventId]);

    const attendances = await firstValueFrom(
      this.api.listMajorEventUserAttendances(majorEventId, {
        ...pageVariables(this.majorEventUserAttendancesPagination.pageIndex()),
      }),
    );
    const visibleAttendances = applyPagedResult(attendances, this.majorEventUserAttendancesPagination);
    this.majorEventUserAttendances.set(visibleAttendances);

    const selected = this.selectedMajorEventUserAttendance();
    if (selected) {
      const refreshedSelection = visibleAttendances.find(
        (attendance) => attendance.subscriptionId === selected.subscriptionId,
      );
      if (refreshedSelection) {
        this.selectMajorEventUserAttendance(refreshedSelection);
        return;
      }
    }

    this.selectMajorEventUserAttendance(visibleAttendances[0] ?? null);
  }

  async loadMajorEventUserAttendancesFromFirstPage(): Promise<void> {
    resetPagination(this.majorEventUserAttendancesPagination);
    await this.loadMajorEventUserAttendances();
  }

  async previousMajorEventUserAttendancesPage(): Promise<void> {
    await loadPreviousPage(this.majorEventUserAttendancesPagination, () => this.loadMajorEventUserAttendances());
  }

  async nextMajorEventUserAttendancesPage(): Promise<void> {
    await loadNextPage(this.majorEventUserAttendancesPagination, () => this.loadMajorEventUserAttendances());
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
    resetPagination(this.majorEventUserAttendancesPagination);
    await this.loadMajorEventUserAttendances();
  }

  selectMajorEventUserAttendance(attendance: MajorEventUserAttendance | null): void {
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

  getAttendanceCategoryHistoricalExplanation(category: AttendanceCategory): string | null {
    if (category !== 'UNKNOWN') {
      return null;
    }

    return 'Registro anterior à classificação automática.';
  }

  getAttendanceCurrentAssessmentLabel(assessment: AttendanceCurrentAssessment | null | undefined): string | null {
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

  getMajorEventCurrentAssessmentLabel(attendance: MajorEventUserAttendance): string | null {
    const assessments = [
      ...new Set(
        attendance.attendances
          .filter((eventAttendance) => eventAttendance.attended && eventAttendance.category === 'UNKNOWN')
          .map((eventAttendance) => eventAttendance.currentAssessment)
          .filter((assessment): assessment is AttendanceCurrentAssessment => Boolean(assessment)),
      ),
    ];

    return assessments.length === 1 ? this.getAttendanceCurrentAssessmentLabel(assessments[0]) : null;
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
        currentAssessment: attendance.currentAssessment,
        status: attendance.status,
        person: attendance.person,
      })),
    );

    const options = await this.openExportDialog('Baixar lista de presença', attendances.length);
    if (!options) {
      return;
    }

    this.downloadCsv(`presencas-${this.slugify(event.name)}.csv`, buildSubscriberCsv(attendances, options));
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

  private async fetchAllEventAttendances(
    eventId: string,
    status?: EventAttendance['status'],
  ): Promise<EventAttendance[]> {
    const attendances: EventAttendance[] = [];
    for (let skip = 0; ; skip += EXPORT_PAGE_SIZE) {
      const page = await firstValueFrom(
        this.api.listEventAttendances(eventId, { skip, take: EXPORT_PAGE_SIZE, status }),
      );
      attendances.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) {
        return attendances;
      }
    }
  }

  private isCurrentAttendanceLoad(requestId: number, eventId: string): boolean {
    if (requestId !== this.attendanceLoadRequestId) {
      return false;
    }

    const selectedEventId = this.selectedAttendanceEvent()?.id;
    if (selectedEventId) {
      return selectedEventId === eventId;
    }

    const formEventId = this.attendanceForm.controls.eventId.value;
    return !formEventId || formEventId === eventId;
  }

  private startAttendanceLiveStream(eventId: string): void {
    this.closeAttendanceLiveStream();
    if (!eventId || typeof EventSource === 'undefined') {
      return;
    }

    this.attendanceStreamEventId = eventId;
    this.attendanceStreamRecoveryAttempted = false;
    this.connectAttendanceLiveStream(eventId, this.attendanceStreamGeneration);
  }

  private connectAttendanceLiveStream(eventId: string, generation: number): void {
    if (!this.isCurrentAttendanceStream(eventId, generation)) {
      return;
    }

    let stream: Subscription | null = null;
    stream = this.api
      .watchEventAttendanceScannerFeed(eventId)
      .pipe(auditTime(0))
      .subscribe({
        next: () => {
          if (!this.isCurrentAttendanceStream(eventId, generation)) {
            return;
          }
          this.attendanceStreamRecoveryAttempted = false;
          this.refreshAttendanceFromLiveStream(eventId);
        },
        error: () => {
          if (!this.isCurrentAttendanceStream(eventId, generation)) {
            return;
          }
          this.attendanceStream = null;
          if (this.attendanceStreamRecoveryAttempted) {
            return;
          }
          this.attendanceStreamRecoveryAttempted = true;
          void this.recoverAttendanceLiveStream(eventId, generation);
        },
      });
    this.attendanceStream = stream;
  }

  private refreshAttendanceFromLiveStream(eventId: string): void {
    if (!this.isCurrentAttendanceSelection(eventId)) {
      return;
    }

    this.invalidateExplicitAbsences(eventId);
    void this.loadAttendances(eventId).catch(() => undefined);
  }

  private async recoverAttendanceLiveStream(eventId: string, generation: number): Promise<void> {
    this.invalidateExplicitAbsences(eventId);
    try {
      await this.loadAttendances(eventId);
    } catch {
      // Keep the last good projections visible while the replayable stream is re-established.
    }

    if (this.isCurrentAttendanceStream(eventId, generation)) {
      this.connectAttendanceLiveStream(eventId, generation);
    }
  }

  private isCurrentAttendanceSelection(eventId: string): boolean {
    return (
      this.attendanceStreamEventId === eventId &&
      this.selectedAttendanceEvent()?.id === eventId &&
      this.attendanceForm.controls.eventId.value === eventId
    );
  }

  private isCurrentAttendanceStream(eventId: string, generation: number): boolean {
    return generation === this.attendanceStreamGeneration && this.isCurrentAttendanceSelection(eventId);
  }

  closeAttendanceLiveStream(): void {
    this.attendanceLoadRequestId++;
    this.attendanceStreamGeneration++;
    this.attendanceStream?.unsubscribe();
    this.attendanceStream = null;
    this.attendanceStreamEventId = null;
    this.attendanceStreamRecoveryAttempted = false;
  }

  private fetchExplicitAbsences(eventId: string): Promise<EventAttendance[]> {
    let explicitAbsences = this.explicitAbsencesByEventId.get(eventId);
    if (!explicitAbsences) {
      const request = this.fetchAllEventAttendances(eventId, 'ABSENT');
      explicitAbsences = request;
      this.explicitAbsencesByEventId.set(eventId, request);
      void request.then(
        () => this.clearExplicitAbsencesRequest(eventId, request),
        () => this.clearExplicitAbsencesRequest(eventId, request),
      );
    }
    return explicitAbsences;
  }

  invalidateExplicitAbsences(eventId: string): void {
    this.explicitAbsencesByEventId.delete(eventId);
  }

  private clearExplicitAbsencesRequest(eventId: string, request: Promise<EventAttendance[]>): void {
    if (this.explicitAbsencesByEventId.get(eventId) === request) {
      this.explicitAbsencesByEventId.delete(eventId);
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
