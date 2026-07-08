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

const permissionScopeExpectations = [
  ['read', 'Visualizar', 'visibility'],
  ['create', 'Criar', 'add'],
  ['update', 'Atualizar', 'edit'],
  ['delete', 'Excluir', 'delete'],
  ['collect', 'Coletar', 'fact_check'],
  ['import', 'Importar', 'upload_file'],
  ['approve', 'Aprovar', 'check_circle'],
  ['reject', 'Rejeitar', 'cancel'],
  ['undo', 'Desfazer', 'undo'],
  ['issue', 'Emitir', 'workspace_premium'],
  ['reissue', 'Reemitir', 'sync'],
  ['merge', 'Mesclar', 'merge_type'],
  ['scan', 'Buscar', 'search'],
  ['publish', 'Publicar', 'campaign'],
  ['results', 'Resultados', 'bar_chart'],
  ['export', 'Exportar', 'download'],
  ['custom-action', 'custom-action', 'help'],
] as const;

const permissionResourceExpectations = [
  ['certificate', 'Certificado', 'workspace_premium'],
  ['certificate-config', 'Configuração de certificado', 'workspace_premium'],
  ['event', 'Evento', 'event'],
  ['event-attendance', 'Presenças', 'fact_check'],
  ['event-attendance-collector', 'Coletor de presença', 'fact_check'],
  ['event-group', 'Grupo de eventos', 'folder'],
  ['event-lecturer', 'Palestrante', 'record_voice_over'],
  ['event-form', 'Formulário', 'list_alt'],
  ['frozen', 'Dados congelados', 'lock'],
  ['major-event', 'Grande evento', 'festival'],
  ['merge-candidate', 'Pessoa duplicada', 'merge_type'],
  ['person', 'Pessoa', 'person'],
  ['permission-grant', 'Permissão do Event Manager', 'admin_panel_settings'],
  ['place-preset', 'Local', 'place'],
  ['receipt', 'Comprovante', 'receipt_long'],
  ['subscription', 'Inscrição', 'how_to_reg'],
  ['user', 'Usuário', 'account_circle'],
  ['custom-resource', 'custom-resource', 'shield'],
] as const;

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
    const grantScopes = new Set(Object.values(EventManagerPermissionGrantScope));
    const workspacePermissions = [
      ...WORKSPACE_ENTRY_PERMISSIONS,
      ...WORKSPACE_TAB_PERMISSIONS.flatMap((tab) => [...tab.read, ...tab.edit, ...tab.delete]),
      ...WORKSPACE_PERMISSION_EVALUATION_SET,
      ...DASHBOARD_PERMISSION_REQUIREMENTS,
    ];

    expect(EVENT_MANAGER_PERMISSION_CATALOG).toHaveLength(catalog.size);
    expect(presetPermissions.every((permission) => catalog.has(permission))).toBe(true);
    expect(EVENT_MANAGER_PERMISSION_PRESETS.every((preset) => preset.allowedScopes.length > 0)).toBe(true);
    expect(
      EVENT_MANAGER_PERMISSION_PRESETS.every((preset) => preset.allowedScopes.includes(preset.preferredScope)),
    ).toBe(true);
    expect(
      EVENT_MANAGER_PERMISSION_PRESETS.flatMap((preset) => [...preset.allowedScopes]).every((scope) =>
        grantScopes.has(scope),
      ),
    ).toBe(true);
    expect(workspacePermissions.every((permission) => catalog.has(permission))).toBe(true);
    expect(new Set(WORKSPACE_PERMISSION_EVALUATION_SET)).toEqual(catalog);
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

  it('covers all stable permission formatting labels and icons', () => {
    for (const [scope, label, icon] of permissionScopeExpectations) {
      expect(getPermissionScopeLabel(scope)).toBe(label);
      expect(getPermissionScopeIcon(scope)).toBe(icon);
    }

    for (const [resource, label, icon] of permissionResourceExpectations) {
      expect(getPermissionResourceLabel(resource)).toBe(label);
      expect(getPermissionResourceIcon(resource)).toBe(icon);
    }
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
    expect(getPermissionIncludedData(Permission.Event.Read)).toEqual([]);
    expect(getPermissionIncludedDataSummary(Permission.Event.Read)).toBe('');

    const peopleManager = EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === 'people-manager');
    expect(peopleManager).toEqual(
      expect.objectContaining({
        preferredScope: EventManagerPermissionGrantScope.Global,
        allowedScopes: [EventManagerPermissionGrantScope.Global],
        permissions: expect.arrayContaining([Permission.Person.Delete, Permission.MergeCandidate.Merge]),
      }),
    );
    expect(EVENT_MANAGER_PERMISSION_PRESETS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'event-structure-manager',
          allowedScopes: [EventManagerPermissionGrantScope.MajorEvent],
          permissions: expect.arrayContaining([
            Permission.EventGroup.Create,
            Permission.Event.Create,
            Permission.EventLecturer.Update,
          ]),
        }),
        expect.objectContaining({
          id: 'receipt-reader',
          allowedScopes: [EventManagerPermissionGrantScope.MajorEvent],
          permissions: [Permission.MajorEvent.Read, Permission.Subscription.Read, Permission.Receipt.Read],
        }),
        expect.objectContaining({
          id: 'lecturer-manager',
          allowedScopes: [
            EventManagerPermissionGrantScope.Event,
            EventManagerPermissionGrantScope.MajorEvent,
            EventManagerPermissionGrantScope.EventGroup,
          ],
          permissions: expect.arrayContaining([Permission.EventLecturer.Create, Permission.EventLecturer.Delete]),
        }),
        expect.objectContaining({
          id: 'publication-editor',
          allowedScopes: [EventManagerPermissionGrantScope.MajorEvent],
          permissions: expect.arrayContaining([
            Permission.MajorEvent.Update,
            Permission.EventGroup.Update,
            Permission.Event.Update,
          ]),
        }),
        expect.objectContaining({
          id: 'readonly-operator',
          allowedScopes: [EventManagerPermissionGrantScope.MajorEvent],
          permissions: expect.arrayContaining([
            Permission.EventForm.Read,
            Permission.EventAttendance.Read,
            Permission.Receipt.Read,
          ]),
        }),
      ]),
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
        Permission.EventAttendanceCollector.Create,
        Permission.EventAttendanceCollector.Delete,
        Permission.EventForm.Results,
        Permission.EventForm.Export,
        Permission.Frozen.Update,
        Permission.PermissionGrant.Update,
        Permission.Receipt.Read,
      ]),
    );
  });
});
