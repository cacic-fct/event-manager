import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { Permission, WORKSPACE_TAB_PERMISSIONS } from '@cacic-fct/shared-permissions';
import { canCreateContextGuard } from '../app-shell/access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { canCreateEventContext } from './event-context-access';

describe('context creation access', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hides and rejects event creation when only the containing group is readable', async () => {
    const grants = new Set<Permission>([Permission.EventGroup.Read, Permission.Event.Create]);
    const permissions = {
      has: (permission: Permission) => grants.has(permission),
      evaluateWorkspacePermissions: vi.fn(async () => undefined),
    };
    const { guardRedirect } = configureGuard(permissions);
    expect(canCreateEventContext(permissions, 'event')).toBe(false);
    expect(await TestBed.runInInjectionContext(() => canCreateContextGuard({ path: 'event-workspace/new/event' }))).toBe(false);
    expect(guardRedirect).toHaveBeenCalledWith(403);
  });

  it('accepts creation once the matching editor can load its required data', async () => {
    const grants = new Set<Permission>([Permission.Event.Create, ...(WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === 'events')?.read ?? [])]);
    const permissions = {
      has: (permission: Permission) => grants.has(permission),
      evaluateWorkspacePermissions: vi.fn(async () => undefined),
    };
    const { guardRedirect } = configureGuard(permissions);
    expect(canCreateEventContext(permissions, 'event')).toBe(true);
    expect(await TestBed.runInInjectionContext(() => canCreateContextGuard({ path: 'event-workspace/new/event' }))).toBe(true);
    expect(guardRedirect).not.toHaveBeenCalled();
    grants.delete(Permission.Event.Create);
    expect(canCreateEventContext(permissions, 'event')).toBe(false);
  });

  function configureGuard(permissions: {
    has(permission: Permission): boolean;
    evaluateWorkspacePermissions(): Promise<void>;
  }) {
    const guardRedirect = vi.fn(() => false);
    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionsService, useValue: permissions },
        { provide: AuthService, useValue: { ensureAuthenticated: vi.fn().mockResolvedValue(true) } },
        { provide: RouteErrorService, useValue: { guardRedirect } },
        { provide: Router, useValue: { currentNavigation: () => null, url: '/' } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    return { guardRedirect };
  }
});
