import {
  EVENT_MANAGER_PERMISSION_PRESETS,
  EventManagerPermissionGrantScope,
  Permission,
  requiresGlobalPermissionGrantScope,
  parsePermission,
} from '@cacic-fct/shared-permissions';
import { DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { EventManagerPermissionGrant, EventManagerPermissionGrantTarget, Person } from '@cacic-fct/event-manager-admin-contracts';
import { PermissionGrantsApiService } from '../../graphql/permission-grants-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { bindLiveSearch } from '../live-search';
import { createWorkspaceListPagination } from '../list-pagination';
import {
  PERMISSION_GRANT_GROUPS,
  PERMISSION_GRANT_PRESET_OPTIONS,
  PERMISSION_GRANT_SCOPES,
  PermissionGrantDraft,
  PermissionGrantPresetPreviewGroup,
  getPermissionGrantSelectionLabel as getGrantSelectionLabel,
  getPermissionsIncludedData,
  normalizeSearchText,
} from './workspace-people-permission-grants';

export type PeoplePermissionSearchFilter = 'ALL' | 'ACTIVE_GRANTS' | 'ANY_GRANTS';

export const PEOPLE_PERMISSION_SEARCH_FILTER_OPTIONS: readonly {
  value: PeoplePermissionSearchFilter;
  label: string;
}[] = [
  { value: 'ALL', label: 'Todas as pessoas' },
  { value: 'ACTIVE_GRANTS', label: 'Com permissões ativas' },
  { value: 'ANY_GRANTS', label: 'Com permissões ativas ou inativas' },
];

export abstract class WorkspacePeopleState {
  protected readonly api = inject(PeopleApiService);
  protected readonly permissionGrantsApi = inject(PermissionGrantsApiService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly formBuilder = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly destroyRef = inject(DestroyRef);
  protected readonly locale = inject(LOCALE_ID);
  protected permissionGrantTargetsLoaded = false;
  protected permissionGrantTargetsLoading: Promise<boolean> | null = null;
  protected initializingPermissionGrantForm = false;

  readonly people = signal<Person[]>([]);
  readonly peoplePagination = createWorkspaceListPagination();
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
    const query = normalizeSearchText(this.permissionGrantTargetSearch());
    const options = this.permissionGrantTargetOptions() ?? [];
    if (!query) {
      return options.slice(0, 40);
    }

    return options
      .filter((target) =>
        normalizeSearchText(`${target.label} ${target.description ?? ''}`).includes(query),
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
  readonly permissionGrantTargetSearchLabel = computed(
    () => `Buscar ${this.permissionGrantTargetLabel().toLocaleLowerCase('pt-BR')}`,
  );

  readonly permissionGrantGroups = PERMISSION_GRANT_GROUPS;
  readonly selectedPermissionGrantGroup = computed(
    () =>
      this.permissionGrantGroups.find((group) => group.resource === this.permissionGrantCategory()) ??
      this.permissionGrantGroups[0],
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
    getGrantSelectionLabel(this.permissionGrantSelectedPermissions()),
  );
  readonly permissionGrantPresetOptions = PERMISSION_GRANT_PRESET_OPTIONS;
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
          includedData: getPermissionsIncludedData(options.map((option) => option.permission)),
        };
      })
      .filter((group) => group.permissionCount > 0);
  });
  readonly permissionGrantDraftCount = computed(() => this.permissionGrantDrafts().length);

  readonly permissionGrantScopes = PERMISSION_GRANT_SCOPES;
  readonly peoplePermissionSearchFilterOptions = PEOPLE_PERMISSION_SEARCH_FILTER_OPTIONS;

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

  readonly peopleSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
    permissionFilter: this.formBuilder.nonNullable.control<PeoplePermissionSearchFilter>('ALL'),
    hasLecturerProfile: [false],
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
    bindLiveSearch({
      control: this.peopleSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: (query) => this.searchPeople(query),
    });
    this.peopleSearchForm.controls.permissionFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.searchPeople(this.peopleSearchForm.controls.query.value);
      });
    this.peopleSearchForm.controls.hasLecturerProfile.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.searchPeople(this.peopleSearchForm.controls.query.value);
      });
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

  abstract searchPeople(query: string): Promise<void>;

  protected abstract applyPermissionGrantCategory(resource: string): void;

  protected abstract applyPermissionGrantPresetSelection(presetId: string): void;

  protected abstract applyPermissionGrantScope(scope: EventManagerPermissionGrantScope): void;

  protected abstract applyPermissionGrantScopeRestrictions(): void;
}
