import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  EVENT_MANAGER_PERMISSION_CATALOG,
  Permission,
  WorkspacePermissionTab,
  formatPermissionGroups,
  getPermissionIncludedDataSummary,
  parsePermission,
  requiresGlobalPermissionGrantScope,
} from '@cacic-fct/shared-permissions';
import { WorkspacePermissionsService } from './permissions.service';

describe('WorkspacePermissionsService', () => {
  let service: WorkspacePermissionsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspacePermissionsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(WorkspacePermissionsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('starts without trusting Keycloak permission claims', () => {
    expect(service.has(Permission.Event.Read)).toBe(false);
    expect(service.has(Permission.Event.Update)).toBe(false);
    expect(service.rawPermissions()).toEqual([]);
  });

  it('reports missing permissions and tab readability', () => {
    expect(service.hasAll([Permission.Event.Read, Permission.Person.Read])).toBe(false);
    expect(service.hasAny([Permission.Event.Create, Permission.Event.Update])).toBe(false);
    expect(service.missing([Permission.Event.Read, Permission.EventAttendance.Read, Permission.EventAttendance.Read])).toEqual([
      Permission.Event.Read,
      Permission.EventAttendance.Read,
    ]);
    expect(service.canReadTab(WorkspacePermissionTab.Events)).toBe(false);
    expect(service.canReadTab(WorkspacePermissionTab.Places)).toBe(false);
    expect(service.canReadTab(WorkspacePermissionTab.Attendances)).toBe(false);
    expect(service.canReadTab(WorkspacePermissionTab.Dashboard)).toBe(true);
    expect(service.canReadTab(WorkspacePermissionTab.Preferences)).toBe(true);
    expect(service.missingReadForTab(WorkspacePermissionTab.Attendances)).toEqual([
      Permission.EventAttendance.Read,
      Permission.Event.Read,
      Permission.MajorEvent.Read,
    ]);
    expect(service.missingReadForTab(WorkspacePermissionTab.Preferences)).toEqual([]);
    expect(service.missingReadForTab(WorkspacePermissionTab.Dashboard)).toEqual([]);
    expect(service.missingReadForTab(WorkspacePermissionTab.Subscriptions)).not.toContain(Permission.Person.Read);
    expect(service.missingReadForTab(WorkspacePermissionTab.Certificates)).not.toContain(Permission.Person.Read);
  });

  it('documents limited related person data without broad person permission inheritance', () => {
    expect(getPermissionIncludedDataSummary(Permission.EventAttendance.Read)).toContain('Dados limitados da pessoa presente');
    expect(getPermissionIncludedDataSummary(Permission.Subscription.Read)).toContain('Dados limitados da pessoa inscrita');
    expect(getPermissionIncludedDataSummary(Permission.Receipt.Read)).toContain('Dados limitados da pessoa inscrita');
    expect(getPermissionIncludedDataSummary(Permission.Certificate.Read)).toContain('Dados limitados da pessoa certificada');
  });

  it('keeps shared permission formatting and grant scope rules available to admin code', () => {
    expect(parsePermission(Permission.EventAttendance.Collect)).toEqual({
      resource: 'event-attendance',
      scope: 'collect',
    });
    expect(requiresGlobalPermissionGrantScope(Permission.Person.Delete)).toBe(true);
    expect(requiresGlobalPermissionGrantScope(Permission.EventAttendance.Collect)).toBe(false);

    const groups = formatPermissionGroups([
      Permission.EventAttendance.Read,
      Permission.EventAttendance.Collect,
      Permission.EventAttendance.Collect,
      Permission.EventForm.Publish,
    ]);

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'event-attendance',
          label: 'Presenças',
          actions: [
            expect.objectContaining({ scope: 'read', label: 'Visualizar' }),
            expect.objectContaining({ scope: 'collect', label: 'Coletar' }),
          ],
        }),
        expect.objectContaining({
          type: 'event-form',
          actions: [expect.objectContaining({ scope: 'publish', label: 'Publicar' })],
        }),
      ]),
    );
    expect(EVENT_MANAGER_PERMISSION_CATALOG).toContain(Permission.PermissionGrant.Update);
  });

  it('evaluates workspace permissions once from the backend authority', async () => {
    const evaluationPromise = service.evaluateWorkspacePermissions();
    const request = httpTesting.expectOne('/api/auth/permissions/evaluate');
    expect(request.request.body.permissions).toContain(Permission.Subscription.Read);
    expect(request.request.body.permissions).toContain(Permission.EventForm.Results);
    expect(request.request.body.permissions).toContain(Permission.EventForm.Export);
    expect(new Set(request.request.body.permissions)).toEqual(new Set(EVENT_MANAGER_PERMISSION_CATALOG));
    request.flush({ permissions: [Permission.EventAttendance.Read, Permission.Subscription.Read, 'unknown#value'] });
    await evaluationPromise;

    expect(service.has(Permission.EventAttendance.Read)).toBe(true);
    expect(service.has(Permission.Subscription.Read)).toBe(true);
    expect(service.rawPermissions()).toEqual([Permission.EventAttendance.Read, Permission.Subscription.Read]);

    await service.evaluateWorkspacePermissions();
    httpTesting.expectNone('/api/auth/permissions/evaluate');
  });
});
