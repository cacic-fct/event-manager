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
    case 'duplicate':
      return 'Duplicar';
    case 'review':
      return 'Revisar';
    case 'operate':
      return 'Operar';
    case 'assign-representative':
      return 'Atribuir representante';
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
    case 'related-person':
      return 'Pessoa relacionada ao escopo';
    case 'permission-grant':
      return 'Permissão do Event Manager';
    case 'place-preset':
      return 'Local';
    case 'receipt':
      return 'Comprovante';
    case 'subscription':
      return 'Inscrição';
    case 'sports-tournament':
      return 'Torneio esportivo';
    case 'sports-category':
      return 'Modalidade esportiva';
    case 'sports-team':
      return 'Equipe esportiva';
    case 'sports-registration':
      return 'Inscrição esportiva';
    case 'sports-match':
      return 'Partida esportiva';
    case 'sports-official':
      return 'Equipe de arbitragem';
    case 'sports-score':
      return 'Placar esportivo';
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
    case 'related-person':
      return 'group';
    case 'permission-grant':
      return 'admin_panel_settings';
    case 'place-preset':
      return 'place';
    case 'receipt':
      return 'receipt_long';
    case 'subscription':
      return 'how_to_reg';
    case 'sports-tournament':
      return 'emoji_events';
    case 'sports-category':
      return 'sports';
    case 'sports-team':
      return 'groups';
    case 'sports-registration':
      return 'app_registration';
    case 'sports-match':
      return 'scoreboard';
    case 'sports-official':
      return 'sports_score';
    case 'sports-score':
      return 'leaderboard';
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
    case 'duplicate':
      return 'content_copy';
    case 'review':
      return 'rate_review';
    case 'operate':
      return 'sports_score';
    case 'assign-representative':
      return 'manage_accounts';
    default:
      return 'help';
  }
}
