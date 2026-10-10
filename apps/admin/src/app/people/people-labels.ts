import { SUBSCRIPTION_STATUS_VALUES, formatUnespRole, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';

const USER_ROLE_LABELS: Readonly<Record<string, string>> = {
  ADMIN: 'Administrador',
  CACIC: 'CACiC',
  EVENT_MANAGER: 'Gestor de eventos',
  USER: 'Usuário',
};

const LINKED_RESOURCE_STATUS_LABELS: Readonly<Record<string, string>> = {
  APPLIED: 'Aplicada',
  APPROVED: 'Aprovado',
  COMMITTED: 'Presenças registradas',
  CONVERTED: 'Arquivo processado',
  DRAFT: 'Rascunho',
  FAILED: 'Falha no processamento',
  MERGED: 'Unificada',
  NON_REGULAR: 'Não regular',
  OCR_DONE: 'Texto extraído',
  PENDING: 'Pendente',
  PUBLISHED: 'Publicado',
  REGULAR: 'Regular',
  REJECTED: 'Rejeitada',
  ROLLED_BACK: 'Revertida',
  SCHEDULED: 'Agendado',
  STALE: 'Desatualizada',
  UNKNOWN: 'Indefinida',
  UNPUBLISHED: 'Não publicado',
};

const SUBSCRIPTION_STATUS_SET = new Set<string>(SUBSCRIPTION_STATUS_VALUES);

export function userRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Perfil não informado';
  return USER_ROLE_LABELS[role] ?? 'Outro perfil';
}

export function unespRoleListLabel(roles: readonly string[] | null | undefined, enrollmentNumber?: string | null): string {
  return (
    roles
      ?.map((role) => formatUnespRole(role, enrollmentNumber) || 'Vínculo com a Unesp não informado')
      .join(', ') ?? ''
  );
}

export function linkedResourceStatusLabel(status: string | null | undefined): string {
  if (!status?.trim()) return 'Situação não informada';
  if (SUBSCRIPTION_STATUS_SET.has(status)) return getSubscriptionStatusLabel(status);

  const knownLabel = LINKED_RESOURCE_STATUS_LABELS[status];
  if (knownLabel) return knownLabel;

  return /^[A-Z][A-Z0-9_]*$/.test(status) ? 'Situação não identificada' : status;
}
