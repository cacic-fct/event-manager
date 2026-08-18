import { sportsMatchStateLabel, sportsRosterRoleLabel } from '@cacic-fct/shared-data-types/sports-metadata';
import type { RepresentativeTeamChange, SportsLineupRead } from './sports-operations.types';
import type { RepresentativeTeamWorkspace } from './sports-operations.types';

export type LineupMember = Omit<SportsLineupRead['eligibleMembers'][number], 'shirtNumber'> & {
  shirtNumber: string | null;
  selected: boolean;
};

export function representativeChangeLabel(type: RepresentativeTeamChange['type']): string {
  return {
    TEAM_DETAILS: 'Dados da equipe',
    MEMBER_ADD: 'Inclusão de atleta',
    MEMBER_REMOVE: 'Remoção de integrante',
    MEMBER_UPDATE: 'Alteração de integrante',
    LOGO: 'Logo da equipe',
    REPRESENTATIVE: 'Representante',
    CATEGORY_ROLE: 'Função na modalidade',
    LINEUP: 'Escalação',
  }[type];
}

export function representativeChangeStatusLabel(status: RepresentativeTeamChange['status']): string {
  return {
    PENDING: 'Aguardando análise',
    CHANGES_REQUESTED: 'Ajustes solicitados',
    CONFLICT: 'Conflito - revise os dados',
    APPROVED: 'Aprovada',
    REJECTED: 'Negada',
    SUPERSEDED: 'Substituída por outro pedido',
  }[status];
}

export function representativeMatchupLabel(match: RepresentativeTeamWorkspace['matches'][number]): string {
  return `${match.homeTeam?.name ?? 'Equipe a definir'} x ${match.awayTeam?.name ?? 'Equipe a definir'}`;
}

export function representativeMatchStateLabel(state: RepresentativeTeamWorkspace['matches'][number]['state']): string {
  const canonical = sportsMatchStateLabel(state);
  if (state === 'CANCELED') {
    return 'Cancelada para remarcação';
  }
  return state === 'AWAITING_REVIEW' || state === 'DRAW' || state === 'FINISHED'
    ? `${canonical} - somente leitura`
    : canonical;
}

export function representativeMemberStatusLabel(
  status: RepresentativeTeamWorkspace['members'][number]['status'],
): string {
  return {
    PENDING: 'Aguardando aprovação',
    APPROVED: 'Ativo',
    CHANGES_REQUESTED: 'Ajustes solicitados',
    REJECTED: 'Não aprovado',
    SUSPENDED: 'Suspenso',
    WITHDRAWN: 'Saiu da equipe',
  }[status];
}

export function representativeLineupRoleLabel(role: LineupMember['role']): string {
  return sportsRosterRoleLabel(role);
}

export function parseRepresentativeChangeDelta(value?: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value ?? '{}') as unknown;
    return readRepresentativeRecord(parsed);
  } catch {
    return {};
  }
}

export function readRepresentativeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function lineupMembersFromRead(lineup: SportsLineupRead): LineupMember[] {
  const selectedEntries = new Map(lineup.roster?.entries.map((entry) => [entry.registrationMemberId, entry]) ?? []);
  return lineup.eligibleMembers.map((member) => {
    const rosterEntry = selectedEntries.get(member.registrationMemberId);
    return {
      ...member,
      role: rosterEntry?.role ?? member.role,
      shirtNumber: rosterEntry?.shirtNumber ?? member.shirtNumber ?? null,
      selected: Boolean(rosterEntry),
    };
  });
}

export function normalizeShirtNumber(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized && /^[\p{L}\p{N}._-]{1,12}$/u.test(normalized) ? normalized : null;
}

export function createSportsOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
