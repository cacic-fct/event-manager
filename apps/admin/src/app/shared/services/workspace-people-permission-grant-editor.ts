import {
  EVENT_MANAGER_PERMISSION_PRESETS,
  EventManagerPermissionGrantScope,
  Permission,
  parsePermission,
} from '@cacic-fct/shared-permissions';
import type { PermissionIncludedData } from '@cacic-fct/shared-permissions';
import { Validators } from '@angular/forms';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantInput,
  EventManagerPermissionGrantTarget,
} from '@cacic-fct/event-manager-admin-contracts';
import {
  PermissionGrantDraft,
  buildPermissionGrantDraft as buildGrantDraft,
  buildPermissionGrantInput,
  findPermissionGrantBatchConflict,
  formatDateTimeInput,
  formatPermissionIncludedDataFields as formatPermissionIncludedDataFieldsLabel,
  getPermissionGrantDraftTargetLabel as getDraftTargetLabel,
  getPermissionGrantIcon as getGrantIcon,
  getPermissionGrantIncludedData as getGrantIncludedData,
  getPermissionGrantInputTargetLabel as getGrantInputTargetLabel,
  getPermissionGrantLabel as getGrantLabel,
  getPermissionGrantPresetDescription as getPresetDescription,
  getPermissionGrantScopeLabel as getGrantScopeLabel,
  getPermissionGrantSelectionLabel as getGrantSelectionLabel,
  getPermissionGrantStatusLabel as getGrantStatusLabel,
  getPermissionGrantTargetDateLabel,
  getPermissionGrantTargetLabel as getGrantTargetLabel,
  getPermissionGrantValidityWindowLabel,
  getPresetPreferredScope,
  getPresetScope as getPermissionPresetScope,
  hasSamePermissionGrantValidity,
  isSamePermissionGrantTarget,
  normalizePermissionGrantValidity as normalizeGrantValidity,
} from './workspace-people-permission-grants';
import { WorkspacePeopleRecords } from './workspace-people-records';

export abstract class WorkspacePeoplePermissionGrantEditor extends WorkspacePeopleRecords {
  setPermissionGrantScope(scope: EventManagerPermissionGrantScope): void {
    this.permissionGrantForm.controls.scope.setValue(scope);
  }

  setPermissionGrantTargetSearch(query: string): void {
    this.permissionGrantTargetSearch.set(query);
    if (this.permissionGrantForm.controls.targetSearch.value !== query) {
      this.permissionGrantForm.controls.targetSearch.setValue(query, { emitEvent: false });
    }
  }

  selectPermissionGrantTarget(targetId: string): void {
    this.permissionGrantForm.controls.targetId.setValue(targetId);
  }

  isPermissionGrantTargetSelected(targetId: string): boolean {
    return this.permissionGrantForm.controls.targetId.value === targetId;
  }

  startEditingPermissionGrant(grant: EventManagerPermissionGrant): void {
    const parsed = parsePermission(grant.permission);
    this.initializingPermissionGrantForm = true;
    try {
      this.editingPermissionGrant.set(grant);
      this.permissionGrantCategory.set(parsed.resource);
      this.permissionGrantSelectedPermissions.set([grant.permission as Permission]);
      this.permissionGrantForm.reset({
        presetId: '',
        category: parsed.resource,
        permissions: [grant.permission as Permission],
        permission: grant.permission as Permission,
        scope: grant.scope,
        targetId: grant.eventId ?? grant.majorEventId ?? grant.eventGroupId ?? '',
        targetSearch: '',
        validFrom: formatDateTimeInput(grant.validFrom),
        validUntil: formatDateTimeInput(grant.validUntil),
      });
    } finally {
      this.initializingPermissionGrantForm = false;
    }
    this.permissionGrantTargetSearch.set('');
    this.applyPermissionGrantScopeRestrictions();
  }

  cancelEditingPermissionGrant(): void {
    this.resetPermissionGrantForm({ clearDrafts: false });
  }

  async submitPermissionGrantForm(): Promise<void> {
    if (this.editingPermissionGrant()) {
      await this.updatePermissionGrant();
      return;
    }

    await this.savePermissionGrantDrafts();
  }

  addSelectedPermissionGrantsToReview(): void {
    const selectedPerson = this.selectedPerson();
    const userId = this.getPersonUserId(selectedPerson);
    if (!selectedPerson || !userId) {
      return;
    }

    if (this.permissionGrantForm.invalid) {
      this.permissionGrantForm.markAllAsTouched();
      return;
    }

    const raw = this.permissionGrantForm.getRawValue();
    const targetId = raw.targetId.trim();
    if (raw.scope !== EventManagerPermissionGrantScope.Global && !targetId) {
      this.permissionGrantForm.controls.targetId.markAsTouched();
      this.snackbar.open('Selecione o alvo do escopo.', 'Fechar', { duration: 3000 });
      return;
    }

    const validity = this.normalizePermissionGrantValidity(raw.validFrom, raw.validUntil);
    if (!validity) {
      return;
    }

    const permissions = [...new Set(raw.permissions)];
    if (permissions.length === 0) {
      this.snackbar.open('Selecione ao menos uma permissão.', 'Fechar', { duration: 3000 });
      return;
    }

    this.stagePermissionGrantInputs(
      permissions.map((permission) =>
        buildPermissionGrantInput(selectedPerson.id, userId, permission, raw.scope, targetId, validity),
      ),
      'Seleção manual',
    );
  }

