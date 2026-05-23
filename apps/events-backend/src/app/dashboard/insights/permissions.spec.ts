import { formatPermissions, resolveDashboardPermissions } from './permissions';

describe('dashboard permission helpers', () => {
  it('merges authenticated and evaluated permissions and sorts them for cache stability', async () => {
    const keycloakAuthService = {
      evaluateAccessTokenPermissions: jest.fn().mockResolvedValue(['event#edit', 'certificate#edit']),
    };

    await expect(
      resolveDashboardPermissions(keycloakAuthService as never, {
        token: 'token',
        permissionSet: new Set(['person#manage', 'event#edit']),
      } as never),
    ).resolves.toEqual({
      permissions: ['certificate#edit', 'event#edit', 'person#manage'],
      cacheable: true,
    });
    expect(keycloakAuthService.evaluateAccessTokenPermissions).toHaveBeenCalledWith('token', [
      'event#edit',
      'major-event#edit',
      'certificate#edit',
      'merge-candidate#read',
      'validate-receipt:read',
    ]);
  });

  it('falls back to authenticated permissions without caching when evaluation fails', async () => {
    const keycloakAuthService = {
      evaluateAccessTokenPermissions: jest.fn().mockRejectedValue(new Error('UMA unavailable')),
    };

    await expect(
      resolveDashboardPermissions(keycloakAuthService as never, {
        token: 'token',
        permissionSet: new Set(['major-event#edit', 'event#edit']),
      } as never),
    ).resolves.toEqual({
      permissions: ['event#edit', 'major-event#edit'],
      cacheable: false,
    });
  });

  it('formats known permission resources and actions once per scope', () => {
    expect(
      formatPermissions([
        'event#read',
        'event#create',
        'event#edit',
        'event#update',
        'event#delete',
        'event#manage',
        'event#edit',
        'major-event#edit',
        'event-group#read',
        'certificate#edit',
        'event-attendance#read',
        'event-lecturer#read',
        'person#manage',
        'merge-candidate#read',
      ]),
    ).toEqual([
      {
        type: 'certificate',
        label: 'Certificado',
        resourceIcon: 'workspace_premium',
        actions: [{ scope: 'edit', label: 'Editar', icon: 'edit' }],
      },
      {
        type: 'event',
        label: 'Evento',
        resourceIcon: 'event',
        actions: [
          { scope: 'read', label: 'Visualizar', icon: 'visibility' },
          { scope: 'create', label: 'Criar', icon: 'add' },
          { scope: 'edit', label: 'Editar', icon: 'edit' },
          { scope: 'update', label: 'Editar', icon: 'edit' },
          { scope: 'delete', label: 'Excluir', icon: 'delete' },
          { scope: 'manage', label: 'Gerenciar', icon: 'admin_panel_settings' },
        ],
      },
      {
        type: 'major-event',
        label: 'Grande evento',
        resourceIcon: 'festival',
        actions: [{ scope: 'edit', label: 'Editar', icon: 'edit' }],
      },
      {
        type: 'event-group',
        label: 'Grupo de eventos',
        resourceIcon: 'groups',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
      {
        type: 'event-lecturer',
        label: 'Palestrante',
        resourceIcon: 'record_voice_over',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
      {
        type: 'merge-candidate',
        label: 'Pessoa duplicada',
        resourceIcon: 'merge',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
      {
        type: 'person',
        label: 'Pessoas',
        resourceIcon: 'person',
        actions: [{ scope: 'manage', label: 'Gerenciar', icon: 'admin_panel_settings' }],
      },
      {
        type: 'event-attendance',
        label: 'Presenças',
        resourceIcon: 'fact_check',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
    ]);
  });

  it('keeps unknown resources and actions readable', () => {
    expect(formatPermissions(['custom-resource', 'other-resource#approve'])).toEqual([
      {
        type: 'custom-resource',
        label: 'custom-resource',
        resourceIcon: 'shield',
        actions: [{ scope: 'unknown', label: 'unknown', icon: 'help' }],
      },
      {
        type: 'other-resource',
        label: 'other-resource',
        resourceIcon: 'shield',
        actions: [{ scope: 'approve', label: 'approve', icon: 'help' }],
      },
    ]);
  });
});
