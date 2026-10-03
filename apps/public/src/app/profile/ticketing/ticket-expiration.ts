import type { WalletTicket } from '@cacic-fct/shared-ticketing';

export const MAX_TICKET_DEADLINE_RESCHEDULE_MS = 5 * 60_000;

export function ticketStatusAt(ticket: WalletTicket, nowMs: number): WalletTicket['status'] {
  if (ticket.status !== 'ACTIVE') return ticket.status;

  const expiresAt = Date.parse(ticket.effectiveExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs ? 'EXPIRED' : 'ACTIVE';
}

export function ticketExpirationReason(status: WalletTicket['status']): string {
  switch (status) {
    case 'UNAVAILABLE': return 'Bilhete indisponível';
    case 'CONSUMED': return 'Bilhete já utilizado';
    case 'REVOKED': return 'Bilhete revogado';
    case 'EXPIRED': return 'Prazo de validade encerrado';
    case 'ACTIVE': return '';
  }
}

export function nextDeadlineDelay(
  deadlines: readonly (string | null | undefined)[],
  nowMs: number,
  maxDelayMs = MAX_TICKET_DEADLINE_RESCHEDULE_MS,
): number | null {
  let nearestDeadline = Number.POSITIVE_INFINITY;
  for (const value of deadlines) {
    if (!value) continue;
    const deadline = Date.parse(value);
    if (Number.isFinite(deadline) && deadline > nowMs) nearestDeadline = Math.min(nearestDeadline, deadline);
  }

  return Number.isFinite(nearestDeadline) ? Math.min(nearestDeadline - nowMs, maxDelayMs) : null;
}
