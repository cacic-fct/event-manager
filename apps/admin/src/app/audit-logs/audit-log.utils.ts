import {
  AuditLogEntityType,
  AuditLogExplorerRevertedStatus,
  AuditLogOperation,
} from '@cacic-fct/event-manager-admin-contracts';

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

export const AUDIT_LOG_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const AUDIT_LOG_ENTITY_TYPE_OPTIONS: readonly SelectOption<AuditLogEntityType>[] = [
  { value: 'PERSON', label: 'Pessoa' },
  { value: 'LECTURER_PROFILE', label: 'Perfil de palestrante' },
  { value: 'EVENT', label: 'Evento' },
  { value: 'MAJOR_EVENT', label: 'Grande evento' },
  { value: 'EVENT_GROUP', label: 'Grupo de eventos' },
  { value: 'PLACE_PRESET', label: 'Local' },
  { value: 'PERMISSION_GRANT', label: 'Permissão concedida' },
  { value: 'PERMISSION_ROLE', label: 'Perfil de permissões' },
  { value: 'PERMISSION_GROUP', label: 'Grupo de permissões' },
  { value: 'EVENT_SUBSCRIPTION', label: 'Inscrição em evento' },
  { value: 'EVENT_GROUP_SUBSCRIPTION', label: 'Inscrição em grupo' },
  { value: 'MAJOR_EVENT_SUBSCRIPTION', label: 'Inscrição em grande evento' },
  { value: 'EVENT_ATTENDANCE', label: 'Presença' },
  { value: 'EVENT_ATTENDANCE_COLLECTOR', label: 'Coletor de presença' },
  { value: 'EVENT_LECTURER', label: 'Palestrante do evento' },
  { value: 'EVENT_FORM', label: 'Formulário' },
  { value: 'EVENT_FORM_LINK', label: 'Vínculo de formulário' },
  { value: 'EVENT_FORM_RESPONSE', label: 'Resposta de formulário' },
  { value: 'CERTIFICATE_CONFIG', label: 'Configuração de certificado' },
  { value: 'CERTIFICATE', label: 'Certificado' },
  { value: 'MERGE_CANDIDATE', label: 'Pessoa duplicada' },
  { value: 'RECEIPT_VALIDATION', label: 'Validação de comprovante' },
  { value: 'TICKET', label: 'Bilhete' },
  { value: 'TICKET_TRANSFER', label: 'Transferência de bilhete' },
  { value: 'TICKET_PURCHASE', label: 'Compra de bilhete' },
  { value: 'TICKET_CONFIG', label: 'Configuração de bilhete' },
  { value: 'SPORTS_TOURNAMENT', label: 'Torneio esportivo' },
  { value: 'SPORTS_CATEGORY', label: 'Categoria esportiva' },
  { value: 'SPORTS_TEAM', label: 'Equipe esportiva' },
  { value: 'SPORTS_TEAM_MEMBER', label: 'Integrante de equipe' },
  { value: 'SPORTS_REGISTRATION', label: 'Inscrição esportiva' },
  { value: 'SPORTS_TEAM_CHANGE_REQUEST', label: 'Solicitação de alteração de equipe' },
  { value: 'SPORTS_VENUE', label: 'Local esportivo' },
  { value: 'SPORTS_MATCH', label: 'Partida esportiva' },
  { value: 'SPORTS_MATCH_ROSTER', label: 'Escalação de partida' },
  { value: 'SPORTS_MATCH_ACTION', label: 'Ação de partida' },
  { value: 'SPORTS_OFFICIAL_ASSIGNMENT', label: 'Designação de arbitragem' },
  { value: 'SPORTS_PLAYER_APPLICATION', label: 'Inscrição de atleta' },
  { value: 'SPORTS_TOURNAMENT_SCORE', label: 'Pontuação de torneio' },
  { value: 'SYSTEM', label: 'Sistema' },
];

export const AUDIT_LOG_OPERATION_OPTIONS: readonly SelectOption<AuditLogOperation>[] = [
  { value: 'CREATE', label: 'Criação' },
  { value: 'UPDATE', label: 'Alteração' },
  { value: 'DELETE', label: 'Remoção' },
  { value: 'MERGE', label: 'Unificação' },
  { value: 'IMPORT', label: 'Importação' },
  { value: 'APPROVE', label: 'Aprovação' },
  { value: 'REJECT', label: 'Rejeição' },
  { value: 'ISSUE', label: 'Emissão' },
  { value: 'REISSUE', label: 'Reemissão' },
  { value: 'SCAN', label: 'Leitura' },
  { value: 'UNDO', label: 'Desfazer' },
  { value: 'REVERT', label: 'Reversão' },
  { value: 'USER_CREATE', label: 'Criação pelo usuário' },
  { value: 'SUBMIT', label: 'Envio' },
  { value: 'REQUEST_CHANGES', label: 'Solicitação de ajustes' },
  { value: 'ASSIGN', label: 'Atribuição' },
  { value: 'START', label: 'Início' },
  { value: 'PAUSE', label: 'Pausa' },
  { value: 'RESUME', label: 'Retomada' },
  { value: 'SCORE', label: 'Pontuação' },
  { value: 'FINALIZE', label: 'Finalização' },
];

export const AUDIT_LOG_REVERTED_STATUS_OPTIONS: readonly SelectOption<AuditLogExplorerRevertedStatus>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'NOT_REVERTED', label: 'Não desfeitos' },
  { value: 'REVERTED', label: 'Desfeitos' },
];

export function auditLogEntityTypeLabel(entityType: string): string {
  return (
    AUDIT_LOG_ENTITY_TYPE_OPTIONS.find((option) => option.value === entityType)?.label ??
    'Tipo de registro não identificado'
  );
}

export function auditLogOperationLabel(operation: string): string {
  return AUDIT_LOG_OPERATION_OPTIONS.find((option) => option.value === operation)?.label ?? 'Ação não identificada';
}

export function auditLogActorTypeLabel(actorType: string): string {
  switch (actorType) {
    case 'USER':
      return 'Usuário';
    case 'SERVICE':
      return 'Serviço';
    case 'SYSTEM':
      return 'Sistema';
    default:
      return 'Tipo de autor não identificado';
  }
}

export function auditLogOperationIcon(operation: AuditLogOperation): string {
  switch (operation) {
    case 'CREATE':
    case 'USER_CREATE':
      return 'add_circle';
    case 'UPDATE':
      return 'edit';
    case 'DELETE':
      return 'delete';
    case 'MERGE':
      return 'call_merge';
    case 'IMPORT':
      return 'upload_file';
    case 'APPROVE':
      return 'check_circle';
    case 'REJECT':
      return 'cancel';
    case 'ISSUE':
    case 'REISSUE':
      return 'workspace_premium';
    case 'SUBMIT':
      return 'send';
    case 'REQUEST_CHANGES':
      return 'rate_review';
    case 'ASSIGN':
      return 'assignment_ind';
    case 'START':
    case 'RESUME':
      return 'play_arrow';
    case 'PAUSE':
      return 'pause';
    case 'SCAN':
      return 'qr_code_scanner';
    case 'SCORE':
      return 'sports_score';
    case 'FINALIZE':
      return 'task_alt';
    case 'UNDO':
    case 'REVERT':
      return 'undo';
  }
}
