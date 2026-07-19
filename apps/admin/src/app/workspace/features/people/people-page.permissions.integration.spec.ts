import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { EventManagerPermissionGrant, EventManagerPermissionGrantInput, EventManagerPermissionGrantTarget, EventManagerPermissionGrantUpdateInput } from '@cacic-fct/event-manager-admin-contracts';
import { EventManagerKeycloakRole, EventManagerPermissionGrantScope, Permission } from '@cacic-fct/shared-permissions';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionGrantsApiService } from '../../../graphql/permission-grants-api.service';
import { PeopleApiService } from '../../../graphql/people-api.service';
import { createAdminPerson } from '../../../testing/admin-entity-fixtures';
import { WorkspaceAuditLogService } from '../../data-access/audit-logs/audit-log.service';
import { WorkspacePeopleService } from '../../data-access/people/people.service';
import { WorkspacePermissionsService } from '../../data-access/permissions/permissions.service';
import { PeoplePageComponent } from './people-page.component';

describe('PeoplePageComponent permission grants integration', () => {
  let fixture: ComponentFixture<PeoplePageComponent>;
  let element: HTMLElement;
  let service: WorkspacePeopleService;
  let permissionGrantsApi: {
    createGrant: ReturnType<typeof vi.fn>;
    deleteGrant: ReturnType<typeof vi.fn>;
    listTargets: ReturnType<typeof vi.fn>;
    listUserGrants: ReturnType<typeof vi.fn>;
    updateGrant: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const person = linkedPerson();
    permissionGrantsApi = {
      createGrant: vi.fn((input: EventManagerPermissionGrantInput) =>
        of(permissionGrant({ ...input, id: `grant-${input.permission}`, targetLabel: 'Oficina de Angular' })),
      ),
      deleteGrant: vi.fn(() => of({ deleted: true, id: 'grant-1' })),
      listTargets: vi.fn((scope: EventManagerPermissionGrantScope) => of(permissionGrantTargets(scope))),
      listUserGrants: vi.fn(() => of([permissionGrant()])),
      updateGrant: vi.fn((id: string, input: EventManagerPermissionGrantUpdateInput) =>
        of(permissionGrant({ ...input, id, targetLabel: input.eventId ? 'Oficina de Angular' : null })),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [PeoplePageComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ personId: person.id })) } },
        { provide: AuthService, useValue: { roles: signal<string[]>([EventManagerKeycloakRole.SuperAdmin]) } },
        { provide: WorkspaceAuditLogService, useValue: { openHistory: vi.fn(), openEventAttendanceHistory: vi.fn() } },
        {
          provide: WorkspacePermissionsService,
          useValue: {
            canDelete: () => true,
            canEdit: () => true,
            has: () => true,
            hasAll: () => true,
            hasAny: () => true,
            missing: () => [],
          },
        },
        {
          provide: PeopleApiService,
          useValue: {
            createPerson: vi.fn(),
            deletePerson: vi.fn(),
            getLecturerProfile: vi.fn(),
            getPerson: vi.fn(() => of(person)),
            getPersonLinkedDataSummary: vi.fn(),
            getPersonLinkedResources: vi.fn(),
            listPeople: vi.fn(),
            listPeopleSummaries: vi.fn(() => of([person])),
            updatePerson: vi.fn(),
            upsertLecturerProfile: vi.fn(),
          },
        },
        { provide: PermissionGrantsApiService, useValue: permissionGrantsApi },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspacePeopleService);
    fixture = TestBed.createComponent(PeoplePageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    await openTab(fixture, element, 'Permissões');
  });

  it('loads the route person, existing grants, and permission targets together', () => {
    expect(service.selectedPerson()?.id).toBe('person-1');
    expect(permissionGrantsApi.listUserGrants).toHaveBeenCalledWith('user-1');
    expect(permissionGrantsApi.listTargets).toHaveBeenCalledTimes(3);
    expect(element.textContent).toContain('Permissões do Event Manager');
    expect(element.textContent).toContain('Evento · Visualizar');
    expect(element.textContent).toContain('Global · Todos os eventos');
  });

  it('stages scoped grants from the section and saves them through the permission API', async () => {
    service.permissionGrantForm.controls.category.setValue('event-attendance');
    service.permissionGrantForm.controls.permissions.setValue([Permission.EventAttendance.Collect]);
    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);
    service.selectPermissionGrantTarget('event-1');
    fixture.detectChanges();

    buttonByText(element, 'Adicionar permissões', { exact: true })?.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('Permissões em revisão');
    expect(element.textContent).toContain('Oficina de Angular');

    buttonByText(element, 'Salvar permissões', { exact: true })?.click();
    await flushPromises();
    fixture.detectChanges();

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
    expect(element.textContent).toContain('Presenças · Coletar');
  });

  it('applies preset scope restrictions before staging preset grants from the section', async () => {
    service.permissionGrantForm.controls.presetId.setValue('receipt-reader');
    fixture.detectChanges();

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.MajorEvent);
    expect(service.permissionGrantAvailableScopes()).toEqual([
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Global, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.Event, disabled: true }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.MajorEvent, disabled: false }),
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.EventGroup, disabled: true }),
    ]);

    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);
    fixture.detectChanges();

    expect(service.permissionGrantScope()).toBe(EventManagerPermissionGrantScope.MajorEvent);

    service.selectPermissionGrantTarget('major-event-1');
    buttonByText(element, 'Adicionar permissões do preset')?.click();
    fixture.detectChanges();

    expect(service.permissionGrantDrafts().map((draft) => draft.permission)).toEqual([
      Permission.MajorEvent.Read,
      Permission.Subscription.Read,
      Permission.Receipt.Read,
    ]);
    expect(element.textContent).toContain('Comprovante · Visualizar');
    expect(element.textContent).toContain('Grande evento · Semana da Computação');

    buttonByText(element, 'Salvar permissões', { exact: true })?.click();
    await flushPromises();
    fixture.detectChanges();

    expect(permissionGrantsApi.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.Receipt.Read,
        scope: EventManagerPermissionGrantScope.MajorEvent,
        majorEventId: 'major-event-1',
      }),
    );
  });

  it('edits and deletes existing grants through the section action buttons', async () => {
    buttonByLabel(element, 'Editar permissão')?.click();
    fixture.detectChanges();

    service.permissionGrantForm.controls.permission.setValue(Permission.EventAttendance.Collect);
    service.setPermissionGrantScope(EventManagerPermissionGrantScope.Event);
    service.selectPermissionGrantTarget('event-1');
    fixture.detectChanges();

    buttonByText(element, 'Salvar permissão', { exact: true })?.click();
    await flushPromises();
    fixture.detectChanges();

    expect(permissionGrantsApi.updateGrant).toHaveBeenCalledWith('grant-1', {
      permission: Permission.EventAttendance.Collect,
      scope: EventManagerPermissionGrantScope.Event,
      eventId: 'event-1',
      majorEventId: null,
      eventGroupId: null,
      validFrom: null,
      validUntil: null,
    });
    expect(service.editingPermissionGrant()).toBeNull();

    buttonByLabel(element, 'Remover permissão')?.click();
    await flushPromises();
    fixture.detectChanges();

    expect(permissionGrantsApi.deleteGrant).toHaveBeenCalledWith('grant-1');
    expect(element.textContent).toContain('Nenhuma permissão concedida');
  });
});

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

function permissionGrantTargets(scope: EventManagerPermissionGrantScope): EventManagerPermissionGrantTarget[] {
  if (scope === EventManagerPermissionGrantScope.Event) {
    return [
      {
        id: 'event-1',
        label: 'Oficina de Angular',
        description: 'Laboratório 1',
        emoji: 'computer',
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-01T14:00:00.000Z',
      },
    ];
  }

  if (scope === EventManagerPermissionGrantScope.MajorEvent) {
    return [
      {
        id: 'major-event-1',
        label: 'Semana da Computação',
        description: 'Grande evento',
        emoji: 'computer',
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-05T14:00:00.000Z',
      },
    ];
  }

  return [];
}

function buttonByText(
  element: HTMLElement,
  text: string,
  options: { exact?: boolean } = {},
): HTMLButtonElement | null {
  return (
    [...element.querySelectorAll('button')].find((button) => {
      const buttonText = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return options.exact ? buttonText.endsWith(text) && buttonText !== `auto_awesome ${text} do preset` : buttonText.includes(text);
    }) ?? null
  );
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
