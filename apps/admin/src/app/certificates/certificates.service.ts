import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { form, required, submit, type FieldTree } from '@angular/forms/signals';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseCsv } from '@cacic-fct/shared-utils';
import { CertificateApiService } from '../graphql/certificate-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import {
  Certificate,
  CertificateCsvImportResolution,
  CertificateConfig,
  CertificateConfigCloneInput,
  CertificateConfigInput,
  CertificateFolder,
  CertificateFolderInput,
  CertificateIssuedTo,
  CertificateScope,
  CertificateTemplate,
  Event,
  EventGroup,
  MajorEvent,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { bindLiveSearch } from '../search/live-search';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
} from '../pagination/list-pagination';
import { buildPeopleCandidateLookupFilters } from '../people/people-lookup';
import {
  CertificateConfigCloneDialogComponent,
  CertificateConfigCloneDialogResult,
} from './dialogs/certificate-config-clone-dialog.component';
import { AttendanceCsvColumnDialogComponent } from '../attendances/dialogs/import/attendance-csv-column-dialog.component';
import { AttendanceCsvImportResultDialogComponent } from '../attendances/dialogs/import/attendance-csv-import-result-dialog.component';
import { AttendancePersonResolutionDialogComponent } from '../attendances/dialogs/import/attendance-person-resolution-dialog.component';
import { PermissionsService } from '../permissions/permissions.service';
import {
  AttendanceEligibility,
  type AttendanceEligibility as AttendanceEligibilityValue,
} from '@cacic-fct/shared-event-participation';
import {
  attendanceEligibilityOptionsFor,
  type AttendanceEligibilityParent,
} from '../shared/event-participation-policy';

type WorkspaceCertificateScope = CertificateScope;
type CertificateTargetType = 'event' | 'event-group' | 'major-event' | 'folder';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';
type CertificateIssuedToOption = CertificateIssuedTo | 'LECTURER_PALESTRA' | 'LECTURER_MINICURSO';
type IssuableTarget = Event | EventGroup | MajorEvent | CertificateFolder;
type CertificateConfigFormModel = {
  id: string;
  name: string;
  certificateTemplateId: string;
  certificateText: string;
  shouldAutofillSecondPage: boolean;
  secondPageText: string;
  isActive: boolean;
  attendeeEligibility: AttendanceEligibilityValue | null;
  issuedTo: CertificateIssuedToOption;
  certificateTypeLabel: string;
  paymentTiers: string[];
  certificateFields: Record<string, string>;
};
type CertificateFieldDefinition = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
  defaultValue: string;
};
type CertificateTemplatesLoadState = 'loading' | 'ready' | 'empty' | 'error';

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';

