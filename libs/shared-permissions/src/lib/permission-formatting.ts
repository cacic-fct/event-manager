export type PermissionGroup = {
  type: string;
  label: string;
  resourceIcon: string;
  actions: {
    scope: string;
    label: string;
    icon: string;
  }[];
};

export function formatPermissionGroups(permissions: readonly string[]): PermissionGroup[] {
  const groupedPermissions = new Map<string, PermissionGroup>();

  for (const permission of permissions) {
    const { resource, scope } = parsePermission(permission);
    let group = groupedPermissions.get(resource);
    if (!group) {
      group = {
        type: resource,
        label: getPermissionResourceLabel(resource),
        resourceIcon: getPermissionResourceIcon(resource),
        actions: [],
      };
      groupedPermissions.set(resource, group);
    }

    if (!group.actions.some((entry) => entry.scope === scope)) {
      group.actions.push({
        scope,
        label: getPermissionScopeLabel(scope),
        icon: getPermissionScopeIcon(scope),
      });
    }
  }

  return [...groupedPermissions.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function parsePermission(permission: string): { resource: string; scope: string } {
  const [resource, scope = 'unknown'] = permission.split('#');

  return {
    resource: resource || 'unknown',
    scope,
  };
}

export function getPermissionScopeLabel(scope: string): string {
  switch (scope) {
    case 'read':
      return 'Visualizar';
    case 'create':
      return 'Criar';
    case 'update':
      return 'Atualizar';
    case 'delete':
      return 'Excluir';
    case 'collect':
      return 'Coletar';
    case 'import':
      return 'Importar';
    case 'approve':
      return 'Aprovar';
    case 'reject':
      return 'Rejeitar';
    case 'undo':
      return 'Desfazer';
    case 'issue':
      return 'Emitir';
    case 'reissue':
      return 'Reemitir';
    case 'merge':
      return 'Mesclar';
    case 'scan':
      return 'Buscar';
    case 'publish':
      return 'Publicar';
    case 'results':
      return 'Resultados';
    case 'export':
      return 'Exportar';
    default:
      return scope;
  }
}

export function getPermissionResourceLabel(resource: string): string {
  switch (resource) {
    case 'certificate':
      return 'Certificado';
    case 'certificate-config':
      return 'Configuração de certificado';
    case 'event':
      return 'Evento';
    case 'event-attendance':
      return 'Presenças';
    case 'event-attendance-collector':
      return 'Coletor de presença';
    case 'event-group':
      return 'Grupo de eventos';
    case 'event-lecturer':
      return 'Palestrante';
    case 'event-form':
      return 'Formulário';
    case 'frozen':
      return 'Dados congelados';
    case 'major-event':
      return 'Grande evento';
    case 'merge-candidate':
      return 'Pessoa duplicada';
    case 'person':
      return 'Pessoa';
    case 'permission-grant':
      return 'Permissão do Event Manager';
    case 'place-preset':
      return 'Local';
    case 'receipt':
      return 'Comprovante';
    case 'subscription':
      return 'Inscrição';
    case 'user':
      return 'Usuário';
    default:
      return resource;
  }
}

export function getPermissionResourceIcon(resource: string): string {
  switch (resource) {
    case 'certificate':
    case 'certificate-config':
      return 'workspace_premium';
    case 'event':
      return 'event';
    case 'event-attendance':
    case 'event-attendance-collector':
      return 'fact_check';
    case 'event-group':
      return 'folder';
    case 'event-lecturer':
      return 'record_voice_over';
    case 'event-form':
      return 'list_alt';
    case 'frozen':
      return 'lock';
    case 'major-event':
      return 'festival';
    case 'merge-candidate':
      return 'merge_type';
    case 'person':
      return 'person';
    case 'permission-grant':
      return 'admin_panel_settings';
    case 'place-preset':
      return 'place';
    case 'receipt':
      return 'receipt_long';
    case 'subscription':
      return 'how_to_reg';
    case 'user':
      return 'account_circle';
    default:
      return 'shield';
  }
}

export function getPermissionScopeIcon(scope: string): string {
  switch (scope) {
    case 'read':
      return 'visibility';
    case 'create':
      return 'add';
    case 'update':
      return 'edit';
    case 'delete':
      return 'delete';
    case 'collect':
      return 'fact_check';
    case 'import':
      return 'upload_file';
    case 'approve':
      return 'check_circle';
    case 'reject':
      return 'cancel';
    case 'undo':
      return 'undo';
    case 'issue':
      return 'workspace_premium';
    case 'reissue':
      return 'sync';
    case 'merge':
      return 'merge_type';
    case 'scan':
      return 'search';
    case 'publish':
      return 'campaign';
    case 'results':
      return 'bar_chart';
    case 'export':
      return 'download';
    default:
      return 'help';
  }
}
