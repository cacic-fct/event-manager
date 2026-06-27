import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogExplorerRevertedStatus,
  AuditLogOperation,
} from '../../../graphql/models';

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
  { value: 'EVENT_SUBSCRIPTION', label: 'Inscrição em evento' },
  { value: 'EVENT_GROUP_SUBSCRIPTION', label: 'Inscrição em grupo' },
  { value: 'MAJOR_EVENT_SUBSCRIPTION', label: 'Inscrição em grande evento' },
  { value: 'EVENT_ATTENDANCE', label: 'Presença' },
  { value: 'EVENT_ATTENDANCE_COLLECTOR', label: 'Coletor de presença' },
  { value: 'EVENT_LECTURER', label: 'Palestrante do evento' },
  { value: 'CERTIFICATE_CONFIG', label: 'Configuração de certificado' },
  { value: 'CERTIFICATE', label: 'Certificado' },
  { value: 'MERGE_CANDIDATE', label: 'Pessoa duplicada' },
  { value: 'RECEIPT_VALIDATION', label: 'Validação de comprovante' },
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
];

export const AUDIT_LOG_REVERTED_STATUS_OPTIONS: readonly SelectOption<AuditLogExplorerRevertedStatus>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'NOT_REVERTED', label: 'Não desfeitos' },
  { value: 'REVERTED', label: 'Desfeitos' },
];

export function auditLogEntityTypeLabel(entityType: AuditLogEntityType): string {
  return AUDIT_LOG_ENTITY_TYPE_OPTIONS.find((option) => option.value === entityType)?.label ?? entityType;
}

export function auditLogOperationLabel(operation: AuditLogOperation): string {
  return AUDIT_LOG_OPERATION_OPTIONS.find((option) => option.value === operation)?.label ?? operation;
}

export function auditLogActorTypeLabel(actorType: AuditLogActorType): string {
  switch (actorType) {
    case 'USER':
      return 'Usuário';
    case 'SERVICE':
      return 'Serviço';
    case 'SYSTEM':
      return 'Sistema';
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
    case 'SCAN':
      return 'qr_code_scanner';
    case 'UNDO':
    case 'REVERT':
      return 'undo';
  }
}