@Service()
export class CertificatesService {
  private readonly api = inject(CertificateApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly eventGroupsApi = inject(EventGroupApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionsService);
  private targetSearchRequestGeneration = 0;
  private routeSelectionGeneration = 0;

  readonly issuableEvents = signal<Event[]>([]);
  readonly issuableEventGroups = signal<EventGroup[]>([]);
  readonly issuableMajorEvents = signal<MajorEvent[]>([]);
  readonly certificateFolders = signal<CertificateFolder[]>([]);
  readonly availablePaymentTiers = signal<string[]>([]);
  readonly paymentTierOptions = computed(() => [
    ...new Set([...this.availablePaymentTiers(), ...this.certificateConfigModel().paymentTiers]),
  ]);
  readonly showPaymentTiers = computed(
    () => this.certificateConfigModel().issuedTo === 'ATTENDEE' && this.paymentTierOptions().length > 0,
  );
  readonly attendeeEligibilityOptions = computed(() =>
    attendanceEligibilityOptionsFor(
      'CERTIFICATE',
      this.certificateEligibilityParent(),
      this.certificateConfigModel().attendeeEligibility,
    ),
  );
  readonly showAttendeeEligibility = computed(
    () => this.certificateConfigModel().issuedTo === 'ATTENDEE' && !this.isStandaloneScope(),
  );
  readonly targetsPagination = createWorkspaceListPagination();
  readonly selectedTarget = signal<{ id: string; name: string; emoji?: string } | null>(null);
  readonly selectedTargetScopeId = computed(() => {
    const target = this.selectedTarget();
    return target ? `${this.targetFiltersForm.controls.scope.value}:${target.id}` : null;
  });
  readonly selectedTargetScopeLabel = computed(() => {
    const target = this.selectedTarget();
    if (!target) return 'Selecionar contexto do certificado';
    const scope = this.targetFiltersForm.controls.scope.value;
    const prefix =
      scope === 'OTHER'
        ? 'Certificados avulsos'
        : scope === 'EVENT_GROUP'
          ? 'Grupo de eventos'
          : scope === 'MAJOR_EVENT'
            ? 'Grande evento'
            : 'Evento';
    return `${prefix}: ${target.name}`;
  });
  readonly targetSearchLoading = signal(false);
  private readonly selectedCertificateTarget = signal<IssuableTarget | null>(null);
  readonly certificateTemplates = signal<CertificateTemplate[]>([]);
  readonly certificateTemplatesLoadState = signal<CertificateTemplatesLoadState>('loading');
  readonly certificateConfigs = signal<CertificateConfig[]>([]);
  readonly certificateConfigsPagination = createWorkspaceListPagination();
  readonly selectedCertificateConfig = signal<CertificateConfig | null>(null);
  readonly certificates = signal<Certificate[]>([]);
  readonly certificatesPagination = createWorkspaceListPagination();
  readonly personSearchResults = signal<Person[]>([]);
  readonly isImportingPeopleCsv = signal(false);
  readonly certificateFieldDefinitions = signal<CertificateFieldDefinition[]>([]);
  readonly shouldShowSecondPageText = computed(() => !this.certificateConfigModel().shouldAutofillSecondPage);
  readonly shouldShowCertificateTypeLabel = computed(() =>
    this.requiresCustomCertificateTypeLabel(this.certificateConfigModel().issuedTo),
  );
  readonly isManualCertificateIssue = computed(() => this.certificateConfigModel().issuedTo === 'OTHER');
  readonly certificateOperationsEnabled = computed(
    () =>
      this.certificateTemplatesLoadState() === 'ready' &&
      this.isCertificateTemplateAvailable(this.certificateConfigModel().certificateTemplateId),
  );
  private certificateFieldValuesJson: string | null | undefined;

  private selectedCertificateTemplate(
    templateId = this.certificateConfigModel().certificateTemplateId,
  ): CertificateTemplate | null {
    return this.certificateTemplates().find((template) => template.id === templateId) ?? null;
  }

  readonly targetFiltersForm = this.formBuilder.nonNullable.group({
    scope: ['EVENT' as WorkspaceCertificateScope, [Validators.required]],
    query: [''],
  });

  readonly folderForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    emoji: ['📁', [Validators.required]],
  });

  readonly personLookupForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  private readonly certificateConfigModel = signal<CertificateConfigFormModel>(
    this.createDefaultCertificateConfigModel(),
  );

  readonly certificateConfigForm = form(this.certificateConfigModel, (path) => {
    required(path.name);
    required(path.certificateTemplateId);
    required(path.issuedTo);
  });
  private readonly editorRevision = signal(0);
  private readonly editorBaseline = signal('');
  readonly unsavedChanges = computed(() => {
    this.editorRevision();
    return this.editorBaseline() !== this.editorSignature();
  });

  constructor() {
    bindLiveSearch({
      control: this.targetFiltersForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.applyTargetFilters(),
    });
    bindLiveSearch({
      control: this.personLookupForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchPeopleForManualIssue(),
    });
    this.folderForm.valueChanges.subscribe(() => this.editorRevision.update((revision) => revision + 1));
    this.captureEditorBaseline();
  }

  async loadInitialData(): Promise<void> {
    await Promise.all([this.loadCertificateTemplates(), this.searchTargets()]);
  }

  isStandaloneScope(): boolean {
    return this.targetFiltersForm.controls.scope.value === 'OTHER';
  }

  attendeeEligibilityHint(): string {
    return 'As regras do alvo continuam valendo; a coleta de presença é independente do certificado.';
  }

  attendeeEligibilityLabel(policy: AttendanceEligibilityValue | null | undefined): string {
    return (
      this.attendeeEligibilityOptions().find((option) => option.value === (policy ?? null))?.label ??
      'Usar regras dos eventos'
    );
  }

  private certificateEligibilityParent(): AttendanceEligibilityParent {
    const scope = this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope;
    const targetId = this.selectedTarget()?.id;
    const selectedTarget = this.selectedCertificateTarget();

    if (scope === 'EVENT') {
      const event =
        (selectedTarget?.id === targetId ? (selectedTarget as Event) : null) ??
        this.issuableEvents().find((candidate) => candidate.id === targetId);
      if (!event) {
        return 'NONE';
      }
      return event.majorEventId || event.eventGroup?.majorEventId ? 'MAJOR' : 'NONE';
    }

    if (scope === 'EVENT_GROUP') {
      const group =
        (selectedTarget?.id === targetId ? (selectedTarget as EventGroup) : null) ??
        this.issuableEventGroups().find((candidate) => candidate.id === targetId);
      if (!group) {
        return 'NONE';
      }
      return group?.majorEventId ? 'MAJOR' : 'NONE';
    }

    if (scope === 'MAJOR_EVENT') {
      return 'MAJOR';
    }

    return 'NONE';
  }

  async loadCertificateTemplates(): Promise<void> {
    const hadUnsavedChanges = this.unsavedChanges();
    this.certificateTemplatesLoadState.set('loading');
    try {
      const templates = await firstValueFrom(
        this.api.listCertificateTemplates({
          take: 200,
          includeInactive: false,
        }),
      );
      this.certificateTemplates.set(templates);
      this.certificateTemplatesLoadState.set(templates.length > 0 ? 'ready' : 'empty');
    } catch {
      this.certificateTemplates.set([]);
      this.certificateTemplatesLoadState.set('error');
    }

    const selectedTemplateId = this.certificateConfigModel().certificateTemplateId;
    if (!selectedTemplateId && this.certificateTemplates().length > 0) {
      this.certificateConfigForm().reset({
        ...this.certificateConfigModel(),
        certificateTemplateId: this.certificateTemplates()[0].id,
      });
      this.syncCertificateFieldsForm(this.certificateFieldValuesJson, this.certificateTemplates()[0].id);
      if (!hadUnsavedChanges) this.captureEditorBaseline();
      return;
    }

    this.syncCertificateFieldsForm(this.certificateFieldValuesJson, selectedTemplateId);
    if (!hadUnsavedChanges) this.captureEditorBaseline();
  }

  isCertificateTemplateAvailable(templateId: string): boolean {
    return this.certificateTemplates().some((template) => template.id === templateId);
  }

  async searchTargets(): Promise<void> {
    const requestGeneration = ++this.targetSearchRequestGeneration;
    const scope = this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope;
    const query = this.targetFiltersForm.controls.query.value.trim() || undefined;
    const pageIndex = this.targetsPagination.pageIndex();
    const pagination = pageVariables(pageIndex);
    this.targetSearchLoading.set(true);
    try {
      const items =
        scope === 'OTHER'
          ? await firstValueFrom(this.api.listCertificateFolders({ query, ...pagination }))
          : scope === 'EVENT'
            ? await firstValueFrom(this.api.listCertificateIssuableEvents({ query, ...pagination }))
            : scope === 'EVENT_GROUP'
              ? await firstValueFrom(this.api.listCertificateIssuableEventGroups({ query, ...pagination }))
              : await firstValueFrom(this.api.listCertificateIssuableMajorEvents({ query, ...pagination }));
      if (
        requestGeneration !== this.targetSearchRequestGeneration ||
        scope !== this.targetFiltersForm.controls.scope.value ||
        pageIndex !== this.targetsPagination.pageIndex() ||
        query !== (this.targetFiltersForm.controls.query.value.trim() || undefined)
      ) {
        return;
      }
      this.certificateFolders.set(scope === 'OTHER' ? applyPagedResult(items as CertificateFolder[], this.targetsPagination) : []);
      this.issuableEvents.set(scope === 'EVENT' ? applyPagedResult(items as Event[], this.targetsPagination) : []);
      this.issuableEventGroups.set(
        scope === 'EVENT_GROUP' ? applyPagedResult(items as EventGroup[], this.targetsPagination) : [],
      );
      this.issuableMajorEvents.set(
        scope === 'MAJOR_EVENT' ? applyPagedResult(items as MajorEvent[], this.targetsPagination) : [],
      );
    } catch (error) {
      if (requestGeneration === this.targetSearchRequestGeneration) {
        this.feedback.error(error, 'Não foi possível buscar os contextos de certificado.');
      }
    } finally {
      if (requestGeneration === this.targetSearchRequestGeneration) this.targetSearchLoading.set(false);
    }
  }

  async applyTargetFilters(): Promise<void> {
    resetPagination(this.targetsPagination);
    await this.searchTargets();
  }

  async previousTargetsPage(): Promise<void> {
    await loadPreviousPage(this.targetsPagination, () => this.searchTargets());
  }

  async nextTargetsPage(): Promise<void> {
    await loadNextPage(this.targetsPagination, () => this.searchTargets());
  }

  async onScopeChanged(scope: WorkspaceCertificateScope): Promise<void> {
    if (this.unsavedChanges()) return;
    if (!(await this.router.navigate(['/certificates']))) return;
    this.targetFiltersForm.controls.scope.setValue(scope);
    this.selectedTarget.set(null);
    this.selectedCertificateTarget.set(null);
    this.availablePaymentTiers.set([]);
    this.selectedCertificateConfig.set(null);
    this.certificateConfigs.set([]);
    this.certificates.set([]);
    this.personSearchResults.set([]);
    this.resetFolderForm();
    this.resetCertificateConfigForm();
    resetPagination(this.targetsPagination);
    await this.searchTargets();
    this.captureEditorBaseline();
  }

  async selectTarget(target: IssuableTarget): Promise<void> {
    void this.router.navigate([
      '/certificates',
      this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope),
      target.id,
    ]);
    await this.applyTargetSelection(target);
  }

  async selectTargetByRoute(
    targetType: string | null,
    targetId: string | null,
    configId: string | null,
  ): Promise<void> {
    const routeSelectionGeneration = ++this.routeSelectionGeneration;
    if (!targetType || !targetId) {
      this.targetFiltersForm.controls.scope.setValue('OTHER', { emitEvent: false });
      this.clearSelection();
      resetPagination(this.targetsPagination);
      await this.searchTargets();
      return;
    }

    const scope = this.targetTypeToScope(targetType);
    if (!scope) {
      void this.router.navigate(['/certificates']);
      return;
    }

    this.targetFiltersForm.controls.scope.setValue(scope);
    await this.searchTargets();
    if (routeSelectionGeneration !== this.routeSelectionGeneration) return;

    const target = await this.getTargetByRoute(scope, targetId);
    if (routeSelectionGeneration !== this.routeSelectionGeneration) return;
    await this.applyTargetSelection(target);
    if (routeSelectionGeneration !== this.routeSelectionGeneration) return;

    if (!configId) {
      return;
    }

    try {
      const config = await firstValueFrom(this.api.getCertificateConfig(configId));
      if (routeSelectionGeneration !== this.routeSelectionGeneration) return;
      const configTarget = this.getCertificateConfigTarget(config);
      if (config.scope !== scope || configTarget?.id !== target.id) {
        void this.router.navigate(['/certificates', this.scopeToTargetType(scope), target.id]);
        return;
      }
      this.applyCertificateConfigSelection(config);
    } catch (error) {
      if (routeSelectionGeneration !== this.routeSelectionGeneration) return;
      this.feedback.error(error, 'Não foi possível abrir a configuração de certificado.');
      void this.router.navigate(['/certificates', this.scopeToTargetType(scope), target.id]);
    }
  }

  private async applyTargetSelection(target: IssuableTarget): Promise<void> {
    this.availablePaymentTiers.set([]);
    const scope = this.targetFiltersForm.controls.scope.value;
    const majorEventId =
      scope === 'MAJOR_EVENT' ? target.id : scope === 'EVENT' ? (target as Event).majorEventId : null;
    this.selectedTarget.set({
      id: target.id,
      name: target.name,
      emoji: target.emoji,
    });
    this.selectedCertificateTarget.set(target);
    if (this.isStandaloneScope()) {
      const folder = target as CertificateFolder;
      this.folderForm.setValue({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
      });
    }
    this.personLookupForm.reset({ query: '' }, { emitEvent: false });
    this.personSearchResults.set([]);
    this.selectedCertificateConfig.set(null);
    this.resetCertificateConfigForm();
    resetPagination(this.certificateConfigsPagination);
    resetPagination(this.certificatesPagination);
    await Promise.all([
      this.loadCertificateConfigs(),
      this.loadCertificates(),
      this.loadOptionalPaymentTiers(majorEventId, target.id, scope),
    ]);
    this.captureEditorBaseline();
  }

  private async loadOptionalPaymentTiers(
    majorEventId: string | null | undefined,
    targetId: string,
    scope: WorkspaceCertificateScope,
  ): Promise<void> {
    if (!majorEventId) return;
    try {
      const majorEvent = await firstValueFrom(this.majorEventsApi.getMajorEvent(majorEventId));
      if (this.selectedTarget()?.id === targetId && this.targetFiltersForm.controls.scope.value === scope) {
        this.availablePaymentTiers.set(
          majorEvent.majorEventPrices?.flatMap((price) => price.tiers.map((tier) => tier.name)) ?? [],
        );
      }
    } catch {
      // Parent-event read access is optional for certificate operators. Saved tier filters remain editable.
    }
  }

  selectCertificateConfig(config: CertificateConfig): void {
    const selectedTarget = this.selectedTarget();
    if (selectedTarget) {
      void this.router.navigate([
        '/certificates',
        this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope),
        selectedTarget.id,
        config.id,
      ]);
    }
    this.applyCertificateConfigSelection(config);
  }

  certificateConfigRoute(configId: string): string[] | null {
    const target = this.selectedTarget();
    return target ? ['/certificates', this.scopeToTargetType(this.targetFiltersForm.controls.scope.value), target.id, configId] : null;
  }

  private applyCertificateConfigSelection(config: CertificateConfig, loadCertificates = true): void {
    this.selectedCertificateConfig.set(config);
    this.certificateFieldValuesJson = config.certificateFieldsJson;
    this.certificateConfigForm().reset({
      id: config.id,
      name: config.name,
      certificateTemplateId: config.certificateTemplateId,
      certificateText: config.certificateText ?? '',
      shouldAutofillSecondPage: config.shouldAutofillSecondPage,
      secondPageText: config.secondPageText ?? '',
      isActive: config.isActive,
      attendeeEligibility:
        config.attendeeEligibility === AttendanceEligibility.ANYONE ? null : (config.attendeeEligibility ?? null),
      paymentTiers: config.paymentTiers ?? [],
      issuedTo: this.buildIssuedToOption(
        config.issuedTo,
        this.parseLecturerEventCategory(config.certificateFieldsJson),
      ),
      certificateTypeLabel:
        this.buildCertificateTypeLabel(
          this.buildIssuedToOption(config.issuedTo, this.parseLecturerEventCategory(config.certificateFieldsJson)),
          config.certificateTypeLabel,
        ) ?? '',
      certificateFields: {},
    });
    this.syncCertificateFieldsForm(config.certificateFieldsJson, config.certificateTemplateId);
    this.captureEditorBaseline();
    resetPagination(this.certificatesPagination);
    if (loadCertificates) void this.loadCertificates();
  }

  startNewCertificateConfig(): void {
    this.selectedCertificateConfig.set(null);
    const selectedTarget = this.selectedTarget();
    if (selectedTarget) {
      void this.router.navigate([
        '/certificates',
        this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope),
        selectedTarget.id,
      ]);
    }
    this.personLookupForm.reset({ query: '' }, { emitEvent: false });
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    this.captureEditorBaseline();
    resetPagination(this.certificatesPagination);
    void this.loadCertificates();
  }

  clearSelection(): void {
    this.selectedTarget.set(null);
    this.selectedCertificateTarget.set(null);
    this.availablePaymentTiers.set([]);
    this.selectedCertificateConfig.set(null);
    this.certificateConfigs.set([]);
    this.certificates.set([]);
    this.resetFolderForm();
    resetPagination(this.certificateConfigsPagination);
    resetPagination(this.certificatesPagination);
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    this.captureEditorBaseline();
  }

  onCertificateTemplateChanged(templateId: string): void {
    this.certificateFieldValuesJson = null;
    this.certificateConfigForm.certificateTemplateId().value.set(templateId);
    this.syncCertificateFieldsForm(undefined, templateId);
  }

  onCertificateIssuedToChanged(issuedTo: CertificateIssuedToOption): void {
    if (this.isStandaloneScope()) {
      this.certificateConfigForm.issuedTo().value.set('OTHER');
      this.certificateConfigForm.attendeeEligibility().value.set(null);
      this.certificateConfigForm
        .certificateTypeLabel()
        .value.set(
          this.buildCertificateTypeLabel('OTHER', this.certificateConfigModel().certificateTypeLabel) ?? 'Manual',
        );
      return;
    }

    this.certificateConfigForm.issuedTo().value.set(issuedTo);
    if (issuedTo !== 'ATTENDEE') {
      this.certificateConfigForm.attendeeEligibility().value.set(null);
    }
    this.certificateConfigForm
      .certificateTypeLabel()
      .value.set(
        this.requiresCustomCertificateTypeLabel(issuedTo) ? '' : (this.buildCertificateTypeLabel(issuedTo) ?? ''),
      );
  }

  async saveCertificateConfig(): Promise<void> {
    await this.persistCertificateConfig({ showSnackbar: true });
  }

  async cloneCertificateConfig(config: CertificateConfig): Promise<void> {
    const result = await this.openCertificateConfigCloneDialog(config);
    if (!result) {
      return;
    }

    const input: CertificateConfigCloneInput = {
      ...(result.name ? { name: result.name } : {}),
      scope: result.scope,
      majorEventId: result.scope === 'MAJOR_EVENT' ? result.targetId : null,
      eventGroupId: result.scope === 'EVENT_GROUP' ? result.targetId : null,
      eventId: result.scope === 'EVENT' ? result.targetId : null,
      folderId: result.scope === 'OTHER' ? result.targetId : null,
      parts: {
        textContent: Boolean(result.parts.textContent),
        recipientData: Boolean(result.parts.recipientData),
        activeState: Boolean(result.parts.activeState),
        issuedPeople: Boolean(result.parts.issuedPeople),
        manualPeople: Boolean(result.parts.manualPeople),
      },
    };

    try {
      const created = await firstValueFrom(this.api.cloneCertificateConfig(config.id, input));
      this.snackbar.open('Configuração de certificado duplicada.', 'Fechar', { duration: 2500 });
      const destinationTarget = this.getCertificateConfigTarget(created);
      if (destinationTarget) {
        this.targetFiltersForm.controls.scope.setValue(created.scope, { emitEvent: false });
        await this.searchTargets();
        await this.applyTargetSelection(destinationTarget);
      } else {
        await this.loadCertificateConfigs();
      }
      this.selectCertificateConfig(created);
      await this.loadCertificates();
    } catch (error) {
      this.feedback.error(error, 'Não foi possível duplicar a configuração de certificado.');
    }
  }

  startNewFolder(): void {
    this.resetFolderForm();
    this.captureEditorBaseline();
  }

  cancelFolderEdit(): void {
    const folder = this.selectedCertificateTarget();
    if (this.isStandaloneScope() && folder) {
      this.folderForm.setValue({ id: folder.id, name: folder.name, emoji: folder.emoji });
      this.captureEditorBaseline();
      return;
    }
    this.resetFolderForm();
    this.captureEditorBaseline();
  }

  async saveCertificateFolder(): Promise<boolean> {
    if (this.folderForm.invalid) {
      this.folderForm.markAllAsTouched();
      this.snackbar.open('Informe nome e emoji da pasta.', 'Fechar', { duration: 2500 });
      return false;
    }

    const raw = this.folderForm.getRawValue();
    const payload: CertificateFolderInput = {
      name: raw.name.trim(),
      emoji: raw.emoji.trim(),
    };

    if (raw.id && this.selectedTarget()?.name !== payload.name) {
      const confirmed = await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            data: {
              title: 'Renomear pasta e reemitir certificados?',
              message: 'Alterar o nome da pasta será refletido em todos os certificados já emitidos nela.',
              details: [
                `Novo nome: ${payload.name}.`,
                'Escopo: todas as configurações ativas desta pasta.',
                'Os certificados existentes serão reemitidos com o novo nome da pasta.',
              ],
              confirmLabel: 'Renomear e reemitir',
              tone: 'danger',
            },
            width: '420px',
          })
          .afterClosed(),
      );
      if (confirmed !== true) {
        return false;
      }

      payload.reissueCertificates = true;
    }

    try {
      const savedFolder = raw.id
        ? await firstValueFrom(this.api.updateCertificateFolder(raw.id, payload))
        : await firstValueFrom(this.api.createCertificateFolder(payload));
      this.snackbar.open(raw.id ? 'Pasta atualizada.' : 'Pasta criada.', 'Fechar', { duration: 2500 });
      this.targetFiltersForm.controls.scope.setValue('OTHER', { emitEvent: false });
      await this.searchTargets();
      void this.router.navigate(['/certificates', 'folder', savedFolder.id]);
      await this.applyTargetSelection(savedFolder);
      return true;
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar a pasta.');
      return false;
    }
  }

  private async persistCertificateConfig(options?: { showSnackbar?: boolean }): Promise<CertificateConfig | null> {
    if (!this.certificateOperationsEnabled()) {
      this.snackbar.open('Selecione um modelo de certificado disponível antes de continuar.', 'Fechar', {
        duration: 3500,
      });
      return null;
    }

    let savedConfig: CertificateConfig | null = null;

    const success = await submit(this.certificateConfigForm, async (field) => {
      const raw = field().value();
      const fieldErrors = this.validateCertificateFields(raw.certificateFields);
      const certificateTypeErrors = this.validateCertificateTypeLabel(raw.issuedTo, raw.certificateTypeLabel);
      if (fieldErrors.length > 0 || certificateTypeErrors.length > 0) {
        return [...fieldErrors, ...certificateTypeErrors];
      }

      const selectedTarget = this.selectedTarget();
      if (!selectedTarget) {
        const message = this.isStandaloneScope()
          ? 'Selecione uma pasta primeiro.'
          : 'Selecione um evento, grupo ou grande evento primeiro.';
        this.snackbar.open(message, 'Fechar', {
          duration: 2500,
        });
        return {
          kind: 'targetRequired',
          message,
        };
      }

      const payload = this.buildCertificateConfigPayload(selectedTarget.id, raw);
      const configId = raw.id;
      this.certificateFieldValuesJson = payload.certificateFieldsJson;

      savedConfig = configId
        ? await firstValueFrom(this.api.updateCertificateConfig(configId, payload))
        : await firstValueFrom(this.api.createCertificateConfig(payload));

      if (options?.showSnackbar ?? true) {
        this.snackbar.open(
          configId ? 'Configuração de certificado atualizada.' : 'Configuração de certificado criada.',
          'Fechar',
          { duration: 2500 },
        );
      }

      await this.loadCertificateConfigs();
      this.selectCertificateConfig(savedConfig);
      await this.loadCertificates();
      return undefined;
    });

    if (!success) {
      return null;
    }

    return savedConfig;
  }

  async searchPeopleForManualIssue(): Promise<void> {
    const query = this.personLookupForm.controls.query.value.trim();
    if (!query) {
      this.personSearchResults.set([]);
      return;
    }

    const searches = buildPeopleCandidateLookupFilters(query, 20).map((filters) =>
      firstValueFrom(this.peopleApi.listPeopleSummaries(filters)),
    );
    const peopleById = new Map<string, Person>();
    for (const person of (await Promise.all(searches)).flat()) {
      peopleById.set(person.id, person);
    }
    this.personSearchResults.set([...peopleById.values()].slice(0, 20));
  }

  async issueCertificateForPerson(person: Person): Promise<void> {
    const selectedConfig = await this.persistCertificateConfig({
      showSnackbar: false,
    });
    if (!selectedConfig) {
      return;
    }

    try {
      await firstValueFrom(this.api.issueCertificateForPerson(selectedConfig.id, person.id));
      this.snackbar.open(`Certificado emitido para ${person.name}.`, 'Fechar', {
        duration: 2500,
      });
      await this.loadCertificates();
    } catch (error) {
      this.feedback.error(error, 'Não foi possível emitir o certificado.');
    }
  }

  async issueManualCertificatesFromCsv(file: File | null): Promise<void> {
    if (!file || this.isImportingPeopleCsv()) {
      return;
    }

    this.isImportingPeopleCsv.set(true);
    try {
      const selectedConfig = await this.persistCertificateConfig({ showSnackbar: false });
      if (!selectedConfig) {
        return;
      }
      if (selectedConfig.issuedTo !== 'OTHER') {
        this.snackbar.open('A importação CSV está disponível apenas para certificados manuais.', 'Fechar', {
          duration: 3500,
        });
        return;
      }

      const csvContent = await file.text();
      const parsedCsv = parseCsv(csvContent);
      const selectedHeader = await firstValueFrom(
        this.dialog
          .open(AttendanceCsvColumnDialogComponent, {
            width: '32rem',
            data: {
              fileName: file.name,
              headers: parsedCsv.headers,
              previewRows: parsedCsv.rows.slice(0, 12),
              title: 'Emitir certificados por CSV',
              confirmLabel: 'Continuar',
            },
          })
          .afterClosed(),
      );
      if (!selectedHeader) {
        return;
      }

      let resolutions: CertificateCsvImportResolution[] = [];
      let result = await firstValueFrom(
        this.api.issueManualCertificatesFromCsv({
          configId: selectedConfig.id,
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
                  'Alguns dados do CSV podem identificar mais de uma pessoa. Selecione a pessoa correta para continuar a emissão.',
                confirmLabel: 'Continuar emissão',
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
          this.api.issueManualCertificatesFromCsv({
            configId: selectedConfig.id,
            csvContent,
            selectedHeader,
            resolutions,
          }),
        );
      }

      await this.loadCertificates();
      this.dialog.open(AttendanceCsvImportResultDialogComponent, {
        width: '36rem',
        maxHeight: '80vh',
        data: {
          ...result,
          title: 'Emissão de certificados concluída',
          createdLabel: 'certificados emitidos',
          duplicateLabel: 'já emitidos ou repetidos',
          failedInstruction: 'Emita os certificados restantes manualmente.',
        },
      });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível importar o CSV.');
    } finally {
      this.isImportingPeopleCsv.set(false);
    }
  }

  async issueMissedCertificates(): Promise<void> {
    const selectedConfig = await this.persistCertificateConfig({
      showSnackbar: false,
    });
    if (!selectedConfig) {
      return;
    }

    try {
      const issued = await firstValueFrom(this.api.issueMissedCertificates(selectedConfig.id));
      this.snackbar.open(`${issued.length} certificado(s) processado(s).`, 'Fechar', {
        duration: 2500,
      });
      await this.loadCertificates();
    } catch (error) {
      this.feedback.error(error, 'Não foi possível emitir os certificados.');
    }
  }

  async deleteCertificateConfig(config: CertificateConfig): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Excluir configuração',
      message: `Excluir a configuração "${config.name}"? Os certificados emitidos por ela deixarão de aparecer.`,
      confirmLabel: 'Excluir',
    });
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(this.api.deleteCertificateConfig(config.id));
      this.snackbar.open('Configuração de certificado excluída.', 'Fechar', {
        duration: 2500,
      });

      if (this.selectedCertificateConfig()?.id === config.id) {
        this.startNewCertificateConfig();
      }
      await Promise.all([this.loadCertificateConfigs(), this.loadCertificates()]);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível excluir a configuração de certificado.');
    }
  }

  async deleteCertificate(certificate: Certificate, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();

    const confirmed = await this.confirm({
      title: 'Excluir certificado',
      message: `Excluir o certificado de ${certificate.person.name}? Ele poderá ser reativado mantendo o mesmo ID se for emitido novamente.`,
      confirmLabel: 'Excluir',
    });
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(this.api.deleteCertificate(certificate.id));
      this.snackbar.open('Certificado excluído.', 'Fechar', { duration: 2500 });
      await this.loadCertificates();
    } catch (error) {
      this.feedback.error(error, 'Não foi possível excluir o certificado.');
    }
  }

  async downloadCertificate(certificate: Certificate, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();

    const payload = await firstValueFrom(this.api.downloadCertificate(certificate.id));
    const blob = this.base64ToBlob(payload.contentBase64, payload.mimeType);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = payload.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private async loadCertificateConfigs(): Promise<void> {
    const selectedTarget = this.selectedTarget();
    if (!selectedTarget) {
      this.certificateConfigs.set([]);
      return;
    }

    const scope = this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope;
    const pageIndex = this.certificateConfigsPagination.pageIndex();
    const configs = await firstValueFrom(
      this.api.listCertificateConfigs(
        scope,
        selectedTarget.id,
        {
          includeInactive: true,
          ...pageVariables(pageIndex),
        },
      ),
    );
    if (
      this.selectedTarget()?.id !== selectedTarget.id ||
      this.targetFiltersForm.controls.scope.value !== scope ||
      this.certificateConfigsPagination.pageIndex() !== pageIndex
    ) {
      return;
    }
    this.certificateConfigs.set(applyPagedResult(configs, this.certificateConfigsPagination));

    const selectedConfig = this.selectedCertificateConfig();
    if (!selectedConfig) {
      return;
    }

    const refreshedSelection = configs.find((config) => config.id === selectedConfig.id);
    if (refreshedSelection && !this.unsavedChanges()) {
      this.applyCertificateConfigSelection(refreshedSelection, false);
    }
  }

  async previousCertificateConfigsPage(): Promise<void> {
    await loadPreviousPage(this.certificateConfigsPagination, () => this.loadCertificateConfigs());
  }

  async nextCertificateConfigsPage(): Promise<void> {
    await loadNextPage(this.certificateConfigsPagination, () => this.loadCertificateConfigs());
  }

  private async confirm(data: { title: string; message: string; confirmLabel?: string }): Promise<boolean> {
    const result = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data,
          width: '420px',
        })
        .afterClosed(),
    );

    return result === true;
  }

  private async openCertificateConfigCloneDialog(
    config: CertificateConfig,
  ): Promise<CertificateConfigCloneDialogResult | null | undefined> {
    const canCopyIssuedPeople = this.permissions.hasAll([Permission.Certificate.Read, Permission.Certificate.Issue]);
    const canCopyManualPeople = config.issuedTo === 'OTHER' && canCopyIssuedPeople;
    const dialogRef = this.dialog.open(CertificateConfigCloneDialogComponent, {
      width: '52rem',
      maxWidth: '95vw',
      data: {
        config,
        defaultName: `${config.name} (cópia)`,
        canCopyIssuedPeople,
        canCopyManualPeople,
      },
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private async loadCertificates(): Promise<void> {
    const selectedTarget = this.selectedTarget();
    if (!selectedTarget) {
      this.certificates.set([]);
      return;
    }

    const scope = this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope;
    const configId = this.selectedCertificateConfig()?.id;
    const pageIndex = this.certificatesPagination.pageIndex();
    const certificates = await firstValueFrom(
      this.api.listCertificates(
        scope,
        selectedTarget.id,
        {
          configId,
          ...pageVariables(pageIndex),
        },
      ),
    );
    if (
      this.selectedTarget()?.id !== selectedTarget.id ||
      this.targetFiltersForm.controls.scope.value !== scope ||
      this.selectedCertificateConfig()?.id !== configId ||
      this.certificatesPagination.pageIndex() !== pageIndex
    ) {
      return;
    }
    this.certificates.set(applyPagedResult(certificates, this.certificatesPagination));
  }

  async previousCertificatesPage(): Promise<void> {
    await loadPreviousPage(this.certificatesPagination, () => this.loadCertificates());
  }

  async nextCertificatesPage(): Promise<void> {
    await loadNextPage(this.certificatesPagination, () => this.loadCertificates());
  }

  private buildCertificateConfigPayload(targetId: string, raw = this.certificateConfigModel()): CertificateConfigInput {
    const scope = this.targetFiltersForm.controls.scope.value as WorkspaceCertificateScope;
    const isStandalone = scope === 'OTHER';

    return {
      name: raw.name.trim(),
      scope,
      majorEventId: scope === 'MAJOR_EVENT' ? targetId : null,
      eventGroupId: scope === 'EVENT_GROUP' ? targetId : null,
      eventId: scope === 'EVENT' ? targetId : null,
      folderId: isStandalone ? targetId : null,
      certificateTemplateId: raw.certificateTemplateId.trim(),
      certificateText: raw.certificateText.trim() || null,
      shouldAutofillSecondPage: isStandalone ? false : raw.shouldAutofillSecondPage,
      secondPageText: isStandalone || !raw.shouldAutofillSecondPage ? raw.secondPageText.trim() || null : null,
      isActive: raw.isActive,
      attendeeEligibility:
        raw.issuedTo === 'ATTENDEE' && !isStandalone
          ? raw.attendeeEligibility === AttendanceEligibility.ANYONE
            ? null
            : raw.attendeeEligibility
          : null,
      paymentTiers: raw.issuedTo === 'ATTENDEE' && !isStandalone ? raw.paymentTiers : [],
      issuedTo: isStandalone ? 'OTHER' : this.normalizeIssuedTo(raw.issuedTo),
      certificateTypeLabel: this.buildCertificateTypeLabel(
        isStandalone ? 'OTHER' : raw.issuedTo,
        raw.certificateTypeLabel,
      ),
      certificateFieldsJson: this.buildCertificateFieldsJson(
        raw.certificateFields,
        isStandalone ? undefined : this.parseIssuedToLecturerEventCategory(raw.issuedTo),
      ),
    };
  }

  private async getTargetByRoute(scope: WorkspaceCertificateScope, targetId: string): Promise<IssuableTarget> {
    if (scope === 'EVENT') {
      return firstValueFrom(this.eventsApi.getEvent(targetId));
    }

    if (scope === 'EVENT_GROUP') {
      return firstValueFrom(this.eventGroupsApi.getEventGroup(targetId));
    }

    if (scope === 'OTHER') {
      return firstValueFrom(this.api.getCertificateFolder(targetId));
    }

    return firstValueFrom(this.majorEventsApi.getMajorEvent(targetId));
  }

  private getCertificateConfigTarget(config: CertificateConfig): IssuableTarget | null {
    if (config.scope === 'EVENT' && config.eventId) {
      return {
        ...(config.event ?? {}),
        id: config.eventId,
        name: config.event?.name ?? config.eventId,
      } as IssuableTarget;
    }

    if (config.scope === 'EVENT_GROUP' && config.eventGroupId) {
      return {
        ...(config.eventGroup ?? {}),
        id: config.eventGroupId,
        name: config.eventGroup?.name ?? config.eventGroupId,
      } as IssuableTarget;
    }

    if (config.scope === 'MAJOR_EVENT' && config.majorEventId) {
      return {
        ...(config.majorEvent ?? {}),
        id: config.majorEventId,
        name: config.majorEvent?.name ?? config.majorEventId,
      } as IssuableTarget;
    }

    if (config.scope === 'OTHER' && config.folder) {
      return config.folder;
    }

    return null;
  }

  private targetTypeToScope(targetType: string): WorkspaceCertificateScope | null {
    if (targetType === 'event') {
      return 'EVENT';
    }

    if (targetType === 'event-group') {
      return 'EVENT_GROUP';
    }

    if (targetType === 'major-event') {
      return 'MAJOR_EVENT';
    }

    if (targetType === 'folder') {
      return 'OTHER';
    }

    return null;
  }

  private scopeToTargetType(scope: WorkspaceCertificateScope): CertificateTargetType {
    if (scope === 'EVENT') {
      return 'event';
    }

    if (scope === 'EVENT_GROUP') {
      return 'event-group';
    }

    if (scope === 'OTHER') {
      return 'folder';
    }

    return 'major-event';
  }

  private resetCertificateConfigForm(): void {
    const templateId = this.certificateTemplates()[0]?.id ?? '';
    this.certificateFieldValuesJson = null;
    this.certificateConfigForm().reset({
      ...this.createDefaultCertificateConfigModel(),
      certificateTemplateId: templateId,
    });
    this.syncCertificateFieldsForm(null, templateId);
  }

  private resetFolderForm(): void {
    this.folderForm.reset(
      {
        id: '',
        name: '',
        emoji: '📁',
      },
      { emitEvent: false },
    );
  }

  private editorSignature(): string {
    return JSON.stringify({
      folder: this.folderForm.getRawValue(),
      config: this.certificateConfigModel(),
    });
  }

  private captureEditorBaseline(): void {
    this.editorBaseline.set(this.editorSignature());
  }

  syncCertificateFieldsForm(
    existingFieldsJson?: string | null,
    templateId = this.certificateConfigModel().certificateTemplateId,
  ): void {
    const definitions = this.parseCertificateFieldDefinitions(this.selectedCertificateTemplate(templateId));
    const existingFields = this.parseCertificateFields(existingFieldsJson);
    const certificateFields: Record<string, string> = {};
    this.certificateFieldDefinitions.set(definitions);

    for (const definition of definitions) {
      certificateFields[definition.key] = existingFields[definition.key] ?? definition.defaultValue;
    }

    // Update the model directly to sync the nested fields
    this.certificateConfigModel.update((model) => ({
      ...model,
      certificateFields,
    }));
  }

  certificateField(key: string) {
    return this.certificateConfigForm.certificateFields[key];
  }

  private buildCertificateFieldsJson(
    values = this.certificateConfigModel().certificateFields,
    lecturerEventCategory?: LecturerEventCategory,
  ): string | null {
    const certificateFields: Record<string, string> = {};

    for (const definition of this.certificateFieldDefinitions()) {
      const value = this.normalizeCertificateFieldValue(values[definition.key]);

      if (value && value !== definition.defaultValue) {
        certificateFields[definition.key] = value;
      }
    }

    if (lecturerEventCategory) {
      certificateFields[LECTURER_EVENT_CATEGORY_FIELD] = lecturerEventCategory;
    }

    return Object.keys(certificateFields).length > 0 ? JSON.stringify(certificateFields) : null;
  }

  private validateCertificateFields(
    values: Record<string, string>,
  ): Array<{ kind: string; message: string; fieldTree: FieldTree<unknown> }> {
    return this.certificateFieldDefinitions()
      .filter((definition) => definition.required && !this.normalizeCertificateFieldValue(values[definition.key]))
      .map((definition) => ({
        kind: 'required',
        message: 'Campo obrigatório.',
        fieldTree: this.certificateField(definition.key) as FieldTree<unknown>,
      }));
  }

  private createDefaultCertificateConfigModel(): CertificateConfigFormModel {
    const isStandalone = this.isStandaloneScope();
    return {
      id: '',
      name: '',
      certificateTemplateId: '',
      certificateText: '',
      shouldAutofillSecondPage: !isStandalone,
      secondPageText: '',
      isActive: true,
      attendeeEligibility: null,
      issuedTo: isStandalone ? 'OTHER' : 'ATTENDEE',
      certificateTypeLabel: isStandalone ? 'Manual' : 'Participação',
      paymentTiers: [],
      certificateFields: {},
    };
  }

  private parseCertificateFields(rawValue?: string | null): Record<string, string> {
    if (!rawValue) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, string] => {
            const [key, value] = entry;
            if (key === LECTURER_EVENT_CATEGORY_FIELD) {
              return false;
            }

            return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
          })
          .map(([key, value]) => [key, this.normalizeCertificateFieldValue(value)]),
      );
    } catch {
      return {};
    }
  }

  private parseCertificateFieldDefinitions(template: CertificateTemplate | null): CertificateFieldDefinition[] {
    if (!template?.certificateFieldsJson) {
      return [];
    }

    try {
      const parsed = JSON.parse(template.certificateFieldsJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
      }

      return Object.entries(parsed)
        .map(([key, rawDefinition]) => this.parseCertificateFieldDefinition(key, rawDefinition))
        .filter((definition): definition is CertificateFieldDefinition => Boolean(definition));
    } catch {
      return [];
    }
  }

  private parseCertificateFieldDefinition(key: string, rawDefinition: unknown): CertificateFieldDefinition | null {
    if (!rawDefinition || typeof rawDefinition !== 'object' || Array.isArray(rawDefinition)) {
      return null;
    }

    const definition = rawDefinition as Record<string, unknown>;
    const type = definition['type'];
    if (type !== 'string' && type !== 'number' && type !== 'date') {
      return null;
    }

    return {
      key,
      label: typeof definition['label'] === 'string' ? definition['label'] : key,
      type,
      required: definition['required'] === true,
      defaultValue: this.normalizeCertificateFieldValue(definition['default']),
    };
  }

  private buildIssuedToOption(
    issuedTo: CertificateIssuedTo,
    lecturerEventCategory: LecturerEventCategory | null,
  ): CertificateIssuedToOption {
    if (issuedTo !== 'LECTURER') {
      return issuedTo;
    }

    if (lecturerEventCategory === 'PALESTRA') {
      return 'LECTURER_PALESTRA';
    }

    if (lecturerEventCategory === 'MINICURSO') {
      return 'LECTURER_MINICURSO';
    }

    return 'LECTURER';
  }

  private normalizeIssuedTo(issuedTo: CertificateIssuedToOption): CertificateIssuedTo {
    return issuedTo === 'LECTURER_PALESTRA' || issuedTo === 'LECTURER_MINICURSO' ? 'LECTURER' : issuedTo;
  }

  private buildCertificateTypeLabel(issuedTo: CertificateIssuedToOption, customLabel?: string | null): string | null {
    if (issuedTo === 'ATTENDEE') {
      return 'Participação';
    }

    if (issuedTo === 'LECTURER_PALESTRA') {
      return 'Palestrante';
    }

    if (issuedTo === 'LECTURER_MINICURSO') {
      return 'Ministrante';
    }

    const sportsLabels: Partial<Record<CertificateIssuedTo, string>> = {
      SPORTS_PLAYER: 'Atleta',
      SPORTS_CAPTAIN: 'Capitão',
      SPORTS_COACH: 'Técnico',
      SPORTS_REFEREE: 'Árbitro',
      SPORTS_INTERMEDIATOR: 'Intermediador',
      SPORTS_SCOREKEEPER: 'Mesário',
    };
    if (issuedTo in sportsLabels) {
      return sportsLabels[issuedTo as CertificateIssuedTo] ?? null;
    }

    return customLabel?.trim() || null;
  }

  private requiresCustomCertificateTypeLabel(issuedTo: CertificateIssuedToOption): boolean {
    return issuedTo === 'LECTURER' || issuedTo === 'OTHER';
  }

  private validateCertificateTypeLabel(
    issuedTo: CertificateIssuedToOption,
    certificateTypeLabel: string,
  ): Array<{ kind: string; message: string; fieldTree: FieldTree<unknown> }> {
    if (!this.requiresCustomCertificateTypeLabel(issuedTo) || certificateTypeLabel.trim()) {
      return [];
    }

    return [
      {
        kind: 'required',
        message: 'Campo obrigatório.',
        fieldTree: this.certificateConfigForm.certificateTypeLabel as FieldTree<unknown>,
      },
    ];
  }

  private parseIssuedToLecturerEventCategory(issuedTo: CertificateIssuedToOption): LecturerEventCategory | undefined {
    if (issuedTo === 'LECTURER_PALESTRA') {
      return 'PALESTRA';
    }

    if (issuedTo === 'LECTURER_MINICURSO') {
      return 'MINICURSO';
    }

    if (issuedTo === 'LECTURER') {
      return 'OTHER';
    }

    return undefined;
  }

  private parseLecturerEventCategory(rawValue?: string | null): LecturerEventCategory | null {
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const fields = parsed as Record<string, unknown>;
      const value = fields[LECTURER_EVENT_CATEGORY_FIELD];
      return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
    } catch {
      return null;
    }
  }

  private normalizeCertificateFieldValue(rawValue: unknown): string {
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      return String(rawValue).trim();
    }

    return '';
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }
}