  removePermissionGrantDraft(draftId: string): void {
    this.permissionGrantDrafts.update((drafts) => drafts.filter((draft) => draft.id !== draftId));
  }

  clearPermissionGrantDrafts(): void {
    this.permissionGrantDrafts.set([]);
  }

  applySelectedPermissionPreset(): void {
    const selectedPerson = this.selectedPerson();
    const userId = this.getPersonUserId(selectedPerson);
    const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === this.permissionGrantForm.controls.presetId.value);
    if (!selectedPerson || !userId || !preset) {
      return;
    }

    const scope = getPermissionPresetScope(preset.id, this.permissionGrantForm.controls.scope.value);
    if (this.permissionGrantForm.controls.scope.value !== scope) {
      this.permissionGrantForm.controls.scope.setValue(scope);
      this.snackbar.open('Selecione o alvo do escopo do preset antes de aplicar.', 'Fechar', { duration: 3000 });
      return;
    }

    const targetId = this.permissionGrantForm.controls.targetId.value.trim();
    if (scope !== EventManagerPermissionGrantScope.Global && !targetId) {
      this.permissionGrantForm.controls.targetId.markAsTouched();
      this.snackbar.open('Selecione o alvo do escopo antes de aplicar o preset.', 'Fechar', { duration: 3000 });
      return;
    }

    const raw = this.permissionGrantForm.getRawValue();
    const validity = this.normalizePermissionGrantValidity(raw.validFrom, raw.validUntil);
    if (!validity) {
      return;
    }

