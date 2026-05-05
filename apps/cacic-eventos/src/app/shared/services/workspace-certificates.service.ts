import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { form, required, submit, type FieldTree } from '@angular/forms/signals';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
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

type IssuableScope = Exclude<CertificateScope, 'OTHER'>;
type IssuableTarget = Event | EventGroup | MajorEvent;
type CertificateConfigFormModel = {
  id: string;
  name: string;
  certificateTemplateId: string;
  certificateText: string;
  isActive: boolean;
  issuedTo: CertificateIssuedTo;
  certificateFields: Record<string, string>;
};
type CertificateFieldDefinition = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
  defaultValue: string;
};

@Injectable({
  providedIn: 'root',
})
export class WorkspaceCertificatesService {
  private readonly api = inject(CertificateApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  readonly issuableEvents = signal<Event[]>([]);
  readonly issuableEventGroups = signal<EventGroup[]>([]);
  readonly issuableMajorEvents = signal<MajorEvent[]>([]);
  readonly selectedTarget = signal<{ id: string; name: string } | null>(null);
  readonly certificateTemplates = signal<CertificateTemplate[]>([]);
  readonly certificateConfigs = signal<CertificateConfig[]>([]);
  readonly selectedCertificateConfig = signal<CertificateConfig | null>(null);
  readonly certificates = signal<Certificate[]>([]);
  readonly personSearchResults = signal<Person[]>([]);
  readonly certificateFieldDefinitions = signal<CertificateFieldDefinition[]>(
    [],
  );
  private certificateFieldValuesJson: string | null | undefined;

  private selectedCertificateTemplate(
    templateId = this.certificateConfigModel().certificateTemplateId,
  ): CertificateTemplate | null {
    return (
      this.certificateTemplates().find(
        (template) => template.id === templateId,
      ) ?? null
    );
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
    const selectedTemplateId =
      this.certificateConfigModel().certificateTemplateId;
    if (!selectedTemplateId && this.certificateTemplates().length > 0) {
      this.certificateConfigForm().reset({
        ...this.certificateConfigModel(),
        certificateTemplateId: this.certificateTemplates()[0].id,
      });
      this.syncCertificateFieldsForm(
        this.certificateFieldValuesJson,
        this.certificateTemplates()[0].id,
      );
      return;
    }

    this.syncCertificateFieldsForm(
      this.certificateFieldValuesJson,
      selectedTemplateId,
    );
  }

  async searchTargets(): Promise<void> {
    const scope = this.targetFiltersForm.controls.scope.value as IssuableScope;
    const query =
      this.targetFiltersForm.controls.query.value.trim() || undefined;

    if (scope === 'EVENT') {
      this.issuableEvents.set(
        await firstValueFrom(
          this.api.listCertificateIssuableEvents({ query, take: 200 }),
        ),
      );
      this.issuableEventGroups.set([]);
      this.issuableMajorEvents.set([]);
      return;
    }

    if (scope === 'EVENT_GROUP') {
      this.issuableEventGroups.set(
        await firstValueFrom(
          this.api.listCertificateIssuableEventGroups({ query, take: 200 }),
        ),
      );
      this.issuableEvents.set([]);
      this.issuableMajorEvents.set([]);
      return;
    }

    this.issuableMajorEvents.set(
      await firstValueFrom(
        this.api.listCertificateIssuableMajorEvents({ query, take: 200 }),
      ),
    );
    this.issuableEvents.set([]);
    this.issuableEventGroups.set([]);
  }

  async onScopeChanged(scope: IssuableScope): Promise<void> {
    this.targetFiltersForm.controls.scope.setValue(scope);
    this.selectedTarget.set(null);
    this.selectedCertificateConfig.set(null);
    this.certificateConfigs.set([]);
    this.certificates.set([]);
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    await this.searchTargets();
  }

  async selectTarget(target: IssuableTarget): Promise<void> {
    this.selectedTarget.set({
      id: target.id,
      name: target.name,
    });
    this.personLookupForm.reset({ query: '' });
    this.personSearchResults.set([]);
    this.selectedCertificateConfig.set(null);
    this.resetCertificateConfigForm();
    await Promise.all([this.loadCertificateConfigs(), this.loadCertificates()]);
  }

  selectCertificateConfig(config: CertificateConfig): void {
    this.selectedCertificateConfig.set(config);
    this.certificateFieldValuesJson = config.certificateFieldsJson;
    this.certificateConfigForm().reset({
      id: config.id,
      name: config.name,
      certificateTemplateId: config.certificateTemplateId,
      certificateText: config.certificateText ?? '',
      isActive: config.isActive,
      issuedTo: config.issuedTo,
      certificateFields: {},
    });
    this.syncCertificateFieldsForm(
      config.certificateFieldsJson,
      config.certificateTemplateId,
    );
    void this.loadCertificates();
  }

  startNewCertificateConfig(): void {
    this.selectedCertificateConfig.set(null);
    this.personLookupForm.reset({ query: '' });
    this.personSearchResults.set([]);
    this.resetCertificateConfigForm();
    void this.loadCertificates();
  }

  onCertificateTemplateChanged(templateId: string): void {
    this.certificateFieldValuesJson = null;
    this.certificateConfigForm.certificateTemplateId().value.set(templateId);
    this.syncCertificateFieldsForm(undefined, templateId);
  }

  async saveCertificateConfig(): Promise<void> {
    await this.persistCertificateConfig({ showSnackbar: true });
  }

  private async persistCertificateConfig(options?: {
    showSnackbar?: boolean;
  }): Promise<CertificateConfig | null> {
    let savedConfig: CertificateConfig | null = null;

    const success = await submit(this.certificateConfigForm, async (field) => {
      const raw = field().value();
      const fieldErrors = this.validateCertificateFields(raw.certificateFields);
      if (fieldErrors.length > 0) {
        return fieldErrors;
      }

      const selectedTarget = this.selectedTarget();
      if (!selectedTarget) {
        this.snackbar.open(
          'Selecione um evento, grupo ou grande evento primeiro.',
          'Fechar',
          {
            duration: 2500,
          },
        );
        return {
          kind: 'targetRequired',
          message: 'Selecione um evento, grupo ou grande evento primeiro.',
        };
      }

      const payload = this.buildCertificateConfigPayload(
        selectedTarget.id,
        raw,
      );
      const configId = raw.id;
      this.certificateFieldValuesJson = payload.certificateFieldsJson;

      savedConfig = configId
        ? await firstValueFrom(
            this.api.updateCertificateConfig(configId, payload),
          )
        : await firstValueFrom(this.api.createCertificateConfig(payload));

      if (options?.showSnackbar ?? true) {
        this.snackbar.open(
          configId
            ? 'Configuração de certificado atualizada.'
            : 'Configuração de certificado criada.',
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
        this.peopleApi.listPeople({
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

    await firstValueFrom(
      this.api.issueCertificateForPerson(selectedConfig.id, person.id),
    );
    this.snackbar.open(`Certificado emitido para ${person.name}.`, 'Fechar', {
      duration: 2500,
    });
    await this.loadCertificates();
  }

  async issueMissedCertificates(): Promise<void> {
    const selectedConfig = await this.persistCertificateConfig({
      showSnackbar: false,
    });
    if (!selectedConfig) {
      return;
    }

    const issued = await firstValueFrom(
      this.api.issueMissedCertificates(selectedConfig.id),
    );
    this.snackbar.open(
      `${issued.length} certificado(s) processado(s).`,
      'Fechar',
      {
        duration: 2500,
      },
    );
    await this.loadCertificates();
  }

  async downloadCertificate(
    certificate: Certificate,
    event?: MouseEvent,
  ): Promise<void> {
    event?.stopPropagation();

    const payload = await firstValueFrom(
      this.api.downloadCertificate(certificate.id),
    );
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
      this.api.listCertificateConfigs(
        this.targetFiltersForm.controls.scope.value as IssuableScope,
        selectedTarget.id,
        {
          includeInactive: true,
          take: 200,
        },
      ),
    );
    this.certificateConfigs.set(configs);

    const selectedConfig = this.selectedCertificateConfig();
    if (!selectedConfig) {
      return;
    }

    const refreshedSelection = configs.find(
      (config) => config.id === selectedConfig.id,
    );
    if (!refreshedSelection) {
      this.selectedCertificateConfig.set(null);
      this.resetCertificateConfigForm();
      return;
    }

    this.selectCertificateConfig(refreshedSelection);
  }

  private async loadCertificates(): Promise<void> {
    const selectedTarget = this.selectedTarget();
    if (!selectedTarget) {
      this.certificates.set([]);
      return;
    }

    this.certificates.set(
      await firstValueFrom(
        this.api.listCertificates(
          this.targetFiltersForm.controls.scope.value as IssuableScope,
          selectedTarget.id,
          {
            configId: this.selectedCertificateConfig()?.id,
            take: 200,
          },
        ),
      ),
    );
  }

  private buildCertificateConfigPayload(
    targetId: string,
    raw = this.certificateConfigModel(),
  ): CertificateConfigInput {
    const scope = this.targetFiltersForm.controls.scope.value as IssuableScope;

    return {
      name: raw.name.trim(),
      scope,
      majorEventId: scope === 'MAJOR_EVENT' ? targetId : null,
      eventGroupId: scope === 'EVENT_GROUP' ? targetId : null,
      eventId: scope === 'EVENT' ? targetId : null,
      certificateTemplateId: raw.certificateTemplateId.trim(),
      certificateText: raw.certificateText.trim() || null,
      isActive: raw.isActive,
      issuedTo: raw.issuedTo,
      certificateFieldsJson: this.buildCertificateFieldsJson(
        raw.certificateFields,
      ),
    };
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
    const definitions = this.parseCertificateFieldDefinitions(
      this.selectedCertificateTemplate(templateId),
    );
    const existingFields = this.parseCertificateFields(existingFieldsJson);
    const certificateFields: Record<string, string> = {};
    this.certificateFieldDefinitions.set(definitions);

    for (const definition of definitions) {
      certificateFields[definition.key] =
        existingFields[definition.key] ?? definition.defaultValue;
    }

    this.certificateConfigForm.certificateFields().reset(certificateFields);
  }

  certificateField(key: string): FieldTree<string> {
    return this.certificateConfigForm.certificateFields[key];
  }

  private buildCertificateFieldsJson(
    values = this.certificateConfigModel().certificateFields,
  ): string | null {
    const certificateFields: Record<string, string> = {};

    for (const definition of this.certificateFieldDefinitions()) {
      const value = this.normalizeCertificateFieldValue(values[definition.key]);
      const defaultValue = definition.defaultValue.trim();

      if (value && value !== defaultValue) {
        certificateFields[definition.key] = value;
      }
    }

    return Object.keys(certificateFields).length > 0
      ? JSON.stringify(certificateFields)
      : null;
  }

  private validateCertificateFields(
    values: Record<string, string>,
  ): Array<{ kind: string; message: string; fieldTree: FieldTree<unknown> }> {
    return this.certificateFieldDefinitions()
      .filter(
        (definition) =>
          definition.required &&
          !this.normalizeCertificateFieldValue(values[definition.key]),
      )
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
      isActive: true,
      issuedTo: 'ATTENDEE',
      certificateFields: {},
    };
  }

  private parseCertificateFields(
    rawValue?: string | null,
  ): Record<string, string> {
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
            const [, value] = entry;
            return (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            );
          })
          .map(([key, value]) => [
            key,
            this.normalizeCertificateFieldValue(value),
          ]),
      );
    } catch {
      return {};
    }
  }

  private parseCertificateFieldDefinitions(
    template: CertificateTemplate | null,
  ): CertificateFieldDefinition[] {
    if (!template?.certificateFieldsJson) {
      return [];
    }

    try {
      const parsed = JSON.parse(template.certificateFieldsJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
      }

      return Object.entries(parsed)
        .map(([key, rawDefinition]) =>
          this.parseCertificateFieldDefinition(key, rawDefinition),
        )
        .filter((definition): definition is CertificateFieldDefinition =>
          Boolean(definition),
        );
    } catch {
      return [];
    }
  }

  private parseCertificateFieldDefinition(
    key: string,
    rawDefinition: unknown,
  ): CertificateFieldDefinition | null {
    if (
      !rawDefinition ||
      typeof rawDefinition !== 'object' ||
      Array.isArray(rawDefinition)
    ) {
      return null;
    }

    const definition = rawDefinition as Record<string, unknown>;
    const type = definition['type'];
    if (type !== 'string' && type !== 'number' && type !== 'date') {
      return null;
    }

    return {
      key,
      label:
        typeof definition['label'] === 'string' ? definition['label'] : key,
      type,
      required: definition['required'] === true,
      defaultValue: this.normalizeCertificateFieldValue(definition['default']),
    };
  }

  private normalizeCertificateFieldValue(rawValue: unknown): string {
    if (
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean'
    ) {
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
