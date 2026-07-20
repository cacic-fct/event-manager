import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { EventManagerPermissionGrant } from '@cacic-fct/event-manager-admin-contracts';
import { EventManagerKeycloakRole, EventManagerPermissionGrantScope, Permission } from '@cacic-fct/shared-permissions';
import { signal } from '@angular/core';
import { NEVER, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionGrantsApiService } from '../graphql/permission-grants-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import type { PermissionGrantDraft } from './people-permission-grants';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { PeopleService } from './people.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PeoplePageComponent } from './people-page.component';

describe('PeoplePageComponent permissions section', () => {
  it('shows the linked-user requirement before permission grant controls', async () => {
    const { element, fixture } = await renderComponent({
      selectedPerson: createAdminPerson({ userId: null, user: null }),
    });
    await openTab(fixture, element, 'Permissões');

    expect(element.textContent).toContain('Permissões do Event Manager');
    expect(element.textContent).toContain('Essa pessoa não possui um usuário vinculado.');
    expect(element.querySelector('.permission-grant-form')).toBeNull();
  });

  it('renders the empty permission state and keeps write actions disabled without grant permissions', async () => {
    const { element, fixture } = await renderComponent({
      grantedPermissions: [Permission.Person.Read, Permission.Person.Update, Permission.PermissionGrant.Read],
      selectedPerson: linkedPerson(),
    });
    await openTab(fixture, element, 'Permissões');

    expect(element.textContent).toContain('Concessões gravadas no Event Manager');
    expect(element.textContent).toContain('Nenhuma permissão concedida');
    expect(buttonByText(element, 'Adicionar permissões')?.disabled).toBe(true);
  });

  it('renders existing grants with included-data details and wires history, edit, and delete actions', async () => {
    const { auditLog, element, fixture, service } = await renderComponent({
      grantedPermissions: [
        Permission.Person.Read,
        Permission.Person.Update,
        Permission.PermissionGrant.Read,
        Permission.PermissionGrant.Update,
        Permission.PermissionGrant.Delete,
      ],
      selectedPerson: linkedPerson(),
      grants: [
        permissionGrant({
          permission: Permission.EventAttendance.Collect,
          scope: EventManagerPermissionGrantScope.Event,
          eventId: 'event-1',
          targetLabel: 'Oficina de Angular',
        }),
      ],
    });
    await openTab(fixture, element, 'Permissões');

    expect(element.textContent).toContain('Presenças · Coletar');
    expect(element.textContent).toContain('Evento · Oficina de Angular');
    expect(element.textContent).toContain('Inclui dados limitados');

    buttonByLabel(element, 'Ver histórico da permissão')?.click();
    expect(auditLog.openHistory).toHaveBeenCalledWith('PERMISSION_GRANT', 'grant-1', 'Presenças · Coletar');

    buttonByLabel(element, 'Editar permissão')?.click();
    expect(service.editingPermissionGrant()?.id).toBe('grant-1');

    buttonByLabel(element, 'Remover permissão')?.click();
    await flushPromises();
    expect(service.permissionGrants()).toEqual([]);
  });

  it('shows staged drafts and removes a draft from review', async () => {
    const { element, fixture, service } = await renderComponent({
      selectedPerson: linkedPerson(),
      drafts: [
        {
          id: 'draft-1',
          userId: 'user-1',
          personId: 'person-1',
          permission: Permission.EventAttendance.Collect,
          scope: EventManagerPermissionGrantScope.Event,
          eventId: 'event-1',
          majorEventId: null,
          eventGroupId: null,
          targetLabel: 'Oficina de Angular',
          validFrom: null,
          validUntil: null,
          sourceLabel: 'Seleção manual',
        },
      ],
    });
    await openTab(fixture, element, 'Permissões');

    expect(element.textContent).toContain('Permissões em revisão');
    expect(element.textContent).toContain('1 concessões serão salvas.');

    buttonByLabel(element, 'Remover permissão da revisão')?.click();
    fixture.detectChanges();

    expect(service.permissionGrantDrafts()).toEqual([]);
    expect(element.textContent).not.toContain('Permissões em revisão');
  });

  it('switches to the single-permission editing controls while a grant is being edited', async () => {
    const grant = permissionGrant({ permission: Permission.Event.Read });
    const { element, fixture, service } = await renderComponent({
      selectedPerson: linkedPerson(),
      grants: [grant],
      editingGrant: grant,
    });
    await openTab(fixture, element, 'Permissões');

    expect(service.editingPermissionGrant()?.id).toBe('grant-1');
    expect(buttonByText(element, 'Salvar permissão')).not.toBeNull();
    expect(buttonByText(element, 'Cancelar edição')).not.toBeNull();
    expect(element.textContent).not.toContain('Permissões em revisão');
    expect(element.textContent).not.toContain('Adicionar permissões do preset');
  });
});

type RenderOptions = {
  selectedPerson?: ReturnType<typeof createAdminPerson>;
  grants?: EventManagerPermissionGrant[];
  drafts?: PermissionGrantDraft[];
  editingGrant?: EventManagerPermissionGrant | null;
  grantedPermissions?: Permission[];
};

