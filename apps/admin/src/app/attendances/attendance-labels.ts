const ATTENDANCE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  NON_REGULAR: 'Não regular',
  REGULAR: 'Regular',
  UNKNOWN: 'Sem classificação',
};

const ATTENDANCE_METHOD_LABELS: Readonly<Record<string, string>> = {
  CSV_IMPORT: 'Importação CSV',
  EVENT_DUPLICATION: 'Duplicação de evento',
  MANUAL_INPUT: 'Entrada manual',
  ONLINE_CODE: 'Código on-line',
  ORAL_CALL: 'Chamada oral',
  SCANNER: 'Leitor de crachá',
  UNKNOWN: 'Método não identificado',
};

const ATTENDANCE_REVIEW_KIND_LABELS: Readonly<Record<string, string>> = {
  ATTENDANCE_REMOVAL: 'Remoção de presença',
  DISTANT_LOCATION: 'Localização distante',
  IMPROBABLE_MATCH_OPERATION: 'Operação esportiva',
  OFFLINE_BACKLOG: 'Fila off-line',
  REPEATED_SCAN_ATTEMPTS: 'Leituras repetidas',
  UNUSUAL_VOLUME: 'Volume incomum',
};

const ATTENDANCE_IMPORT_MATCH_TYPE_LABELS: Readonly<Record<string, string>> = {
  CUSTOM: 'campo personalizado',
  EMAIL: 'e-mail',
  FULL_NAME: 'nome completo',
  IDENTITY_DOCUMENT: 'documento ou telefone',
};

const ATTENDANCE_CURRENT_ASSESSMENT_LABELS: Readonly<Record<string, string>> = {
  ACTIVITY_SUBSCRIPTION_MISSING: 'Sem inscrição ativa na atividade',
  INVITATION_REQUIRED: 'Sem convite para presença regular',
  MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT: 'Aguardando comprovante do grande evento',
  MAJOR_EVENT_PAYMENT_NOT_CONFIRMED: 'Pagamento do grande evento não confirmado',
  MAJOR_EVENT_PAYMENT_UNDER_REVIEW: 'Comprovante do grande evento em análise',
  PRICE_TIER_NOT_ELIGIBLE: 'Faixa de pagamento não permite presença regular',
  REQUIREMENTS_CURRENTLY_MET: 'Pessoa atende às regras de presença regular',
};

export function attendanceCategoryLabel(category: string): string {
  return ATTENDANCE_CATEGORY_LABELS[category] ?? 'Categoria não identificada';
}

export function attendanceCreationMethodLabel(method: string): string {
  return ATTENDANCE_METHOD_LABELS[method] ?? 'Método não identificado';
}

export function attendanceReviewKindLabel(kind: string): string {
  return ATTENDANCE_REVIEW_KIND_LABELS[kind] ?? 'Outro tipo de aviso';
}

export function attendanceImportMatchTypeLabel(matchType: string): string {
  return ATTENDANCE_IMPORT_MATCH_TYPE_LABELS[matchType] ?? 'critério de identificação não identificado';
}

export function attendanceCurrentAssessmentLabel(assessment: string | null | undefined): string | null {
  if (!assessment) return null;
  return ATTENDANCE_CURRENT_ASSESSMENT_LABELS[assessment] ?? 'Situação de elegibilidade não identificada';
}
