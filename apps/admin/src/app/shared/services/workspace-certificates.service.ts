import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { form, required, submit, type FieldTree } from '@angular/forms/signals';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import {
  Certificate,
  CertificateConfig,
  CertificateConfigInput,
  CertificateIssuedTo,
  CertificateScope,
  CertificateTemplate,
  Event,
  EventGroup,
  MajorEvent,
  Person,
} from '../../graphql/models';
import { ConfirmationDialogComponent } from '../components/confirmation-dialog.component';
import { getErrorMessage } from '../error-message';
import { bindLiveSearch } from '../live-search';
import { applyPagedResult, createWorkspaceListPagination, pageVariables, resetPagination } from '../list-pagination';

type IssuableScope = Exclude<CertificateScope, 'OTHER'>;
type CertificateTargetType = 'event' | 'event-group' | 'major-event';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';
type CertificateIssuedToOption = CertificateIssuedTo | 'LECTURER_PALESTRA' | 'LECTURER_MINICURSO';
type IssuableTarget = Event | EventGroup | MajorEvent;
type CertificateConfigFormModel = {
  id: string;
  name: string;
  certificateTemplateId: string;
  certificateText: string;
  shouldAutofillSecondPage: boolean;
  secondPageText: string;
  isActive: boolean;
  issuedTo: CertificateIssuedToOption;
  certificateFields: Record<string, string>;
};
type CertificateFieldDefinition = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
  defaultValue: string;
};

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceCertificatesService {
  private readonly api = inject(CertificateApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly eventGroupsApi = inject(EventGroupApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly issuableEvents = signal<Event[]>([]);
  readonly issuableEventGroups = signal<EventGroup[]>([]);
  readonly issuableMajorEvents = signal<MajorEvent[]>([]);
  readonly targetsPagination = createWorkspaceListPagination();
  readonly selectedTarget = signal<{ id: string; name: string } | null>(null);
  readonly certificateTemplates = signal<CertificateTemplate[]>([]);
  readonly certificateConfigs = signal<CertificateConfig[]>([]);
  readonly certificateConfigsPagination = createWorkspaceListPagination();
  readonly selectedCertificateConfig = signal<CertificateConfig | null>(null);
  readonly certificates = signal<Certificate[]>([]);
  readonly certificatesPagination = createWorkspaceListPagination();
  readonly personSearchResults = signal<Person[]>([]);
  readonly certificateFieldDefinitions = signal<CertificateFieldDefinition[]>([]);
  readonly shouldShowSecondPageText = computed(() => !this.certificateConfigModel().shouldAutofillSecondPage);
  private certificateFieldValuesJson: string | null | undefined;

  private selectedCertificateTemplate(
    templateId = this.certificateConfigModel().certificateTemplateId,
  ): CertificateTemplate | null {
    return this.certificateTemplates().find((template) => template.id === templateId) ?? null;
  }

  readonly targetFiltersForm = this.formBuilder.nonNullable.group({
    scope: ['EVENT' as IssuableScope, [Validators.required]],
    query: [''],
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
  }

  async loadInitialData(): Promise<void> {
    await Promise.all([this.loadCertificateTemplates(), this.searchTargets()]);
  }

  async loadCertificateTemplates(): Promise<void> {
    this.certificateTemplates.set(
      await firstValueFrom(
        this.api.listCertificateTemplates({
          take: 200,
          includeInactive: false,
        }),
      ),
    );
    const selectedTemplateId = this.certificateConfigModel().certificateTemplateId;
    if (!selectedTemplateId && this.certificateTemplates().length > 0) {
      this.certificateConfigForm().reset({
        ...this.certificateConfigModel(),
        certificateTemplateId: this.certificateTemplates()[0].id,
      });
      this.syncCertificateFieldsForm(this.certificateFieldValuesJson, this.certificateTemplates()[0].id);
      return;
    }

    this.syncCertificateFieldsForm(this.certificateFieldValuesJson, selectedTemplateId);
  }

  async searchTargets(): Promise<void> {
    const scope = this.targetFiltersForm.controls.scope.value as IssuableScope;
    const query = this.targetFiltersForm.controls.query.value.trim() || undefined;
    const pagination = pageVariables(this.targetsPagination.pageIndex());

    if (scope === 'EVENT') {
      const items = await firstValueFrom(this.api.listCertificateIssuableEvents({ query, ...pagination }));
      this.issuableEvents.set(applyPagedResult(items, this.targetsPagination));
      this.issuableEventGroups.set([]);
      this.issuableMajorEvents.set([]);
      return;
    }

    if (scope === 'EVENT_GROUP') {
      const items = await firstValueFrom(this.api.listCertificateIssuableEventGroups({ query, ...pagination }));
      this.issuableEventGroups.set(applyPagedResult(items, this.targetsPagination));
      this.issuableEvents.set([]);
      this.issuableMajorEvents.set([]);
      return;
    }

    const items = await firstValueFrom(this.api.listCertificateIssuableMajorEvents({ query, ...pagination }));
    this.issuableMajorEvents.set(applyPagedResult(items, this.targetsPagination));
    this.issuableEvents.set([]);
    this.issuableEventGroups.set([]);
  }

  async applyTargetFilters(): Promise<void> {
    resetPagination(this.targetsPagination);
    await this.searchTargets();
  }

  async previousTargetsPage(): Promise<void> {
    this.targetsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.searchTargets();
  }

  async nextTargetsPage(): Promise<void> {
    if (!this.targetsPagination.hasNextPage()) {
      return;
    }
    this.targetsPagination.pageIndex.update((page) => page + 1);
    await this.searchTargets();
  }

  async onScopeChanged(scope: IssuableScope): Promise<void> {
    void this.router.navigate(['/certificates']);
    this.targetFiltersForm.controls.scope.setValue(scope);
    this.selectedTarget.set(null);
    this.selectedCertificateConfig.set(null);
    this.certificateConfigs.set([]);
    this.certificates.set([]);
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    resetPagination(this.targetsPagination);
    await this.searchTargets();
  }

  async selectTarget(target: IssuableTarget): Promise<void> {
    void this.router.navigate([
      '/certificates',
      this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as IssuableScope),
      target.id,
    ]);
    await this.applyTargetSelection(target);
  }

  async selectTargetByRoute(
    targetType: string | null,
    targetId: string | null,
    configId: string | null,
  ): Promise<void> {
    if (!targetType || !targetId) {
      this.clearSelection();
      return;
    }

    const scope = this.targetTypeToScope(targetType);
    if (!scope) {
      void this.router.navigate(['/certificates']);
      return;
    }

    this.targetFiltersForm.controls.scope.setValue(scope);
    await this.searchTargets();

    const target = await this.getTargetByRoute(scope, targetId);
    await this.applyTargetSelection(target);

    if (!configId) {
      return;
    }

    const config = this.certificateConfigs().find((candidate) => candidate.id === configId);
    if (config) {
      this.applyCertificateConfigSelection(config);
    }
  }

  private async applyTargetSelection(target: IssuableTarget): Promise<void> {
    this.selectedTarget.set({
      id: target.id,
      name: target.name,
    });
    this.personLookupForm.reset({ query: '' }, { emitEvent: false });
    this.personSearchResults.set([]);
    this.selectedCertificateConfig.set(null);
    this.resetCertificateConfigForm();
    resetPagination(this.certificateConfigsPagination);
    resetPagination(this.certificatesPagination);
    await Promise.all([this.loadCertificateConfigs(), this.loadCertificates()]);
  }

  selectCertificateConfig(config: CertificateConfig): void {
    const selectedTarget = this.selectedTarget();
    if (selectedTarget) {
      void this.router.navigate([
        '/certificates',
        this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as IssuableScope),
        selectedTarget.id,
        config.id,
      ]);
    }
    this.applyCertificateConfigSelection(config);
  }

  private applyCertificateConfigSelection(config: CertificateConfig): void {
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
      issuedTo: this.buildIssuedToOption(
        config.issuedTo,
        this.parseLecturerEventCategory(config.certificateFieldsJson),
      ),
      certificateFields: {},
    });
    this.syncCertificateFieldsForm(config.certificateFieldsJson, config.certificateTemplateId);
    resetPagination(this.certificatesPagination);
    void this.loadCertificates();
  }

  startNewCertificateConfig(): void {
    this.selectedCertificateConfig.set(null);
    const selectedTarget = this.selectedTarget();
    if (selectedTarget) {
      void this.router.navigate([
        '/certificates',
        this.scopeToTargetType(this.targetFiltersForm.controls.scope.value as IssuableScope),
        selectedTarget.id,
      ]);
    }
    this.personLookupForm.reset({ query: '' }, { emitEvent: false });
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    resetPagination(this.certificatesPagination);
    void this.loadCertificates();
  }

  clearSelection(): void {
    this.selectedTarget.set(null);
    this.selectedCertificateConfig.set(null);
    this.certificateConfigs.set([]);
    this.certificates.set([]);
    resetPagination(this.certificateConfigsPagination);
    resetPagination(this.certificatesPagination);
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
  }

  onCertificateTemplateChanged(templateId: string): void {
    this.certificateFieldValuesJson = null;
    this.certificateConfigForm.certificateTemplateId().value.set(templateId);
    this.syncCertificateFieldsForm(undefined, templateId);
  }

  async saveCertificateConfig(): Promise<void> {
    await this.persistCertificateConfig({ showSnackbar: true });
  }

  private async persistCertificateConfig(options?: { showSnackbar?: boolean }): Promise<CertificateConfig | null> {
    let savedConfig: CertificateConfig | null = null;

    const success = await submit(this.certificateConfigForm, async (field) => {
      const raw = field().value();
      const fieldErrors = this.validateCertificateFields(raw.certificateFields);
      if (fieldErrors.length > 0) {
        return fieldErrors;
      }

      const selectedTarget = this.selectedTarget();
      if (!selectedTarget) {
        this.snackbar.open('Selecione um evento, grupo ou grande evento primeiro.', 'Fechar', {
          duration: 2500,
        });
        return {
          kind: 'targetRequired',
          message: 'Selecione um evento, grupo ou grande evento primeiro.',
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

    this.personSearchResults.set(
      await firstValueFrom(
        this.peopleApi.listPeopleSummaries({
          query,
          take: 20,
        }),
      ),
    );
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível emitir o certificado.'), 'Fechar', {
        duration: 5000,
      });
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível emitir os certificados.'), 'Fechar', {
        duration: 5000,
      });
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir a configuração de certificado.'), 'Fechar', {
        duration: 5000,
      });
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
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir o certificado.'), 'Fechar', {
        duration: 5000,
      });
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

    const configs = await firstValueFrom(
      this.api.listCertificateConfigs(this.targetFiltersForm.controls.scope.value as IssuableScope, selectedTarget.id, {
        includeInactive: true,
        ...pageVariables(this.certificateConfigsPagination.pageIndex()),
      }),
    );
    this.certificateConfigs.set(applyPagedResult(configs, this.certificateConfigsPagination));

    const selectedConfig = this.selectedCertificateConfig();
    if (!selectedConfig) {
      return;
    }

    const refreshedSelection = configs.find((config) => config.id === selectedConfig.id);
    if (!refreshedSelection) {
      this.selectedCertificateConfig.set(null);
      this.resetCertificateConfigForm();
      return;
    }

    this.selectCertificateConfig(refreshedSelection);
  }

  async previousCertificateConfigsPage(): Promise<void> {
    this.certificateConfigsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadCertificateConfigs();
  }

  async nextCertificateConfigsPage(): Promise<void> {
    if (!this.certificateConfigsPagination.hasNextPage()) {
      return;
    }
    this.certificateConfigsPagination.pageIndex.update((page) => page + 1);
    await this.loadCertificateConfigs();
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

  private async loadCertificates(): Promise<void> {
    const selectedTarget = this.selectedTarget();
    if (!selectedTarget) {
      this.certificates.set([]);
      return;
    }

    this.certificates.set(
      applyPagedResult(
        await firstValueFrom(
        this.api.listCertificates(this.targetFiltersForm.controls.scope.value as IssuableScope, selectedTarget.id, {
          configId: this.selectedCertificateConfig()?.id,
          ...pageVariables(this.certificatesPagination.pageIndex()),
        }),
      ),
        this.certificatesPagination,
      ),
    );
  }

  async previousCertificatesPage(): Promise<void> {
    this.certificatesPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadCertificates();
  }

  async nextCertificatesPage(): Promise<void> {
    if (!this.certificatesPagination.hasNextPage()) {
      return;
    }
    this.certificatesPagination.pageIndex.update((page) => page + 1);
    await this.loadCertificates();
  }

  private buildCertificateConfigPayload(targetId: string, raw = this.certificateConfigModel()): CertificateConfigInput {
    const scope = this.targetFiltersForm.controls.scope.value as IssuableScope;

    return {
      name: raw.name.trim(),
      scope,
      majorEventId: scope === 'MAJOR_EVENT' ? targetId : null,
      eventGroupId: scope === 'EVENT_GROUP' ? targetId : null,
      eventId: scope === 'EVENT' ? targetId : null,
      certificateTemplateId: raw.certificateTemplateId.trim(),
      certificateText: raw.certificateText.trim() || null,
      shouldAutofillSecondPage: raw.shouldAutofillSecondPage,
      secondPageText: raw.shouldAutofillSecondPage ? null : raw.secondPageText.trim() || null,
      isActive: raw.isActive,
      issuedTo: this.normalizeIssuedTo(raw.issuedTo),
      certificateFieldsJson: this.buildCertificateFieldsJson(
        raw.certificateFields,
        this.parseIssuedToLecturerEventCategory(raw.issuedTo),
      ),
    };
  }

  private async getTargetByRoute(scope: IssuableScope, targetId: string): Promise<IssuableTarget> {
    if (scope === 'EVENT') {
      return firstValueFrom(this.eventsApi.getEvent(targetId));
    }

    if (scope === 'EVENT_GROUP') {
      return firstValueFrom(this.eventGroupsApi.getEventGroup(targetId));
    }

    return firstValueFrom(this.majorEventsApi.getMajorEvent(targetId));
  }

  private targetTypeToScope(targetType: string): IssuableScope | null {
    if (targetType === 'event') {
      return 'EVENT';
    }

    if (targetType === 'event-group') {
      return 'EVENT_GROUP';
    }

    if (targetType === 'major-event') {
      return 'MAJOR_EVENT';
    }

    return null;
  }

  private scopeToTargetType(scope: IssuableScope): CertificateTargetType {
    if (scope === 'EVENT') {
      return 'event';
    }

    if (scope === 'EVENT_GROUP') {
      return 'event-group';
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

      if (value) {
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
    return {
      id: '',
      name: '',
      certificateTemplateId: '',
      certificateText: '',
      shouldAutofillSecondPage: true,
      secondPageText: '',
      isActive: true,
      issuedTo: 'ATTENDEE',
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
