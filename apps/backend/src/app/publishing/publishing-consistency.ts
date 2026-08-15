import { DashboardInconsistency } from '../dashboard/models';

type PublicationConsistencyEvent = {
  id: string;
  name: string;
  isPubliclyListed: boolean;
  publicationState: string;
  scheduledPublishAt: Date | null;
  majorEventId: string | null;
  majorEvent?: {
    id: string;
    name: string;
    publicationState: string;
  } | null;
  sportsMatch?: {
    id: string;
    category: { tournamentId: string; status?: string; tournament?: { status: string } };
  } | null;
};

type PublicationConsistencyMajorEvent = {
  id: string;
  name: string;
  publicationState: string;
  scheduledPublishAt: Date | null;
  events?: {
    id: string;
    isPubliclyListed: boolean;
    publicationState: string;
  }[];
  sportsTournament?: { id: string; categories?: { id: string }[] } | null;
};

const PUBLICATION_WARNING_TIME_ZONE = 'America/Sao_Paulo';

export function buildPublicationConsistencyWarnings(input: {
  now: Date;
  events: PublicationConsistencyEvent[];
  majorEvents: PublicationConsistencyMajorEvent[];
}): DashboardInconsistency[] {
  const warnings: DashboardInconsistency[] = [];

  for (const event of input.events) {
    const isSportsMatch = Boolean(event.sportsMatch);
    if (event.publicationState === 'PUBLISHED' && !event.isPubliclyListed) {
      warnings.push({
        type: isSportsMatch ? 'PUBLISHED_SPORTS_MATCH_HIDDEN_FROM_USERS' : 'PUBLISHED_EVENT_HIDDEN_FROM_USERS',
        action: isSportsMatch ? 'OPEN_SPORTS' : 'OPEN_PUBLICATION',
        targetId: event.sportsMatch?.category.tournamentId ?? event.id,
        eventId: event.id,
        severity: 'WARNING',
        title: isSportsMatch ? 'Partida publicada, mas oculta' : 'Evento publicado, mas oculto',
        description: `${event.name} está publicado, mas não aparece para os usuários porque a visibilidade pública está desligada.`,
      });
    }

    if (event.publicationState !== 'PUBLISHED' && event.isPubliclyListed) {
      warnings.push({
        type: isSportsMatch ? 'DRAFT_SPORTS_MATCH_VISIBLE_TO_ADMINS' : 'DRAFT_EVENT_VISIBLE_TO_ADMINS',
        action: isSportsMatch ? 'OPEN_SPORTS' : 'OPEN_PUBLICATION',
        targetId: event.sportsMatch?.category.tournamentId ?? event.id,
        eventId: event.id,
        severity: 'INFO',
        title: isSportsMatch ? 'Partida ainda não publicada' : 'Evento ainda não publicado',
        description: `${event.name} está visível para edição, mas não aparece no site público enquanto não for publicado.`,
      });
    }

    if (
      event.publicationState === 'PUBLISHED' &&
      event.isPubliclyListed &&
      event.sportsMatch &&
      (event.sportsMatch.category.status === 'DRAFT' || event.sportsMatch.category.tournament?.status === 'DRAFT')
    ) {
      warnings.push({
        type: 'SPORTS_MATCH_PUBLIC_VISIBILITY_MISMATCH',
        action: 'OPEN_SPORTS',
        targetId: event.sportsMatch.category.tournamentId,
        eventId: event.id,
        severity: 'WARNING',
        title: 'Visibilidade da partida inconsistente',
        description: `${event.name} está publicada, mas a modalidade ou o torneio ainda está em rascunho.`,
      });
    }

    if (
      event.publicationState === 'PUBLISHED' &&
      event.majorEvent &&
      event.majorEvent.publicationState !== 'PUBLISHED'
    ) {
      warnings.push({
        type: 'PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT',
        action: 'OPEN_PUBLICATION',
        targetId: event.id,
        eventId: event.id,
        severity: 'CRITICAL',
        title: 'Evento publicado em grande evento não publicado',
        description: `${event.name} está publicado, mas ${event.majorEvent.name} ainda não está publicado.`,
      });
    }

    if (
      event.publicationState === 'SCHEDULED' &&
      event.scheduledPublishAt &&
      event.scheduledPublishAt <= input.now
    ) {
      warnings.push({
        type: isSportsMatch ? 'OVERDUE_SCHEDULED_SPORTS_MATCH_PUBLICATION' : 'OVERDUE_SCHEDULED_PUBLICATION',
        action: isSportsMatch ? 'OPEN_SPORTS' : 'OPEN_PUBLICATION',
        targetId: event.sportsMatch?.category.tournamentId ?? event.id,
        eventId: event.id,
        severity: 'WARNING',
        title: isSportsMatch ? 'Publicação da partida atrasada' : 'Publicação agendada atrasada',
        description: `${event.name} deveria ter sido publicado em ${formatPublicationWarningDate(event.scheduledPublishAt)}.`,
      });
    }
  }

  for (const majorEvent of input.majorEvents) {
    if (
      majorEvent.publicationState === 'SCHEDULED' &&
      majorEvent.scheduledPublishAt &&
      majorEvent.scheduledPublishAt <= input.now
    ) {
      warnings.push({
        type: 'OVERDUE_SCHEDULED_PUBLICATION',
        action: 'OPEN_PUBLICATION',
        targetId: majorEvent.id,
        severity: 'WARNING',
        title: 'Grande evento agendado atrasado',
        description: `${majorEvent.name} deveria ter sido publicado em ${formatPublicationWarningDate(majorEvent.scheduledPublishAt)}.`,
      });
    }

    if (majorEvent.publicationState !== 'PUBLISHED') {
      continue;
    }

    const visibleChild = (majorEvent.events ?? []).some(
      (event) => event.publicationState === 'PUBLISHED' && event.isPubliclyListed,
    );
    if (!visibleChild && !majorEvent.sportsTournament) {
      warnings.push({
        type: 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN',
        action: 'OPEN_PUBLICATION',
        targetId: majorEvent.id,
        severity: 'WARNING',
        title: 'Grande evento publicado sem eventos visíveis',
        description: `${majorEvent.name} está publicado, mas nenhum evento filho publicado e visível será exibido.`,
      });
    }
    if (majorEvent.sportsTournament && (majorEvent.sportsTournament.categories?.length ?? 0) === 0) {
      warnings.push({
        type: 'SPORTS_TOURNAMENT_WITHOUT_PUBLIC_CONTENT',
        action: 'OPEN_SPORTS',
        targetId: majorEvent.sportsTournament.id,
        severity: 'WARNING',
        title: 'Torneio publicado sem modalidades visíveis',
        description: `${majorEvent.name} possui um torneio publicado, mas nenhuma modalidade está disponível no site público.`,
      });
    }
  }

  return warnings;
}

function formatPublicationWarningDate(date: Date): string {
  return date.toLocaleString('pt-BR', { timeZone: PUBLICATION_WARNING_TIME_ZONE });
}
