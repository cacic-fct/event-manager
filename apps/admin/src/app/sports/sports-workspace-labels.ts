const STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'Rascunho',
  REGISTRATION_OPEN: 'Inscrições abertas',
  REGISTRATION_CLOSED: 'Inscrições encerradas',
  ACTIVE: 'Ativo',
  LIVE: 'Ao vivo',
  FINISHED: 'Finalizado',
  CANCELED: 'Cancelado',
  PENDING: 'Pendente',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  CHANGES_REQUESTED: 'Ajustes solicitados',
  CONFLICT: 'Conflito',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
  WITHDRAWN: 'Desistiu',
  WAITING_APPROVAL: 'Aguardando aprovação',
  WAITING_PAYMENT: 'Aguardando pagamento',
  UNDER_REVIEW: 'Pagamento em análise',
  PAID: 'Pago',
  NOT_REQUIRED: 'Pagamento não exigido',
  NOT_REQUIRED_YET: 'Pagamento ainda não exigido',
  NOT_AVAILABLE: 'Pagamento indisponível',
  SCHEDULED: 'Agendada',
  CHECK_IN: 'Credenciamento',
  PAUSED: 'Pausada',
  AWAITING_REVIEW: 'Em revisão',
  DRAW: 'Empate',
};

export function sportsStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function sportsMatchStatusLabel(status: string): string {
  return status === 'CANCELED' ? 'Cancelada, aguardando reagendamento' : sportsStatusLabel(status);
}
