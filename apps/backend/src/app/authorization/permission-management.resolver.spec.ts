import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { PermissionManagementResolver } from './permission-management.resolver';

describe('PermissionManagementResolver', () => {
  const management = {
    listRoles: jest.fn(), listGroups: jest.fn(), listScopeTargets: jest.fn(), saveRole: jest.fn(), saveGroup: jest.fn(),
    archiveRole: jest.fn(), archiveGroup: jest.fn(),
  };
  const resolver = new PermissionManagementResolver(management as never);
  const context = { req: { user: { sub: 'actor-1' } } } as never;

  it('delegates role, group, target, save, and archive operations', async () => {
    management.listRoles.mockResolvedValue([]);
    management.listGroups.mockResolvedValue([]);
    management.listScopeTargets.mockResolvedValue([]);
    management.saveRole.mockResolvedValue({ id: 'role-1' });
    management.saveGroup.mockResolvedValue({ id: 'group-1' });
    management.archiveRole.mockResolvedValue(true);
    management.archiveGroup.mockResolvedValue(true);

    await expect(resolver.permissionRoles()).resolves.toEqual([]);
    await expect(resolver.permissionGroups()).resolves.toEqual([]);
    await expect(resolver.permissionScopeTargets('GLOBAL' as never)).resolves.toEqual([]);
    await expect(resolver.savePermissionRole({} as never, context)).resolves.toEqual({ id: 'role-1' });
    await expect(resolver.savePermissionGroup({} as never, context)).resolves.toEqual({ id: 'group-1' });
    await expect(resolver.archivePermissionRole('role-1', context)).resolves.toBe(true);
    await expect(resolver.archivePermissionGroup('group-1', context)).resolves.toBe(true);
  });

  it('protects every operation with permission-management grants', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PermissionManagementResolver.prototype.permissionRoles))
      .toEqual([Permission.PermissionGrant.Read]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PermissionManagementResolver.prototype.savePermissionRole))
      .toEqual([]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PermissionManagementResolver.prototype.archivePermissionGroup))
      .toEqual([Permission.PermissionGrant.Delete]);
  });
});
