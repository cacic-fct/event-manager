import {
  DASHBOARD_PERMISSION_REQUIREMENTS,
  EVENT_MANAGER_PERMISSION_CATALOG,
  EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS,
  EVENT_MANAGER_PERMISSION_PRESETS,
  EVENT_MANAGER_PERMISSION_SET,
  EventManagerPermissionGrantScope,
  Permission,
  WORKSPACE_ENTRY_PERMISSIONS,
  WORKSPACE_PERMISSION_EVALUATION_SET,
  WORKSPACE_TAB_PERMISSIONS,
  WorkspacePermissionTab,
  formatPermissionGroups,
  getPermissionIncludedData,
  getPermissionIncludedDataSummary,
  getPermissionResourceIcon,
  getPermissionResourceLabel,
  getPermissionScopeIcon,
  getPermissionScopeLabel,
  parsePermission,
  requiresGlobalPermissionGrantScope,
} from './shared-permissions';

describe('shared permissions contract', () => {
  it('keeps catalog, scope rules, and barrel exports in sync', () => {
    expect(Permission.EventForm.Export).toBe('event-form#export');
    expect(EVENT_MANAGER_PERMISSION_CATALOG).toContain(Permission.PermissionGrant.Update);
    expect(EVENT_MANAGER_PERMISSION_SET.has(Permission.Frozen.Delete)).toBe(true);
    expect(requiresGlobalPermissionGrantScope(Permission.Person.Delete)).toBe(true);
    expect(requiresGlobalPermissionGrantScope(Permission.EventAttendance.Collect)).toBe(false);
  });

  it('keeps split permission sets complete and deduplicated', () => {
    const catalog = new Set(EVENT_MANAGER_PERMISSION_CATALOG);
    const presetPermissions = EVENT_MANAGER_PERMISSION_PRESETS.flatMap((preset) => [...preset.permissions]);
    const workspacePermissions = [
      ...WORKSPACE_ENTRY_PERMISSIONS,
      ...WORKSPACE_TAB_PERMISSIONS.flatMap((tab) => [...tab.read, ...tab.edit, ...tab.delete]),
      ...WORKSPACE_PERMISSION_EVALUATION_SET,
      ...DASHBOARD_PERMISSION_REQUIREMENTS,
    ];

    expect(EVENT_MANAGER_PERMISSION_CATALOG).toHaveLength(catalog.size);
    expect(presetPermissions.every((permission) => catalog.has(permission))).toBe(true);
    expect(workspacePermissions.every((permission) => catalog.has(permission))).toBe(true);
    expect(EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS.every((permission) => catalog.has(permission))).toBe(true);
  });

  it('formats permission groups with stable labels, icons, and duplicate removal', () => {
    const groups = formatPermissionGroups([
      Permission.EventAttendance.Collect,
      Permission.EventAttendance.Read,
      Permission.EventAttendance.Collect,
      Permission.EventForm.Publish,
      'custom-resource#custom-action',
      'malformed',
    ]);

    expect(parsePermission(Permission.EventAttendance.Collect)).toEqual({
      resource: 'event-attendance',
      scope: 'collect',
    });
    expect(parsePermission('')).toEqual({ resource: 'unknown', scope: 'unknown' });
    expect(getPermissionScopeLabel('collect')).toBe('Coletar');
    expect(getPermissionScopeIcon('publish')).toBe('campaign');
    expect(getPermissionResourceLabel('event-form')).toBe('Formulário');
    expect(getPermissionResourceIcon('permission-grant')).toBe('admin_panel_settings');
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'event-attendance',
          label: 'Presenças',
          actions: [
            expect.objectContaining({ scope: 'collect', label: 'Coletar' }),
            expect.objectContaining({ scope: 'read', label: 'Visualizar' }),
          ],
        }),
        expect.objectContaining({
          type: 'event-form',
          resourceIcon: 'list_alt',
          actions: [expect.objectContaining({ scope: 'publish', icon: 'campaign' })],
        }),
        expect.objectContaining({
          type: 'custom-resource',
          label: 'custom-resource',
          actions: [expect.objectContaining({ scope: 'custom-action', label: 'custom-action' })],
        }),
      ]),
    );
    expect(groups.find((group) => group.type === 'event-attendance')?.actions).toHaveLength(2);
  });

  it('documents included data and preset permission bundles', () => {
    expect(getPermissionIncludedData(Permission.Receipt.Read)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Contexto de inscrição e comprovante',
          fields: expect.arrayContaining(['imagem do comprovante', 'histórico de validação']),
        }),
      ]),
    );
    expect(getPermissionIncludedDataSummary(Permission.Certificate.Read)).toContain(
      'Dados limitados da pessoa certificada',
    );

    const peopleManager = EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === 'people-manager');
    expect(peopleManager).toEqual(
      expect.objectContaining({
        preferredScope: EventManagerPermissionGrantScope.Global,
        permissions: expect.arrayContaining([Permission.Person.Delete, Permission.MergeCandidate.Merge]),
      }),
    );
    expect(DASHBOARD_PERMISSION_REQUIREMENTS).toEqual(
      expect.arrayContaining([Permission.Certificate.Issue, Permission.Receipt.Approve]),
    );
  });

  it('keeps workspace tabs and evaluation permissions aligned', () => {
    const permissionsTab = WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === WorkspacePermissionTab.Permissions);
    const dashboardTab = WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === WorkspacePermissionTab.Dashboard);
    const preferencesTab = WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === WorkspacePermissionTab.Preferences);

    expect(permissionsTab).toEqual(
      expect.objectContaining({
        read: [Permission.PermissionGrant.Read, Permission.Person.Read],
        edit: expect.arrayContaining([Permission.PermissionGrant.Create, Permission.PermissionGrant.Delete]),
      }),
    );
    expect(preferencesTab).toEqual(
      expect.objectContaining({
        read: [],
        edit: [],
        delete: [],
      }),
    );
    expect(dashboardTab).toEqual(
      expect.objectContaining({
        read: [],
        edit: [],
        delete: [],
      }),
    );
    expect(WORKSPACE_PERMISSION_EVALUATION_SET).toEqual(
      expect.arrayContaining([
        Permission.Event.Read,
        Permission.Frozen.Update,
        Permission.PermissionGrant.Update,
        Permission.Receipt.Read,
      ]),
    );
  });
});
