const SUBSCRIPTION_CREATION_METHOD_LABELS: Readonly<Record<string, string>> = {
  ADMIN_DASHBOARD: 'Criada pela administração',
  SELF_SUBSCRIPTION: 'Feita pela própria pessoa',
  UNKNOWN: 'Origem não identificada',
};

const RECEIPT_PROCESSING_STATUS_LABELS: Readonly<Record<string, string>> = {
  PENDING: 'Aguardando processamento',
  OCR_DONE: 'Texto extraído',
  CONVERTED: 'Comprovante convertido',
  FAILED: 'Falha no processamento',
};

const SPORTS_PAYMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  NOT_REQUIRED: 'Pagamento não exigido',
  NOT_AVAILABLE: 'Pagamento indisponível',
  WAITING_APPROVAL: 'Aguardando aprovação',
  WAITING_PAYMENT: 'Aguardando pagamento',
  UNDER_REVIEW: 'Pagamento em análise',
  PAID: 'Pagamento confirmado',
  REJECTED: 'Pagamento rejeitado',
};

const SPORTS_PARTICIPANT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  ADMIN: 'Adicionada pela administração',
  TEAM_ASSIGNMENT: 'Adicionada por equipe',
  SELF_SUBSCRIPTION: 'Inscrição da própria pessoa',
};

export function subscriptionCreationMethodLabel(method: string): string {
  return SUBSCRIPTION_CREATION_METHOD_LABELS[method] ?? 'Origem não identificada';
}

export function receiptProcessingStatusLabel(status: string): string {
  return RECEIPT_PROCESSING_STATUS_LABELS[status] ?? 'Processamento não identificado';
}

export function sportsPaymentStatusLabel(status: string): string {
  return SPORTS_PAYMENT_STATUS_LABELS[status] ?? 'Situação do pagamento não informada';
}

export function sportsParticipantSourceLabel(source: string): string {
  return SPORTS_PARTICIPANT_SOURCE_LABELS[source] ?? 'Origem não identificada';
}