    this.stagePermissionGrantInputs(
      preset.permissions.map((permission) =>
        buildPermissionGrantInput(selectedPerson.id, userId, permission, scope, targetId, validity),
      ),
      `Preset: ${preset.label}`,
    );
  }

  getPermissionGrantLabel(permission: string): string {
    return getGrantLabel(permission);
  }

  getPermissionGrantIcon(permission: string): string {
    return getGrantIcon(permission);
  }

  getPermissionGrantIncludedData(permission: string): readonly PermissionIncludedData[] {
    return getGrantIncludedData(permission);
  }

  formatPermissionIncludedDataFields(item: PermissionIncludedData): string {
    return formatPermissionIncludedDataFieldsLabel(item);
  }

  getPermissionGrantSelectionLabel(permissions: readonly Permission[]): string {
    return getGrantSelectionLabel(permissions);
  }

  getPermissionGrantScopeLabel(scope: EventManagerPermissionGrantScope): string {
    return getGrantScopeLabel(scope);
  }

  getPermissionGrantTargetLabel(grant: EventManagerPermissionGrant): string {
    return getGrantTargetLabel(grant);
  }

  getPermissionGrantValidityLabel(grant: EventManagerPermissionGrant): string {
    return getPermissionGrantValidityWindowLabel(grant);
  }

  getPermissionGrantDraftTargetLabel(draft: PermissionGrantDraft): string {
    return getDraftTargetLabel(draft);
  }

  getPermissionGrantDraftValidityLabel(draft: PermissionGrantDraft): string {
    return getPermissionGrantValidityWindowLabel(draft);
  }

  getPermissionGrantDraftScopeLabel(draft: PermissionGrantDraft): string {
    return this.getPermissionGrantScopeLabel(draft.scope);
  }

  getPermissionGrantStatusLabel(grant: EventManagerPermissionGrant): string {
    return getGrantStatusLabel(grant);
  }

  getPermissionGrantPresetDescription(presetId: string): string {
    return getPresetDescription(presetId);
  }

  getPermissionGrantTargetMetadataLabel(target: EventManagerPermissionGrantTarget): string {
    return [getPermissionGrantTargetDateLabel(target, this.permissionGrantScope(), this.locale), target.description?.trim()]
      .filter(Boolean)
      .join(' · ');
  }

  protected applyPermissionGrantScope(scope: EventManagerPermissionGrantScope): void {
    const effectiveScope = this.getEffectivePermissionGrantScope(scope);
    if (effectiveScope !== scope) {
      this.permissionGrantForm.controls.scope.setValue(effectiveScope);
      return;
    }

    const scopeChanged = this.permissionGrantScope() !== scope;
    this.permissionGrantScope.set(scope);
    const targetControl = this.permissionGrantForm.controls.targetId;
    if (scopeChanged && !this.initializingPermissionGrantForm) {
      targetControl.reset('', { emitEvent: false });
      this.permissionGrantForm.controls.targetSearch.reset('', { emitEvent: false });
      this.permissionGrantTargetSearch.set('');
    }

    if (scope === EventManagerPermissionGrantScope.Global) {
      targetControl.clearValidators();
    } else {
      targetControl.setValidators([Validators.required]);
    }

    targetControl.updateValueAndValidity({ emitEvent: false });
  }

  protected applyPermissionGrantCategory(resource: string): void {
    this.permissionGrantCategory.set(resource);
    const group = this.permissionGrantGroups.find((item) => item.resource === resource);
    const firstPermission = group?.options[0]?.permission ?? Permission.Event.Read;
    if (this.editingPermissionGrant()) {
      if (this.initializingPermissionGrantForm) {
        this.applyPermissionGrantScopeRestrictions();
        return;
      }

      this.permissionGrantForm.controls.permission.setValue(firstPermission, { emitEvent: false });
      this.permissionGrantSelectedPermissions.set([firstPermission]);
    } else {
      this.permissionGrantForm.controls.permissions.setValue([firstPermission], { emitEvent: false });
      this.permissionGrantSelectedPermissions.set([firstPermission]);
    }
    this.applyPermissionGrantScopeRestrictions();
  }

  protected applyPermissionGrantScopeRestrictions(): void {
    const scope = this.getEffectivePermissionGrantScope(this.permissionGrantForm.controls.scope.value);
    if (this.permissionGrantForm.controls.scope.value !== scope) {
      this.permissionGrantForm.controls.scope.setValue(scope);
      return;
    }

    this.applyPermissionGrantScope(scope);
  }

  protected applyPermissionGrantPresetSelection(presetId: string): void {
    const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetId);
    if (!preset || this.editingPermissionGrant()) {
      return;
    }

    const scope = getPresetPreferredScope(preset.id, this.permissionGrantForm.controls.scope.value);
    this.permissionGrantForm.controls.scope.setValue(scope);
  }

  private getEffectivePermissionGrantScope(scope: EventManagerPermissionGrantScope): EventManagerPermissionGrantScope {
    if (this.permissionGrantRequiresGlobalScope()) {
      return EventManagerPermissionGrantScope.Global;
    }

    return getPermissionPresetScope(this.permissionGrantForm.controls.presetId.value, scope);
  }

  protected resetPermissionGrantForm(options: { clearDrafts?: boolean } = {}): void {
    if (options.clearDrafts ?? true) {
      this.permissionGrantDrafts.set([]);
    }

    this.editingPermissionGrant.set(null);
    this.permissionGrantCategory.set(parsePermission(Permission.Event.Read).resource);
    this.permissionGrantSelectedPermissions.set([Permission.Event.Read]);
    this.permissionGrantPresetId.set('');
    this.permissionGrantTargetSearch.set('');
    this.permissionGrantForm.reset({
      presetId: '',
      category: parsePermission(Permission.Event.Read).resource,
      permissions: [Permission.Event.Read],
      permission: Permission.Event.Read,
      scope: EventManagerPermissionGrantScope.Global,
      targetId: '',
      targetSearch: '',
      validFrom: '',
      validUntil: '',
    });
    this.applyPermissionGrantScope(EventManagerPermissionGrantScope.Global);
  }

  protected normalizePermissionGrantValidity(
    validFromValue: string,
    validUntilValue: string,
  ): Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'> | null {
    const result = normalizeGrantValidity(validFromValue, validUntilValue);
    if (!result.valid) {
      this.snackbar.open(result.message, 'Fechar', { duration: 4000 });
      return null;
    }

    return result.value;
  }

  private stagePermissionGrantInputs(inputs: EventManagerPermissionGrantInput[], sourceLabel: string): void {
    if (inputs.length === 0) {
      return;
    }

    const conflictingGrant = findPermissionGrantBatchConflict(inputs, this.permissionGrants());
    if (conflictingGrant) {
      this.snackbar.open(
        `A permissão ${this.getPermissionGrantLabel(conflictingGrant.permission)} já existe nesse escopo com outra validade. Edite ou remova a concessão atual antes de aplicar.`,
        'Fechar',
        { duration: 6000 },
      );
      return;
    }

    let added = 0;
    let updated = 0;
    const drafts = [...this.permissionGrantDrafts()];

    for (const input of inputs) {
      const draft = buildGrantDraft(input, sourceLabel, getGrantInputTargetLabel(input, {
        events: this.eventPermissionGrantTargets(),
        majorEvents: this.majorEventPermissionGrantTargets(),
        eventGroups: this.eventGroupPermissionGrantTargets(),
      }));
      const existingIndex = drafts.findIndex((item) => isSamePermissionGrantTarget(item, input));
      if (existingIndex === -1) {
        drafts.push(draft);
        added += 1;
        continue;
      }

      if (hasSamePermissionGrantValidity(drafts[existingIndex], input)) {
        continue;
      }

      drafts[existingIndex] = draft;
      updated += 1;
    }

    this.permissionGrantDrafts.set(drafts);

    if (added === 0 && updated === 0) {
      this.snackbar.open('Essas permissões já estão na revisão.', 'Fechar', { duration: 3000 });
      return;
    }

    this.snackbar.open(
      updated > 0 ? 'Revisão de permissões atualizada.' : 'Permissões adicionadas à revisão.',
      'Fechar',
      { duration: 2500 },
    );
  }

  abstract savePermissionGrantDrafts(): Promise<void>;

  abstract updatePermissionGrant(): Promise<void>;
}
