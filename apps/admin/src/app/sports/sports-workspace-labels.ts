import { SPORTS_MATCH_STATE_LABELS } from '@cacic-fct/shared-data-types/sports-metadata';

const STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
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
  ELIGIBLE: 'Apto para competir',
  INELIGIBLE: 'Não apto para competir',
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
  SUBMITTED: 'Enviado',
  SUPERSEDED: 'Substituído',
};

export function sportsStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? 'Situação não informada';
}

export function sportsMatchStatusLabel(status: string): string {
  if (status === 'CANCELED') {
    return 'Cancelada, aguardando reagendamento';
  }
  return (
    SPORTS_MATCH_STATE_LABELS[status as keyof typeof SPORTS_MATCH_STATE_LABELS] ?? 'Situação da partida não informada'
  );
}
