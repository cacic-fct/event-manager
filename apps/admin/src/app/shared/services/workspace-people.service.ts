import {
  EVENT_MANAGER_PERMISSION_CATALOG,
  EVENT_MANAGER_PERMISSION_PRESETS,
  EventManagerPermissionGrantScope,
  Permission,
  requiresGlobalPermissionGrantScope,
  formatPermissionGroups,
  getPermissionIncludedData,
  getPermissionIncludedDataSummary,
  getPermissionResourceIcon,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
  parsePermission,
} from '@cacic-fct/shared-permissions';
import type { PermissionIncludedData } from '@cacic-fct/shared-permissions';
import { formatDate } from '@angular/common';
import { DestroyRef, LOCALE_ID, computed, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionGrantsApiService } from '../../graphql/permission-grants-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
  LecturerProfileInput,
  Person,
  PersonInput,
} from '../../graphql/models';
import { getErrorMessage } from '../error-message';

type PermissionGrantOption = {
  permission: Permission;
  label: string;
  icon: string;
  includedData: readonly PermissionIncludedData[];
  includedDataSummary: string;
};

type PermissionGrantGroup = {
  resource: string;
  label: string;
  icon: string;
  options: PermissionGrantOption[];
};

type PermissionGrantPresetOption = {
  id: string;
  label: string;
  description: string;
  icon: string;
};

type PermissionGrantPresetPreviewGroup = {
  resource: string;
  label: string;
  icon: string;
  permissionLabels: string;
  permissionCount: number;
  includedData: readonly PermissionIncludedData[];
};

type PermissionGrantScopeOption = {
  scope: EventManagerPermissionGrantScope;
  label: string;
  icon: string;
};

type PermissionGrantDraft = EventManagerPermissionGrantInput & {
  id: string;
  sourceLabel: string;
  targetLabel: string | null;
};

@Injectable({
  providedIn: 'root',
})
export class WorkspacePeopleService {
  private readonly api = inject(PeopleApiService);
  private readonly permissionGrantsApi = inject(PermissionGrantsApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);
  private permissionGrantTargetsLoaded = false;
  private permissionGrantTargetsLoading: Promise<void> | null = null;

  readonly people = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly isCreatingPerson = signal(false);
  readonly peopleSearchQuery = signal('');
  readonly permissionGrants = signal<EventManagerPermissionGrant[]>([]);
  readonly editingPermissionGrant = signal<EventManagerPermissionGrant | null>(null);
  readonly permissionGrantCategory = signal(parsePermission(Permission.Event.Read).resource);
  readonly permissionGrantSelectedPermissions = signal<Permission[]>([Permission.Event.Read]);
  readonly permissionGrantPresetId = signal('');
  readonly permissionGrantScope = signal<EventManagerPermissionGrantScope>(EventManagerPermissionGrantScope.Global);
  readonly permissionGrantTargetSearch = signal('');
  readonly permissionGrantDrafts = signal<PermissionGrantDraft[]>([]);
  readonly eventPermissionGrantTargets = signal<EventManagerPermissionGrantTarget[]>([]);
  readonly majorEventPermissionGrantTargets = signal<EventManagerPermissionGrantTarget[]>([]);
  readonly eventGroupPermissionGrantTargets = signal<EventManagerPermissionGrantTarget[]>([]);
  readonly hasExternallyManagedProfile = computed(() => {
    const person = this.selectedPerson();
    return Boolean(person?.userId || person?.user);
  });
  readonly hasLecturerProfile = computed(() => Boolean(this.selectedPerson()?.lecturerProfile));
  readonly permissionGrantTargetOptions = computed(() => {
    switch (this.permissionGrantScope()) {
      case EventManagerPermissionGrantScope.Event:
        return this.eventPermissionGrantTargets();
      case EventManagerPermissionGrantScope.MajorEvent:
        return this.majorEventPermissionGrantTargets();
      case EventManagerPermissionGrantScope.EventGroup:
        return this.eventGroupPermissionGrantTargets();
      default:
        return [];
    }
  });
  readonly permissionGrantTargetRequired = computed(
    () => this.permissionGrantScope() !== EventManagerPermissionGrantScope.Global,
  );
  readonly filteredPermissionGrantTargetOptions = computed(() => {
    const query = this.normalizeSearchText(this.permissionGrantTargetSearch());
    const options = this.permissionGrantTargetOptions() ?? [];
    if (!query) {
      return options.slice(0, 40);
    }

    return options
      .filter((target) =>
        this.normalizeSearchText(`${target.label} ${target.description ?? ''}`).includes(query),
      )
      .slice(0, 40);
  });
  readonly permissionGrantTargetLabel = computed(() => {
    switch (this.permissionGrantScope()) {
      case EventManagerPermissionGrantScope.Event:
        return 'Evento';
      case EventManagerPermissionGrantScope.MajorEvent:
        return 'Grande evento';
      case EventManagerPermissionGrantScope.EventGroup:
        return 'Grupo de eventos';
      default:
        return 'Alvo';
    }
  });
  readonly permissionGrantTargetSearchLabel = computed(() => `Buscar ${this.permissionGrantTargetLabel().toLocaleLowerCase('pt-BR')}`);

