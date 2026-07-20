import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { EVENT_MANAGER_PERMISSION_PRESETS, EventManagerPermissionGrantScope, Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { PermissionGrantsApiService } from '../graphql/permission-grants-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import { PeopleService } from './people.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('PeopleService', () => {
  let service: PeopleService;
  let peopleApi: {
    createPerson: ReturnType<typeof vi.fn>;
    getPerson: ReturnType<typeof vi.fn>;
    listPeopleSummaries: ReturnType<typeof vi.fn>;
    updatePerson: ReturnType<typeof vi.fn>;
    upsertLecturerProfile: ReturnType<typeof vi.fn>;
  };
  let permissionGrantsApi: {
    createGrant: ReturnType<typeof vi.fn>;
    deleteGrant: ReturnType<typeof vi.fn>;
    listTargets: ReturnType<typeof vi.fn>;
    listUserGrants: ReturnType<typeof vi.fn>;
    updateGrant: ReturnType<typeof vi.fn>;
  };
  let snackbar: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let grantedPermissions: Set<Permission>;

  const selectedPerson = createAdminPerson({
    id: 'person-1',
    name: 'Ada Lovelace',
    userId: 'user-1',
    user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'access' },
  });
  const target: EventManagerPermissionGrantTarget = {
    id: 'event-1',
    label: 'Credenciamento',
    description: 'Abertura',
    emoji: 'clipboard',
    startDate: '2026-07-01T12:00:00.000Z',
    endDate: null,
  };
  const majorTarget: EventManagerPermissionGrantTarget = {
    id: 'major-event-1',
    label: 'Semana da Computação',
    description: 'Grande evento',
    emoji: 'computer',
    startDate: '2026-07-01T12:00:00.000Z',
    endDate: '2026-07-05T12:00:00.000Z',
  };

  beforeEach(async () => {
    peopleApi = {
      createPerson: vi.fn((input) => of(createAdminPerson({ ...input, id: 'created-person' }))),
      getPerson: vi.fn(() => of(selectedPerson)),
      listPeopleSummaries: vi.fn(() => of([selectedPerson])),
      updatePerson: vi.fn((id, input) => of(createAdminPerson({ ...input, id }))),
      upsertLecturerProfile: vi.fn(),
    };
    permissionGrantsApi = {
      createGrant: vi.fn((input: EventManagerPermissionGrantInput) =>
        of(permissionGrant({ ...input, id: `grant-${input.permission}` })),
      ),
      deleteGrant: vi.fn(() => of({ deleted: true, id: 'grant-1' })),
      listTargets: vi.fn((scope: EventManagerPermissionGrantScope) =>
        of(scope === EventManagerPermissionGrantScope.Event ? [target] : scope === EventManagerPermissionGrantScope.MajorEvent ? [majorTarget] : []),
      ),
      listUserGrants: vi.fn(() => of([permissionGrant()])),
      updateGrant: vi.fn((id: string, input: EventManagerPermissionGrantUpdateInput) =>
        of(permissionGrant({
          ...input,
          id,
          targetLabel: input.eventId === target.id ? target.label : null,
        })),
      ),
    };
    snackbar = { open: vi.fn() };
    router = { navigate: vi.fn() };
    grantedPermissions = new Set([Permission.PermissionGrant.Read]);

    await TestBed.configureTestingModule({
      providers: [
        PeopleService,
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: PermissionGrantsApiService, useValue: permissionGrantsApi },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
        {
          provide: PermissionsService,
          useValue: {
            has: (permission: Permission) => grantedPermissions.has(permission),
          },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(PeopleService);
  });

  it('searches people with trimmed queries and paged result limits', async () => {
    await service.searchPeople('  ada  ');

    expect(service.peopleSearchQuery()).toBe('ada');
    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({
      query: 'ada',
      skip: 0,
      take: 51,
    });
    expect(service.people()).toEqual([selectedPerson]);
  });

  it('passes permission and lecturer profile filters to people search', async () => {
    service.peopleSearchForm.controls.permissionFilter.setValue('ACTIVE_GRANTS', { emitEvent: false });
    service.peopleSearchForm.controls.hasLecturerProfile.setValue(true, { emitEvent: false });

    await service.searchPeople('ada');

    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({
      query: 'ada',
      skip: 0,
      take: 51,
      permissionGrantFilter: 'ACTIVE',
      hasLecturerProfile: true,
    });

    service.peopleSearchForm.controls.permissionFilter.setValue('ANY_GRANTS', { emitEvent: false });
    service.peopleSearchForm.controls.hasLecturerProfile.setValue(false, { emitEvent: false });

    await service.searchPeople('ada');

    expect(peopleApi.listPeopleSummaries).toHaveBeenLastCalledWith({
      query: 'ada',
      skip: 0,
      take: 51,
      permissionGrantFilter: 'ANY',
    });
  });

  it('does not send permission grant filters without permission-grant read permission', async () => {
    grantedPermissions.delete(Permission.PermissionGrant.Read);
    service.peopleSearchForm.controls.permissionFilter.setValue('ANY_GRANTS', { emitEvent: false });

    await service.searchPeople('ada');

    expect(service.peoplePermissionSearchFilterOptions()).toEqual([{ value: 'ALL', label: 'Todas as pessoas' }]);
    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({
      query: 'ada',
      skip: 0,
      take: 51,
    });
  });

  it('creates people with normalized form values and refreshes the selected record', async () => {
    const createdPerson = createAdminPerson({
      id: 'created-person',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      secondaryEmails: ['alias@example.com', 'work@example.com'],
      phone: '+5518999990000',
      identityDocument: '12345678900',
      academicId: 'RA123',
      externalRef: 'external-1',
    });
    peopleApi.createPerson.mockReturnValueOnce(of(createdPerson));
    peopleApi.listPeopleSummaries.mockReturnValueOnce(of([createdPerson]));

    service.startNewPerson();
    expect(service.personForm.controls.id.disabled).toBe(true);
    expect(service.personForm.controls.mergedIntoId.disabled).toBe(true);
    expect(service.personForm.controls.externalRef.disabled).toBe(true);
    service.personForm.setValue({
      id: '',
      name: '  Grace Hopper  ',
      email: ' grace@example.com ',
      secondaryEmails: ' alias@example.com, work@example.com, ',
      phone: ' +5518999990000 ',
      identityDocument: ' 12345678900 ',
      academicId: ' RA123 ',
      mergedIntoId: ' ',
      externalRef: ' external-1 ',
    });

    await service.savePerson();
    await flushPromises();

    expect(peopleApi.createPerson).toHaveBeenCalledWith({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      secondaryEmails: ['alias@example.com', 'work@example.com'],
      phone: '+5518999990000',
      identityDocument: '12345678900',
      academicId: 'RA123',
    });
    expect(service.selectedPerson()).toEqual(createdPerson);
    expect(service.personForm.getRawValue()).toEqual(
      expect.objectContaining({
        id: 'created-person',
        name: 'Grace Hopper',
        email: 'grace@example.com',
      }),
    );
    expect(snackbar.open).toHaveBeenCalledWith('Pessoa criada.', 'Fechar', { duration: 2500 });
  });

  it('selects a person, loads grants, and loads permission targets once', async () => {
    await service.selectPersonById('person-1');
    await flushPromises();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(service.selectedPerson()).toEqual(selectedPerson);
    expect(service.personForm.getRawValue()).toEqual(
      expect.objectContaining({
        id: 'person-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    );
    expect(peopleApi.getPerson).toHaveBeenCalledWith('person-1');
    expect(permissionGrantsApi.listUserGrants).toHaveBeenCalledWith('user-1');
    expect(permissionGrantsApi.listTargets).toHaveBeenCalledTimes(3);

    await service.selectPersonById('person-1');
    await flushPromises();

    expect(peopleApi.getPerson).toHaveBeenCalledTimes(1);
  });

  it('stages scoped permission grants with target labels', () => {
    service.selectedPerson.set(selectedPerson);
    service.eventPermissionGrantTargets.set([target]);
    service.permissionGrantForm.reset({
      presetId: '',
      category: 'event-attendance',
      permissions: [Permission.EventAttendance.Collect],
      permission: Permission.EventAttendance.Collect,
      scope: EventManagerPermissionGrantScope.Event,
      targetId: 'event-1',
      targetSearch: '',
      validFrom: '',
      validUntil: '',
    });

    service.addSelectedPermissionGrantsToReview();

    expect(service.permissionGrantDrafts()).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        personId: 'person-1',
        permission: Permission.EventAttendance.Collect,
        scope: EventManagerPermissionGrantScope.Event,
        eventId: 'event-1',
        targetLabel: 'Credenciamento',
      }),
    ]);
  });

  it('forces global scope when the selected permission cannot be target-scoped', () => {
    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);
    service.selectPermissionGrantTarget('event-1');

    service.permissionGrantForm.controls.category.setValue('person');
    service.permissionGrantForm.controls.permissions.setValue([Permission.Person.Delete]);

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.Global);
    expect(service.permissionGrantForm.controls.scope.value).toBe(EventManagerPermissionGrantScope.Global);
    expect(service.permissionGrantForm.controls.targetId.value).toBe('');
    expect(service.permissionGrantAvailableScopes()).toEqual([
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Global, disabled: false }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Event, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.MajorEvent, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.EventGroup, disabled: true }),
    ]);
  });

  it('forces preset preferred scopes and disables incompatible scope choices', () => {
    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Global);

    service.permissionGrantForm.controls.presetId.setValue('receipt-reader');

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.MajorEvent);
    expect(service.permissionGrantForm.controls.scope.value).toBe(EventManagerPermissionGrantScope.MajorEvent);
    expect(service.permissionGrantAvailableScopes()).toEqual([
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Global, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Event, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.MajorEvent, disabled: false }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.EventGroup, disabled: true }),
    ]);

    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.MajorEvent);
    expect(service.permissionGrantForm.controls.scope.value).toBe(EventManagerPermissionGrantScope.MajorEvent);

    service.permissionGrantForm.controls.presetId.setValue('attendance-coordinator');

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.Event);
    expect(service.permissionGrantAvailableScopes()).toEqual([
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Global, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Event, disabled: false }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.MajorEvent, disabled: false }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.EventGroup, disabled: false }),
    ]);
  });

  it('stages the new permission presets with their enforced scopes', () => {
    service.selectedPerson.set(selectedPerson);
    service.eventPermissionGrantTargets.set([target]);
    service.majorEventPermissionGrantTargets.set([majorTarget]);

    const presetCases = [
      { id: 'event-structure-manager', scope: EventManagerPermissionGrantScope.MajorEvent, targetId: majorTarget.id },
      { id: 'receipt-reader', scope: EventManagerPermissionGrantScope.MajorEvent, targetId: majorTarget.id },
      { id: 'lecturer-manager', scope: EventManagerPermissionGrantScope.Event, targetId: target.id },
      { id: 'publication-editor', scope: EventManagerPermissionGrantScope.MajorEvent, targetId: majorTarget.id },
      { id: 'readonly-operator', scope: EventManagerPermissionGrantScope.MajorEvent, targetId: majorTarget.id },
    ] as const;

    for (const presetCase of presetCases) {
      service.clearPermissionGrantDrafts();
      service.permissionGrantForm.controls.presetId.setValue(presetCase.id);
      service.selectPermissionGrantTarget(presetCase.targetId);

      service.applySelectedPermissionPreset();

      const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetCase.id);
      expect(preset).toBeDefined();
      expect(service.permissionGrantDrafts().map((draft) => draft.permission)).toEqual(preset?.permissions);
      expect(service.permissionGrantDrafts()).toEqual(
        preset?.permissions.map((permission) =>
          expect.objectContaining({
            userId: 'user-1',
            personId: 'person-1',
            permission,
            scope: presetCase.scope,
            eventId: presetCase.scope === EventManagerPermissionGrantScope.Event ? presetCase.targetId : null,
            majorEventId: presetCase.scope === EventManagerPermissionGrantScope.MajorEvent ? presetCase.targetId : null,
          }),
        ),
      );
    }
  });

  it('persists staged permission grants through the permission grants API', async () => {
    service.selectedPerson.set(selectedPerson);
    service.permissionGrantDrafts.set([
      {
        userId: 'user-1',
        personId: 'person-1',
        permission: Permission.EventAttendance.Collect,
        scope: EventManagerPermissionGrantScope.Event,
        eventId: 'event-1',
        majorEventId: null,
        eventGroupId: null,
        validFrom: null,
        validUntil: null,
        id: 'draft-1',
        sourceLabel: 'Seleção manual',
        targetLabel: 'Credenciamento',
      },
    ]);

    await service.savePermissionGrantDrafts();

    expect(permissionGrantsApi.createGrant).toHaveBeenCalledWith({
      userId: 'user-1',
      personId: 'person-1',
      permission: Permission.EventAttendance.Collect,
      scope: EventManagerPermissionGrantScope.Event,
      eventId: 'event-1',
      majorEventId: null,
      eventGroupId: null,
      validFrom: null,
      validUntil: null,
    });
    expect(service.permissionGrantDrafts()).toEqual([]);
    expect(service.permissionGrants()).toEqual([
      expect.objectContaining({
        id: `grant-${Permission.EventAttendance.Collect}`,
        permission: Permission.EventAttendance.Collect,
      }),
    ]);
    expect(snackbar.open).toHaveBeenCalledWith('Permissão concedida.', 'Fechar', { duration: 2500 });
  });

  it('updates an editing permission grant through the persistence API', async () => {
    const existingGrant = permissionGrant({
      id: 'grant-edit',
      permission: Permission.Event.Read,
      scope: EventManagerPermissionGrantScope.Global,
    });
    service.permissionGrants.set([existingGrant]);
    service.eventPermissionGrantTargets.set([target]);

    service.startEditingPermissionGrant(existingGrant);
    service.permissionGrantForm.controls.permission.setValue(Permission.EventAttendance.Collect);
    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);
    service.selectPermissionGrantTarget('event-1');

    await service.submitPermissionGrantForm();

    expect(permissionGrantsApi.updateGrant).toHaveBeenCalledWith('grant-edit', {
      permission: Permission.EventAttendance.Collect,
      scope: EventManagerPermissionGrantScope.Event,
      eventId: 'event-1',
      majorEventId: null,
      eventGroupId: null,
      validFrom: null,
      validUntil: null,
    });
    expect(service.editingPermissionGrant()).toBeNull();
    expect(service.permissionGrants()).toEqual([
      expect.objectContaining({
        id: 'grant-edit',
        permission: Permission.EventAttendance.Collect,
        scope: EventManagerPermissionGrantScope.Event,
        targetLabel: 'Credenciamento',
      }),
    ]);
    expect(snackbar.open).toHaveBeenCalledWith('Permissão atualizada.', 'Fechar', { duration: 2500 });
  });

  it('removes permission grants without disturbing unrelated grants', async () => {
    const removedGrant = permissionGrant({ id: 'grant-remove', permission: Permission.Event.Read });
    const keptGrant = permissionGrant({ id: 'grant-keep', permission: Permission.Event.Update });
    service.permissionGrants.set([removedGrant, keptGrant]);

    await service.deletePermissionGrant(removedGrant);

    expect(permissionGrantsApi.deleteGrant).toHaveBeenCalledWith('grant-remove');
    expect(service.permissionGrants()).toEqual([keptGrant]);
    expect(snackbar.open).toHaveBeenCalledWith('Permissão removida.', 'Fechar', { duration: 2500 });
  });
});

function permissionGrant(
  overrides: Partial<EventManagerPermissionGrant> = {},
): EventManagerPermissionGrant {
  return {
    id: 'grant-1',
    userId: 'user-1',
    personId: 'person-1',
    permission: Permission.Event.Read,
    scope: EventManagerPermissionGrantScope.Global,
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    targetLabel: null,
    validFrom: null,
    validUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdById: 'admin-user',
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: 'admin-user',
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
