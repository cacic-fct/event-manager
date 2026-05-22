import { PLATFORM_ID, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { WorkspacePermissionsService, WorkspacePermissionTab } from './workspace-permissions.service';

describe('WorkspacePermissionsService', () => {
  let user: ReturnType<typeof signal>;
  let service: WorkspacePermissionsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    user = signal({
      claims: {
        permissions: [' event#read ', 'person#read', 'event-lecturer#read'],
        authorization: {
          permissions: [
            {
              rsname: 'event',
              scopes: ['edit', 'delete'],
            },
            {
              resource_name: 'major-event',
              scopes: ['read'],
            },
          ],
        },
      },
      permissions: ['certificate#read', 'validate-receipt:read'],
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspacePermissionsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user } },
      ],
    });

    service = TestBed.inject(WorkspacePermissionsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('extracts normalized permissions from user claims and authorization claims', () => {
    expect(service.has('event#read')).toBe(true);
    expect(service.has('event#edit')).toBe(true);
    expect(service.has('event#delete')).toBe(true);
    expect(service.has('major-event#read')).toBe(true);
    expect(service.rawPermissions()).toEqual(
      expect.arrayContaining(['event#read', 'event#edit', 'event#delete', 'major-event#read', 'certificate#read']),
    );
  });

  it('reports missing permissions and tab readability', () => {
    expect(service.hasAll(['event#read', 'person#read'])).toBe(true);
    expect(service.missing(['event#read', 'event-attendance#read', 'event-attendance#read'])).toEqual([
      'event-attendance#read',
    ]);
    expect(service.canReadTab(WorkspacePermissionTab.Events)).toBe(true);
    expect(service.canReadTab(WorkspacePermissionTab.Attendances)).toBe(false);
    expect(service.missingReadForTab(WorkspacePermissionTab.Attendances)).toEqual([
      'event-attendance#read',
    ]);
  });

  it('evaluates workspace permissions once and merges server-granted permissions', async () => {
    const evaluationPromise = service.evaluateWorkspacePermissions();
    const request = httpTesting.expectOne('/api/auth/permissions/evaluate');
    expect(request.request.body.permissions).toContain('subscription#read');
    request.flush({ permissions: ['event-attendance#read', 'subscription#read'] });
    await evaluationPromise;

    expect(service.has('event-attendance#read')).toBe(true);
    expect(service.has('subscription#read')).toBe(true);

    await service.evaluateWorkspacePermissions();
    httpTesting.expectNone('/api/auth/permissions/evaluate');
  });
});
