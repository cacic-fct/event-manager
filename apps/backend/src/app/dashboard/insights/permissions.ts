import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { DashboardPermissionGroup } from '../models';
import { DASHBOARD_PERMISSION_REQUIREMENTS } from './constants';

export async function resolveDashboardPermissions(
  keycloakAuthService: KeycloakAuthService,
  authenticatedUser: AuthenticatedUser,
): Promise<{
  permissions: string[];
  cacheable: boolean;
}> {
  const permissions = new Set(authenticatedUser.permissionSet);

  try {
    const grantedPermissions = await keycloakAuthService.evaluateAccessTokenPermissions(
      authenticatedUser.token,
      [...DASHBOARD_PERMISSION_REQUIREMENTS],
    );
    for (const permission of grantedPermissions) {
      permissions.add(permission);
    }
    return {
      permissions: [...permissions].sort(),
      cacheable: true,
    };
  } catch {
    // Dashboard calendar is permission-independent. If UMA evaluation is
    // temporarily unavailable, keep serving the non-personalized insights
    // instead of failing or caching a request-order dependent permission set.
    return {
      permissions: [...permissions].sort(),
      cacheable: false,
    };
  }
}

export function formatPermissions(permissions: string[]): DashboardPermissionGroup[] {
  const groupedPermissions = new Map<string, DashboardPermissionGroup>();

  for (const permission of permissions) {
    const [resource, action = 'unknown'] = permission.split('#');
    let group = groupedPermissions.get(resource);
    if (!group) {
      group = {
        type: resource,
        label: getFormattedResource(resource),
        resourceIcon: getResourceIcon(resource),
        actions: [],
      };
      groupedPermissions.set(resource, group);
    }

    if (!group.actions.some((entry) => entry.scope === action)) {
      group.actions.push({
        scope: action,
        label: getFormattedAction(action),
        icon: getActionIcon(action),
      });
    }
  }

  return [...groupedPermissions.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function getFormattedAction(action: string): string {
  switch (action) {
    case 'read':
      return 'Visualizar';
    case 'create':
      return 'Criar';
    case 'edit':
    case 'update':
      return 'Editar';
    case 'delete':
      return 'Excluir';
    case 'manage':
      return 'Gerenciar';
    default:
      return action;
  }
}

function getFormattedResource(resource: string): string {
  switch (resource) {
    case 'event':
      return 'Evento';
    case 'major-event':
      return 'Grande evento';
    case 'event-group':
      return 'Grupo de eventos';
    case 'certificate':
      return 'Certificado';
    case 'event-attendance':
      return 'Presenças';
    case 'event-lecturer':
      return 'Palestrante';
    case 'person':
      return 'Pessoas';
    case 'merge-candidate':
      return 'Pessoa duplicada';
    default:
      return resource;
  }
}

function getResourceIcon(type: string): string {
  switch (type) {
    case 'event':
      return 'event';
    case 'major-event':
      return 'festival';
    case 'event-group':
      return 'groups';
    case 'certificate':
      return 'workspace_premium';
    case 'event-lecturer':
      return 'record_voice_over';
    case 'event-attendance':
      return 'fact_check';
    case 'person':
      return 'person';
    case 'merge-candidate':
      return 'merge';
    default:
      return 'shield';
  }
}

function getActionIcon(action: string): string {
  switch (action) {
    case 'read':
      return 'visibility';
    case 'create':
      return 'add';
    case 'edit':
    case 'update':
      return 'edit';
    case 'delete':
      return 'delete';
    case 'manage':
      return 'admin_panel_settings';
    default:
      return 'help';
  }
}
