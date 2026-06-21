import { Permission } from '@cacic-fct/shared-permissions';
import { DASHBOARD_PERMISSION_REQUIREMENTS } from './constants';
import { formatPermissions, resolveDashboardPermissions } from './permissions';

describe('dashboard permission helpers', () => {
  it('uses policy-evaluated permissions and sorts them for cache stability', async () => {
    const authorizationPolicy = {
      evaluateGlobalPermissions: jest.fn().mockResolvedValue([Permission.Event.Update, Permission.Certificate.Issue]),
    };
    const authenticatedUser = {
      token: 'token',
      permissionSet: new Set([Permission.Person.Update, Permission.Event.Update]),
    } as never;

    await expect(
      resolveDashboardPermissions(
        authorizationPolicy as never,
        authenticatedUser,
      ),
    ).resolves.toEqual({
      permissions: [Permission.Certificate.Issue, Permission.Event.Update],
      cacheable: true,
    });
    expect(authorizationPolicy.evaluateGlobalPermissions).toHaveBeenCalledWith(authenticatedUser, [
      ...DASHBOARD_PERMISSION_REQUIREMENTS,
    ]);
  });

  it('propagates policy evaluation failures', async () => {
    const authorizationPolicy = {
      evaluateGlobalPermissions: jest.fn().mockRejectedValue(new Error('policy unavailable')),
    };

    await expect(
      resolveDashboardPermissions(
        authorizationPolicy as never,
        {
          token: 'token',
        } as never,
      ),
    ).rejects.toThrow('policy unavailable');
  });

  it('formats known permission resources and actions once per scope', () => {
    expect(
      formatPermissions([
        'event#read',
        'event#create',
        'event#update',
        'event#delete',
        'event#update',
        'major-event#update',
        'event-group#read',
        'certificate#issue',
        'event-attendance#read',
        'event-lecturer#read',
        'person#update',
        'merge-candidate#read',
      ]),
    ).toEqual([
      {
        type: 'certificate',
        label: 'Certificado',
        resourceIcon: 'workspace_premium',
        actions: [{ scope: 'issue', label: 'Emitir', icon: 'workspace_premium' }],
      },
      {
        type: 'event',
        label: 'Evento',
        resourceIcon: 'event',
        actions: [
          { scope: 'read', label: 'Visualizar', icon: 'visibility' },
          { scope: 'create', label: 'Criar', icon: 'add' },
          { scope: 'update', label: 'Atualizar', icon: 'edit' },
          { scope: 'delete', label: 'Excluir', icon: 'delete' },
        ],
      },
      {
        type: 'major-event',
        label: 'Grande evento',
        resourceIcon: 'festival',
        actions: [{ scope: 'update', label: 'Atualizar', icon: 'edit' }],
      },
      {
        type: 'event-group',
        label: 'Grupo de eventos',
        resourceIcon: 'folder',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
      {
        type: 'event-lecturer',
        label: 'Palestrante',
        resourceIcon: 'record_voice_over',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
      },
      {
        type: 'person',
        label: 'Pessoa',
        resourceIcon: 'person',
        actions: [{ scope: 'update', label: 'Atualizar', icon: 'edit' }],
      },
      {
        type: 'merge-candidate',
        label: 'Pessoa duplicada',
        resourceIcon: 'merge_type',
        actions: [{ scope: 'read', label: 'Visualizar', icon: 'visibility' }],
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
        actions: [{ scope: 'approve', label: 'Aprovar', icon: 'check_circle' }],
      },
    ]);
  });
});