  readonly permissionGrantGroups: PermissionGrantGroup[] = formatPermissionGroups(EVENT_MANAGER_PERMISSION_CATALOG).map(
    (group) => ({
      resource: group.type,
      label: group.label,
      icon: group.resourceIcon,
      options: group.actions.map((action) => ({
        permission: `${group.type}#${action.scope}` as Permission,
        label: action.label,
        icon: action.icon,
        includedData: getPermissionIncludedData(`${group.type}#${action.scope}` as Permission),
        includedDataSummary: getPermissionIncludedDataSummary(`${group.type}#${action.scope}` as Permission),
      })),
    }),
  );
  readonly selectedPermissionGrantGroup = computed(
    () => this.permissionGrantGroups.find((group) => group.resource === this.permissionGrantCategory()) ?? this.permissionGrantGroups[0],
  );
  readonly selectedPermissionGrantOptions = computed(() => this.selectedPermissionGrantGroup()?.options ?? []);
  readonly permissionGrantRequiresGlobalScope = computed(() =>
    this.permissionGrantSelectedPermissions().some((permission) => requiresGlobalPermissionGrantScope(permission)),
  );
  readonly permissionGrantAvailableScopes = computed(() =>
    this.permissionGrantRequiresGlobalScope()
      ? this.permissionGrantScopes.filter((scope) => scope.scope === EventManagerPermissionGrantScope.Global)
      : this.permissionGrantScopes,
  );
  readonly permissionGrantSelectionLabel = computed(() =>
    this.getPermissionGrantSelectionLabel(this.permissionGrantSelectedPermissions()),
  );
  readonly permissionGrantPresetOptions: PermissionGrantPresetOption[] = EVENT_MANAGER_PERMISSION_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    icon: preset.icon,
  }));
  readonly selectedPermissionGrantPreset = computed(
    () => EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === this.permissionGrantPresetId()) ?? null,
  );
  readonly selectedPermissionGrantPresetPreview = computed<PermissionGrantPresetPreviewGroup[]>(() => {
    const preset = this.selectedPermissionGrantPreset();
    if (!preset) {
      return [];
    }

    return this.permissionGrantGroups
      .map((group) => {
        const options = group.options.filter((option) =>
          (preset.permissions as readonly Permission[]).includes(option.permission),
        );
        return {
          resource: group.resource,
          label: group.label,
          icon: group.icon,
          permissionLabels: options.map((option) => option.label).join(', '),
          permissionCount: options.length,
          includedData: this.getPermissionsIncludedData(options.map((option) => option.permission)),
        };
      })
      .filter((group) => group.permissionCount > 0);
  });
  readonly permissionGrantDraftCount = computed(() => this.permissionGrantDrafts().length);

  readonly permissionGrantScopes: PermissionGrantScopeOption[] = [
    {
      scope: EventManagerPermissionGrantScope.Global,
      label: 'Global',
      icon: 'public',
    },
    {
      scope: EventManagerPermissionGrantScope.Event,
      label: 'Evento',
      icon: 'event',
    },
    {
      scope: EventManagerPermissionGrantScope.MajorEvent,
      label: 'Grande evento',
      icon: 'festival',
    },
    {
      scope: EventManagerPermissionGrantScope.EventGroup,
      label: 'Grupo de eventos',
      icon: 'folder',
    },
  ];

  readonly personForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    email: [''],
    secondaryEmails: [''],
    phone: [''],
    identityDocument: [''],
    academicId: [''],
    mergedIntoId: [''],
    externalRef: [''],
  });

  readonly lecturerProfileForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: [''],
    publishGoogleUserPicture: [false],
    email: [''],
    whatsapp: [''],
  });

  readonly permissionGrantForm = this.formBuilder.nonNullable.group({
    presetId: [''],
    category: this.formBuilder.nonNullable.control(parsePermission(Permission.Event.Read).resource, Validators.required),
    permissions: this.formBuilder.nonNullable.control<Permission[]>([Permission.Event.Read], Validators.required),
    permission: this.formBuilder.nonNullable.control<Permission>(Permission.Event.Read, Validators.required),
    scope: this.formBuilder.nonNullable.control<EventManagerPermissionGrantScope>(
      EventManagerPermissionGrantScope.Global,
      Validators.required,
    ),
    targetId: [''],
    targetSearch: [''],
    validFrom: [''],
    validUntil: [''],
  });

  constructor() {
    this.permissionGrantForm.controls.category.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resource) => {
        this.applyPermissionGrantCategory(resource);
      });
    this.permissionGrantForm.controls.permissions.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((permissions) => {
        this.permissionGrantSelectedPermissions.set(permissions);
        this.applyPermissionGrantScopeRestrictions();
      });
    this.permissionGrantForm.controls.permission.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((permission) => {
        if (this.editingPermissionGrant()) {
          this.permissionGrantSelectedPermissions.set([permission]);
          this.applyPermissionGrantScopeRestrictions();
        }
      });
    this.permissionGrantForm.controls.scope.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((scope) => {
      this.applyPermissionGrantScope(scope);
    });
    this.permissionGrantForm.controls.targetSearch.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.permissionGrantTargetSearch.set(query);
      });
    this.permissionGrantForm.controls.presetId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((presetId) => {
        this.permissionGrantPresetId.set(presetId);
        this.applyPermissionGrantPresetSelection(presetId);
      });
    this.permissionGrantSelectedPermissions.set(this.permissionGrantForm.controls.permissions.value);
    this.applyPermissionGrantScope(this.permissionGrantForm.controls.scope.value);
  }

  async searchPeople(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    this.peopleSearchQuery.set(normalizedQuery);
    const people = await firstValueFrom(
      this.api.listPeopleSummaries({
        query: normalizedQuery || undefined,
        take: 50,
      }),
    );
    this.people.set(people);

    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    const refreshedPerson = people.find((person) => person.id === selectedPerson.id);
    if (refreshedPerson) {
      return;
    }

    this.resetPersonForm();
  }

  async selectPerson(person: Person): Promise<void> {
    void this.router.navigate(['/people', person.id]);
    if (this.hasPersonDetails(person)) {
      this.populatePersonSelection(person);
      return;
    }

    await this.selectPersonById(person.id);
  }

  async selectPersonById(personId: string): Promise<void> {
    if (this.selectedPerson()?.id === personId) {
      return;
    }

    const person = await firstValueFrom(this.api.getPerson(personId));
    this.populatePersonSelection(person);
  }

  private populatePersonSelection(person: Person): void {
    this.isCreatingPerson.set(false);
    this.selectedPerson.set(person);
    this.personForm.reset({
      id: person.id,
      name: person.name,
      email: person.email ?? '',
      secondaryEmails: person.secondaryEmails?.join(', ') ?? '',
      phone: person.phone ?? '',
      identityDocument: person.identityDocument ?? '',
      academicId: person.academicId ?? '',
      mergedIntoId: person.mergedIntoId ?? '',
      externalRef: person.externalRef ?? '',
    });
    this.populateLecturerProfileForm(person);
    this.resetPermissionGrantForm();
    void this.loadPermissionGrantsForPerson(person);
    void this.ensurePermissionGrantTargetsLoaded();
    this.updateExternallyManagedControls();
  }

  private hasPersonDetails(person: Person): boolean {
    return (
      'secondaryEmails' in person ||
      'mergedIntoId' in person ||
      'externalRef' in person ||
      'lecturerProfile' in person
    );
  }

  resetPersonForm(): void {
    void this.router.navigate(['/people']);
    this.isCreatingPerson.set(false);
    this.selectedPerson.set(null);
    this.personForm.reset({
      id: '',
      name: '',
      email: '',
      secondaryEmails: '',
      phone: '',
      identityDocument: '',
      academicId: '',
      mergedIntoId: '',
      externalRef: '',
    });
    this.resetLecturerProfileForm();
    this.permissionGrants.set([]);
    this.resetPermissionGrantForm();
    this.updateExternallyManagedControls();
  }

  startNewPerson(): void {
    void this.router.navigate(['/people']);
    this.selectedPerson.set(null);
    this.isCreatingPerson.set(true);
    this.personForm.reset({
      id: '',
      name: '',
      email: '',
      secondaryEmails: '',
      phone: '',
      identityDocument: '',
      academicId: '',
      mergedIntoId: '',
      externalRef: '',
    });
    this.resetLecturerProfileForm();
    this.permissionGrants.set([]);
    this.resetPermissionGrantForm();
    this.updateExternallyManagedControls();
  }

  async savePerson(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson && !this.isCreatingPerson()) {
      return;
    }

    if (this.personForm.invalid) {
      this.personForm.markAllAsTouched();
      return;
    }

    const raw = this.personForm.getRawValue();
    const payload: PersonInput = {
      name: raw.name.trim(),
      email: raw.email.trim() || null,
      secondaryEmails: raw.secondaryEmails
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0),
      phone: raw.phone.trim() || null,
      identityDocument: raw.identityDocument.trim() || null,
      academicId: raw.academicId.trim() || null,
      mergedIntoId: raw.mergedIntoId.trim() || null,
      externalRef: raw.externalRef.trim() || null,
    };

    try {
      const savedPerson = await firstValueFrom(
        selectedPerson ? this.api.updatePerson(selectedPerson.id, payload) : this.api.createPerson(payload),
      );
      this.snackbar.open(selectedPerson ? 'Pessoa atualizada.' : 'Pessoa criada.', 'Fechar', { duration: 2500 });
      await this.selectPerson(savedPerson);
      await this.searchPeople(this.peopleSearchQuery());
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar a pessoa.'), 'Fechar', { duration: 5000 });
    }
  }

  async saveLecturerProfile(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    if (this.lecturerProfileForm.invalid) {
      this.lecturerProfileForm.markAllAsTouched();
      return;
    }

    const raw = this.lecturerProfileForm.getRawValue();
    const wasExistingProfile = this.hasLecturerProfile();
    const payload: LecturerProfileInput = {
      displayName: raw.displayName.trim(),
      biography: raw.biography.trim() || null,
      publishGoogleUserPicture: raw.publishGoogleUserPicture,
      email: raw.email.trim() || null,
      whatsapp: this.normalizeWhatsapp(raw.whatsapp.trim()),
    };

    try {
      const lecturerProfile = await firstValueFrom(this.api.upsertLecturerProfile(selectedPerson.id, payload));
      this.selectedPerson.set({
        ...selectedPerson,
        lecturerProfile,
      });
      this.snackbar.open(
        wasExistingProfile ? 'Perfil de ministrante atualizado.' : 'Perfil de ministrante criado.',
        'Fechar',
        {
          duration: 2500,
        },
      );
      await this.searchPeople(this.peopleSearchQuery());
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o perfil de ministrante.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

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
      validFrom: this.formatDateTimeInput(grant.validFrom),
      validUntil: this.formatDateTimeInput(grant.validUntil),
    });
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
        this.buildPermissionGrantInput(selectedPerson.id, userId, permission, raw.scope, targetId, validity),
      ),
      'Seleção manual',
    );
  }

  async savePermissionGrantDrafts(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    const drafts = this.permissionGrantDrafts();
    if (drafts.length === 0) {
      this.snackbar.open('Adicione permissões à revisão antes de salvar.', 'Fechar', { duration: 3000 });
      return;
    }

    await this.createPermissionGrantBatch(
      selectedPerson,
      drafts.map((draft) => this.buildPermissionGrantInputFromDraft(draft)),
      {
        success: drafts.length === 1 ? 'Permissão concedida.' : 'Permissões concedidas.',
        failure: 'Não foi possível conceder as permissões.',
      },
    );
  }

  removePermissionGrantDraft(draftId: string): void {
    this.permissionGrantDrafts.update((drafts) => drafts.filter((draft) => draft.id !== draftId));
  }

  clearPermissionGrantDrafts(): void {
    this.permissionGrantDrafts.set([]);
  }

  private async createPermissionGrantBatch(
    selectedPerson: Person,
    inputs: EventManagerPermissionGrantInput[],
    messages: { success: string; failure: string },
  ): Promise<void> {
    const conflictingGrant = this.findPermissionGrantBatchConflict(inputs);
    if (conflictingGrant) {
      this.snackbar.open(
        `A permissão ${this.getPermissionGrantLabel(conflictingGrant.permission)} já existe nesse escopo com outra validade. Edite ou remova a concessão atual antes de aplicar.`,
        'Fechar',
        { duration: 6000 },
      );
      return;
    }

    try {
      const createdGrants = await Promise.all(
        inputs.map((input) => firstValueFrom(this.permissionGrantsApi.createGrant(input))),
      );
      this.permissionGrants.update((grants) =>
        this.sortPermissionGrants([
          ...grants.filter((item) => !createdGrants.some((grant) => grant.id === item.id)),
          ...createdGrants,
        ]),
      );
      this.resetPermissionGrantForm();
      this.snackbar.open(messages.success, 'Fechar', { duration: 2500 });
    } catch (error) {
      await this.loadPermissionGrantsForPerson(selectedPerson);
      this.snackbar.open(getErrorMessage(error, messages.failure), 'Fechar', { duration: 5000 });
    }
  }

  applySelectedPermissionPreset(): void {
    const selectedPerson = this.selectedPerson();
    const userId = this.getPersonUserId(selectedPerson);
    const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === this.permissionGrantForm.controls.presetId.value);
    if (!selectedPerson || !userId || !preset) {
      return;
    }

    const scope = this.getPresetScope(preset.id);
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
        this.buildPermissionGrantInput(selectedPerson.id, userId, permission, scope, targetId, validity),
      ),
      `Preset: ${preset.label}`,
    );
  }

  async updatePermissionGrant(): Promise<void> {
    const editingGrant = this.editingPermissionGrant();
    if (!editingGrant) {
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

    const input = this.buildPermissionGrantUpdateInput(raw.permission, raw.scope, targetId, validity);

    try {
      const updatedGrant = await firstValueFrom(this.permissionGrantsApi.updateGrant(editingGrant.id, input));
      this.permissionGrants.update((grants) =>
        this.sortPermissionGrants(grants.map((grant) => (grant.id === updatedGrant.id ? updatedGrant : grant))),
      );
      this.resetPermissionGrantForm({ clearDrafts: false });
      this.snackbar.open('Permissão atualizada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível atualizar a permissão.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  async deletePermissionGrant(grant: EventManagerPermissionGrant): Promise<void> {
    try {
      await firstValueFrom(this.permissionGrantsApi.deleteGrant(grant.id));
      this.permissionGrants.update((grants) => grants.filter((item) => item.id !== grant.id));
      this.snackbar.open('Permissão removida.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível remover a permissão.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  getPermissionGrantLabel(permission: string): string {
    const { resource, scope } = parsePermission(permission);
    return `${getPermissionResourceLabel(resource)} · ${getPermissionScopeLabel(scope)}`;
  }

  getPermissionGrantIcon(permission: string): string {
    return getPermissionResourceIcon(parsePermission(permission).resource);
  }

  getPermissionGrantIncludedData(permission: string): readonly PermissionIncludedData[] {
    return getPermissionIncludedData(permission as Permission);
  }

  formatPermissionIncludedDataFields(item: PermissionIncludedData): string {
    return item.fields.join(', ');
  }

  getPermissionGrantSelectionLabel(permissions: readonly Permission[]): string {
    if (permissions.length === 0) {
      return 'Nenhuma permissão selecionada';
    }

    if (permissions.length === 1) {
      return this.getPermissionGrantLabel(permissions[0]);
    }

    return `${permissions.length} permissões selecionadas`;
  }

  getPermissionGrantScopeLabel(scope: EventManagerPermissionGrantScope): string {
    return this.permissionGrantScopes.find((option) => option.scope === scope)?.label ?? scope;
  }

  getPermissionGrantTargetLabel(grant: EventManagerPermissionGrant): string {
    if (grant.scope === EventManagerPermissionGrantScope.Global) {
      return 'Todos os eventos';
    }

    return grant.targetLabel ?? grant.eventId ?? grant.majorEventId ?? grant.eventGroupId ?? 'Alvo removido';
  }

  getPermissionGrantValidityLabel(grant: EventManagerPermissionGrant): string {
    return this.getPermissionGrantValidityWindowLabel(grant);
  }

  getPermissionGrantDraftTargetLabel(draft: PermissionGrantDraft): string {
    if (draft.scope === EventManagerPermissionGrantScope.Global) {
      return 'Todos os eventos';
    }

    return draft.targetLabel ?? draft.eventId ?? draft.majorEventId ?? draft.eventGroupId ?? 'Alvo removido';
  }

  getPermissionGrantDraftValidityLabel(draft: PermissionGrantDraft): string {
    return this.getPermissionGrantValidityWindowLabel(draft);
  }

  getPermissionGrantDraftScopeLabel(draft: PermissionGrantDraft): string {
    return this.getPermissionGrantScopeLabel(draft.scope);
  }

  getPermissionGrantPresetDescription(presetId: string): string {
    return EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === presetId)?.description ?? '';
  }

  getPermissionGrantTargetMetadataLabel(target: EventManagerPermissionGrantTarget): string {
    return [this.getPermissionGrantTargetDateLabel(target), target.description?.trim()].filter(Boolean).join(' · ');
  }

  private getPermissionsIncludedData(permissions: readonly Permission[]): readonly PermissionIncludedData[] {
    const includedData = new Map<string, PermissionIncludedData>();
    for (const permission of permissions) {
      for (const item of getPermissionIncludedData(permission)) {
        includedData.set(`${item.label}:${item.fields.join('|')}`, item);
      }
    }

    return [...includedData.values()];
  }

  private getPermissionGrantTargetDateLabel(target: EventManagerPermissionGrantTarget): string {
    if (!target.startDate) {
      return '';
    }

    if (this.permissionGrantScope() === EventManagerPermissionGrantScope.Event) {
      return formatDate(target.startDate, 'short', this.locale);
    }

    const startDate = formatDate(target.startDate, 'shortDate', this.locale);
    if (!target.endDate) {
      return startDate;
    }

    const endDate = formatDate(target.endDate, 'shortDate', this.locale);
    return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
  }

  private stagePermissionGrantInputs(inputs: EventManagerPermissionGrantInput[], sourceLabel: string): void {
    if (inputs.length === 0) {
      return;
    }

    const conflictingGrant = this.findPermissionGrantBatchConflict(inputs);
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
      const draft = this.buildPermissionGrantDraft(input, sourceLabel);
      const existingIndex = drafts.findIndex((item) => this.isSamePermissionGrantInputTarget(item, input));
      if (existingIndex === -1) {
        drafts.push(draft);
        added += 1;
        continue;
      }

      if (this.hasSamePermissionGrantValidity(drafts[existingIndex], input)) {
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

  private buildPermissionGrantDraft(input: EventManagerPermissionGrantInput, sourceLabel: string): PermissionGrantDraft {
    return {
      ...input,
      id: this.getPermissionGrantInputTargetKey(input),
      sourceLabel,
      targetLabel: this.getPermissionGrantInputTargetLabel(input),
    };
  }

  private buildPermissionGrantInputFromDraft(draft: PermissionGrantDraft): EventManagerPermissionGrantInput {
    return {
      userId: draft.userId,
      personId: draft.personId,
      permission: draft.permission,
      scope: draft.scope,
      eventId: draft.eventId,
      majorEventId: draft.majorEventId,
      eventGroupId: draft.eventGroupId,
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
    };
  }

  private getPermissionGrantValidityWindowLabel(
    grant: Pick<EventManagerPermissionGrant, 'validFrom' | 'validUntil'>,
  ): string {
    const validFrom = grant.validFrom ? this.formatDateTime(grant.validFrom) : null;
    const validUntil = grant.validUntil ? this.formatDateTime(grant.validUntil) : null;

    if (validFrom && validUntil) {
      return `De ${validFrom} até ${validUntil}`;
    }

    if (validFrom) {
      return `A partir de ${validFrom}`;
    }

    if (validUntil) {
      return `Até ${validUntil}`;
    }

    return 'Validade indefinida';
  }

  getPermissionGrantStatusLabel(grant: EventManagerPermissionGrant): string {
    const now = Date.now();
    const validFrom = grant.validFrom ? new Date(grant.validFrom).getTime() : null;
    const validUntil = grant.validUntil ? new Date(grant.validUntil).getTime() : null;

    if (validFrom && validFrom > now) {
      return 'Agendada';
    }

    if (validUntil && validUntil <= now) {
      return 'Expirada';
    }

    return 'Ativa';
  }

  private findPermissionGrantBatchConflict(
    inputs: EventManagerPermissionGrantInput[],
  ): EventManagerPermissionGrant | null {
    for (const input of inputs) {
      const existingGrant = this.permissionGrants().find((grant) => this.isSamePermissionGrantTarget(grant, input));
      if (existingGrant && !this.hasSamePermissionGrantValidity(existingGrant, input)) {
        return existingGrant;
      }
    }

    return null;
  }

  private isSamePermissionGrantTarget(
    grant: EventManagerPermissionGrant,
    input: EventManagerPermissionGrantInput,
  ): boolean {
    return this.getPermissionGrantInputTargetKey(grant) === this.getPermissionGrantInputTargetKey(input);
  }

  private isSamePermissionGrantInputTarget(
    left: EventManagerPermissionGrantInput,
    right: EventManagerPermissionGrantInput,
  ): boolean {
    return this.getPermissionGrantInputTargetKey(left) === this.getPermissionGrantInputTargetKey(right);
  }

  private getPermissionGrantInputTargetKey(
    input: Pick<
      EventManagerPermissionGrantInput,
      'userId' | 'permission' | 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'
    >,
  ): string {
    return [
      input.userId,
      input.permission,
      input.scope,
      input.eventId ?? '',
      input.majorEventId ?? '',
      input.eventGroupId ?? '',
    ].join('|');
  }

  private getPermissionGrantInputTargetLabel(
    input: Pick<EventManagerPermissionGrantInput, 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'>,
  ): string | null {
    switch (input.scope) {
      case EventManagerPermissionGrantScope.Event:
        return this.eventPermissionGrantTargets().find((target) => target.id === input.eventId)?.label ?? null;
      case EventManagerPermissionGrantScope.MajorEvent:
        return this.majorEventPermissionGrantTargets().find((target) => target.id === input.majorEventId)?.label ?? null;
      case EventManagerPermissionGrantScope.EventGroup:
        return this.eventGroupPermissionGrantTargets().find((target) => target.id === input.eventGroupId)?.label ?? null;
      default:
        return null;
    }
  }

  private hasSamePermissionGrantValidity(
    grant: Pick<EventManagerPermissionGrant, 'validFrom' | 'validUntil'>,
    input: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
  ): boolean {
    return (
      this.getPermissionGrantDateTime(grant.validFrom) === this.getPermissionGrantDateTime(input.validFrom) &&
      this.getPermissionGrantDateTime(grant.validUntil) === this.getPermissionGrantDateTime(input.validUntil)
    );
  }

  private getPermissionGrantDateTime(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  private buildPermissionGrantInput(
    personId: string,
    userId: string,
    permission: Permission,
    scope: EventManagerPermissionGrantScope,
    targetId: string,
    validity: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
  ): EventManagerPermissionGrantInput {
    return {
      userId,
      personId,
      permission,
      ...this.buildPermissionGrantTargetInput(permission, scope, targetId),
      ...validity,
    };
  }

  private buildPermissionGrantUpdateInput(
    permission: Permission,
    scope: EventManagerPermissionGrantScope,
    targetId: string,
    validity: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
  ): EventManagerPermissionGrantUpdateInput {
    return {
      permission,
      ...this.buildPermissionGrantTargetInput(permission, scope, targetId),
      ...validity,
    };
  }

  private buildPermissionGrantTargetInput(
    permission: Permission,
    scope: EventManagerPermissionGrantScope,
    targetId: string,
  ): Pick<EventManagerPermissionGrantInput, 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'> {
    const effectiveScope = requiresGlobalPermissionGrantScope(permission) ? EventManagerPermissionGrantScope.Global : scope;

    return {
      scope: effectiveScope,
      eventId: effectiveScope === EventManagerPermissionGrantScope.Event ? targetId : null,
      majorEventId: effectiveScope === EventManagerPermissionGrantScope.MajorEvent ? targetId : null,
      eventGroupId: effectiveScope === EventManagerPermissionGrantScope.EventGroup ? targetId : null,
    };
  }

  private getPresetScope(presetId: string): EventManagerPermissionGrantScope {
    const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return this.permissionGrantForm.controls.scope.value;
    }

    if (preset.permissions.some((permission) => requiresGlobalPermissionGrantScope(permission))) {
      return EventManagerPermissionGrantScope.Global;
    }

    return preset.preferredScope;
  }

  private updateExternallyManagedControls(): void {
    const controls = [
      this.personForm.controls.name,
      this.personForm.controls.email,
      this.personForm.controls.phone,
      this.personForm.controls.identityDocument,
      this.personForm.controls.academicId,
    ];

    for (const control of controls) {
      if (this.hasExternallyManagedProfile()) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    }
  }

  private applyPermissionGrantScope(scope: EventManagerPermissionGrantScope): void {
    this.permissionGrantScope.set(scope);
    const targetControl = this.permissionGrantForm.controls.targetId;
    targetControl.reset('', { emitEvent: false });
    this.permissionGrantForm.controls.targetSearch.reset('', { emitEvent: false });
    this.permissionGrantTargetSearch.set('');

    if (scope === EventManagerPermissionGrantScope.Global) {
      targetControl.clearValidators();
    } else {
      targetControl.setValidators([Validators.required]);
    }

    targetControl.updateValueAndValidity({ emitEvent: false });
  }

  private applyPermissionGrantCategory(resource: string): void {
    this.permissionGrantCategory.set(resource);
    const group = this.permissionGrantGroups.find((item) => item.resource === resource);
    const firstPermission = group?.options[0]?.permission ?? Permission.Event.Read;
    if (this.editingPermissionGrant()) {
      this.permissionGrantForm.controls.permission.setValue(firstPermission, { emitEvent: false });
      this.permissionGrantSelectedPermissions.set([firstPermission]);
    } else {
      this.permissionGrantForm.controls.permissions.setValue([firstPermission], { emitEvent: false });
      this.permissionGrantSelectedPermissions.set([firstPermission]);
    }
    this.applyPermissionGrantScopeRestrictions();
  }

  private applyPermissionGrantScopeRestrictions(): void {
    if (!this.permissionGrantRequiresGlobalScope()) {
      return;
    }

    if (this.permissionGrantForm.controls.scope.value !== EventManagerPermissionGrantScope.Global) {
      this.permissionGrantForm.controls.scope.setValue(EventManagerPermissionGrantScope.Global);
      return;
    }

    this.applyPermissionGrantScope(EventManagerPermissionGrantScope.Global);
  }

  private applyPermissionGrantPresetSelection(presetId: string): void {
    const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetId);
    if (!preset || this.editingPermissionGrant()) {
      return;
    }

    const scope = preset.permissions.some((permission) => requiresGlobalPermissionGrantScope(permission))
      ? EventManagerPermissionGrantScope.Global
      : preset.preferredScope;
    this.permissionGrantForm.controls.scope.setValue(scope);
  }

  private resetPermissionGrantForm(options: { clearDrafts?: boolean } = {}): void {
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

  private normalizePermissionGrantValidity(
    validFromValue: string,
    validUntilValue: string,
  ): Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'> | null {
    const validFrom = this.normalizeDateTimeInput(validFromValue, 'início da validade');
    const validUntil = this.normalizeDateTimeInput(validUntilValue, 'fim da validade');

    if (validFrom === false || validUntil === false) {
      return null;
    }

    if (validFrom && validUntil && new Date(validUntil).getTime() <= new Date(validFrom).getTime()) {
      this.snackbar.open('O fim da validade precisa ser posterior ao início.', 'Fechar', { duration: 4000 });
      return null;
    }

    if (validUntil && new Date(validUntil).getTime() <= Date.now()) {
      this.snackbar.open('O fim da validade precisa ser futuro.', 'Fechar', { duration: 4000 });
      return null;
    }

    return {
      validFrom,
      validUntil,
    };
  }

  private normalizeDateTimeInput(value: string, label: string): string | null | false {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      this.snackbar.open(`Informe uma data válida para ${label}.`, 'Fechar', { duration: 4000 });
      return false;
    }

    return date.toISOString();
  }

  private formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private formatDateTimeInput(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
  }

  private async loadPermissionGrantsForPerson(person: Person): Promise<void> {
    const userId = this.getPersonUserId(person);
    if (!userId) {
      this.permissionGrants.set([]);
      return;
    }

    try {
      const grants = await firstValueFrom(this.permissionGrantsApi.listUserGrants(userId));
      if (this.getSelectedPersonUserId() === userId) {
        this.permissionGrants.set(this.sortPermissionGrants(grants));
      }
    } catch (error) {
      this.permissionGrants.set([]);
      this.snackbar.open(getErrorMessage(error, 'Não foi possível carregar as permissões.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  private async ensurePermissionGrantTargetsLoaded(): Promise<void> {
    if (this.permissionGrantTargetsLoaded) {
      return;
    }

    if (this.permissionGrantTargetsLoading) {
      await this.permissionGrantTargetsLoading;
      return;
    }

    this.permissionGrantTargetsLoading = this.loadPermissionGrantTargets();
    try {
      await this.permissionGrantTargetsLoading;
      this.permissionGrantTargetsLoaded = true;
    } finally {
      this.permissionGrantTargetsLoading = null;
    }
  }

  private async loadPermissionGrantTargets(): Promise<void> {
    try {
      const [events, majorEvents, eventGroups] = await Promise.all([
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.Event, { take: 500 })),
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.MajorEvent, { take: 500 })),
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.EventGroup, { take: 500 })),
      ]);

      this.eventPermissionGrantTargets.set(events ?? []);
      this.majorEventPermissionGrantTargets.set(majorEvents ?? []);
      this.eventGroupPermissionGrantTargets.set(eventGroups ?? []);
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível carregar os alvos de permissão.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  private getPersonUserId(person: Person | null): string | null {
    return person?.userId ?? person?.user?.id ?? null;
  }

  private getSelectedPersonUserId(): string | null {
    return this.getPersonUserId(this.selectedPerson());
  }

  private sortPermissionGrants(grants: EventManagerPermissionGrant[]): EventManagerPermissionGrant[] {
    return [...grants].sort((left, right) => {
      const permissionOrder = this.getPermissionGrantLabel(left.permission).localeCompare(
        this.getPermissionGrantLabel(right.permission),
        'pt-BR',
      );
      if (permissionOrder !== 0) {
        return permissionOrder;
      }

      return this.getPermissionGrantScopeLabel(left.scope).localeCompare(
        this.getPermissionGrantScopeLabel(right.scope),
        'pt-BR',
      );
    });
  }

  private populateLecturerProfileForm(person: Person): void {
    this.lecturerProfileForm.reset({
      displayName: person.lecturerProfile?.displayName ?? '',
      biography: person.lecturerProfile?.biography ?? '',
      publishGoogleUserPicture: person.lecturerProfile?.publishGoogleUserPicture ?? false,
      email: person.lecturerProfile?.email ?? '',
      whatsapp: person.lecturerProfile?.whatsapp ?? '',
    });
  }

  private resetLecturerProfileForm(): void {
    this.lecturerProfileForm.reset({
      displayName: '',
      biography: '',
      publishGoogleUserPicture: false,
      email: '',
      whatsapp: '',
    });
  }

  private normalizeWhatsapp(value: string): string | null {
    if (!value) {
      return null;
    }

    const hasPlus = value.startsWith('+');
    const digits = value.replace(/\D/g, '');
    const normalized = hasPlus ? `+${digits}` : digits.length === 10 || digits.length === 11 ? `+55${digits}` : `+${digits}`;

    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : value;
  }
}