async function renderComponent(options: RenderOptions = {}): Promise<{
  auditLog: { openHistory: ReturnType<typeof vi.fn> };
  element: HTMLElement;
  fixture: ComponentFixture<PeoplePageComponent>;
  service: PeopleService;
}> {
  const grantedPermissions = new Set(
    options.grantedPermissions ?? [
      Permission.Person.Read,
      Permission.Person.Update,
      Permission.PermissionGrant.Read,
      Permission.PermissionGrant.Create,
      Permission.PermissionGrant.Update,
      Permission.PermissionGrant.Delete,
    ],
  );
  const roles = signal<string[]>([EventManagerKeycloakRole.SuperAdmin]);
  const auditLog = { openHistory: vi.fn(), openEventAttendanceHistory: vi.fn() };
  const permissionGrantsApi = {
    createGrant: vi.fn((input) => of(permissionGrant({ ...input, id: `grant-${input.permission}` }))),
    deleteGrant: vi.fn(() => of({ deleted: true, id: 'grant-1' })),
    listTargets: vi.fn(() => of([])),
    listUserGrants: vi.fn(() => of([])),
    updateGrant: vi.fn((id, input) => of(permissionGrant({ ...input, id }))),
  };

  await TestBed.configureTestingModule({
    imports: [PeoplePageComponent],
    providers: [
      provideNoopAnimations(),
      { provide: ActivatedRoute, useValue: { paramMap: NEVER } },
      { provide: AuthService, useValue: { roles } },
      { provide: AuditLogService, useValue: auditLog },
      {
        provide: PermissionsService,
        useValue: {
          canDelete: (...permissions: Permission[]) => permissions.every((permission) => grantedPermissions.has(permission)),
          canEdit: (...permissions: Permission[]) => permissions.every((permission) => grantedPermissions.has(permission)),
          has: (permission: Permission) => grantedPermissions.has(permission),
          hasAll: (permissions: Permission[]) => permissions.every((permission) => grantedPermissions.has(permission)),
          hasAny: (permissions: Permission[]) => permissions.some((permission) => grantedPermissions.has(permission)),
          missing: (permissions: Permission[]) => permissions.filter((permission) => !grantedPermissions.has(permission)),
        },
      },
      { provide: PeopleApiService, useValue: peopleApiStub() },
      { provide: PermissionGrantsApiService, useValue: permissionGrantsApi },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
  }).compileComponents();

  const service = TestBed.inject(PeopleService);
  const selectedPerson = options.selectedPerson ?? linkedPerson();
  service.selectedPerson.set(selectedPerson);
  service.people.set([selectedPerson]);
  service.personForm.reset({
    id: selectedPerson.id,
    name: selectedPerson.name,
    email: selectedPerson.email ?? '',
    secondaryEmails: selectedPerson.secondaryEmails?.join(', ') ?? '',
    phone: selectedPerson.phone ?? '',
    identityDocument: selectedPerson.identityDocument ?? '',
    academicId: selectedPerson.academicId ?? '',
    mergedIntoId: selectedPerson.mergedIntoId ?? '',
    externalRef: selectedPerson.externalRef ?? '',
  });
  service.permissionGrants.set(options.grants ?? []);
  service.permissionGrantDrafts.set(options.drafts ?? []);
  if (options.editingGrant) {
    service.startEditingPermissionGrant(options.editingGrant);
  }

  const fixture = TestBed.createComponent(PeoplePageComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  return {
    auditLog,
    element: fixture.nativeElement as HTMLElement,
    fixture,
    service,
  };
}

function linkedPerson() {
  return createAdminPerson({
    id: 'person-1',
    name: 'Ada Lovelace',
    email: 'ada@example.edu',
    userId: 'user-1',
    user: {
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.edu',
      role: 'access',
    },
  });
}

function permissionGrant(overrides: Partial<EventManagerPermissionGrant> = {}): EventManagerPermissionGrant {
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
    createdById: 'admin-1',
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: 'admin-1',
    ...overrides,
  };
}

function peopleApiStub() {
  return {
    createPerson: vi.fn(),
    deletePerson: vi.fn(),
    getLecturerProfile: vi.fn(),
    getPerson: vi.fn(),
    getPersonLinkedDataSummary: vi.fn(),
    getPersonLinkedResources: vi.fn(),
    listPeople: vi.fn(),
    listPeopleSummaries: vi.fn(() => of([])),
    updatePerson: vi.fn(),
    upsertLecturerProfile: vi.fn(),
  };
}

function buttonByText(element: HTMLElement, text: string): HTMLButtonElement | null {
  return [...element.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) ?? null;
}

function buttonByLabel(element: HTMLElement, label: string): HTMLButtonElement | null {
  return element.querySelector(`button[aria-label="${label}"]`);
}

async function openTab(fixture: ComponentFixture<PeoplePageComponent>, element: HTMLElement, label: string) {
  const tab = [...element.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  tab?.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
