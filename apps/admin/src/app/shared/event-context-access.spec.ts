import { TestBed } from '@angular/core/testing';
import { Permission, WORKSPACE_TAB_PERMISSIONS } from '@cacic-fct/shared-permissions';
import { canCreateContextGuard } from '../app-shell/access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { canCreateEventContext } from './event-context-access';

describe('context creation access', () => {
  it('hides and rejects event creation when only the containing group is readable', async () => {
    const grants = new Set<Permission>([Permission.EventGroup.Read, Permission.Event.Create]);
    const permissions = { has: (permission: Permission) => grants.has(permission), evaluateWorkspacePermissions: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: PermissionsService, useValue: permissions }] });
    expect(canCreateEventContext(permissions, 'event')).toBe(false);
    expect(await TestBed.runInInjectionContext(() => canCreateContextGuard({ path: 'event-workspace/new/event' }))).toBe(false);
  });

  it('accepts creation once the matching editor can load its required data', async () => {
    const grants = new Set<Permission>([Permission.Event.Create, ...(WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === 'events')?.read ?? [])]);
    const permissions = { has: (permission: Permission) => grants.has(permission), evaluateWorkspacePermissions: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: PermissionsService, useValue: permissions }] });
    expect(canCreateEventContext(permissions, 'event')).toBe(true);
    expect(await TestBed.runInInjectionContext(() => canCreateContextGuard({ path: 'event-workspace/new/event' }))).toBe(true);
    grants.delete(Permission.Event.Create);
    expect(canCreateEventContext(permissions, 'event')).toBe(false);
  });
});
