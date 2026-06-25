import { DashboardInconsistency } from '../dashboard/models';

type PublicationConsistencyEvent = {
  id: string;
  name: string;
  publiclyVisible: boolean;
  publicationState: string;
  scheduledPublishAt: Date | null;
  majorEventId: string | null;
  majorEvent?: {
    id: string;
    name: string;
    publicationState: string;
  } | null;
};

type PublicationConsistencyMajorEvent = {
  id: string;
  name: string;
  publicationState: string;
  scheduledPublishAt: Date | null;
  events?: {
    id: string;
    publiclyVisible: boolean;
    publicationState: string;
  }[];
};

const PUBLICATION_WARNING_TIME_ZONE = 'America/Sao_Paulo';

export function buildPublicationConsistencyWarnings(input: {
  now: Date;
  events: PublicationConsistencyEvent[];
  majorEvents: PublicationConsistencyMajorEvent[];
}): DashboardInconsistency[] {
  const warnings: DashboardInconsistency[] = [];

  for (const event of input.events) {
    if (event.publicationState === 'PUBLISHED' && !event.publiclyVisible) {
      warnings.push({
        type: 'PUBLISHED_EVENT_HIDDEN_FROM_USERS',
        action: 'OPEN_PUBLICATION',
        targetId: event.id,
        eventId: event.id,
        severity: 'WARNING',
        title: 'Evento publicado, mas oculto',
        description: `${event.name} está publicado, mas não aparece para os usuários porque a visibilidade pública está desligada.`,
      });
    }

    if (event.publicationState !== 'PUBLISHED' && event.publiclyVisible) {
      warnings.push({
        type: 'DRAFT_EVENT_VISIBLE_TO_ADMINS',
        action: 'OPEN_PUBLICATION',
        targetId: event.id,
        eventId: event.id,
        severity: 'INFO',
        title: 'Evento ainda não publicado',
        description: `${event.name} está visível para edição, mas não aparece no site público enquanto não for publicado.`,
      });
    }

    if (event.publicationState === 'PUBLISHED' && event.majorEvent && event.majorEvent.publicationState !== 'PUBLISHED') {
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
        type: 'OVERDUE_SCHEDULED_PUBLICATION',
        action: 'OPEN_PUBLICATION',
        targetId: event.id,
        eventId: event.id,
        severity: 'WARNING',
        title: 'Publicação agendada atrasada',
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
      (event) => event.publicationState === 'PUBLISHED' && event.publiclyVisible,
    );
    if (!visibleChild) {
      warnings.push({
        type: 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN',
        action: 'OPEN_PUBLICATION',
        targetId: majorEvent.id,
        severity: 'WARNING',
        title: 'Grande evento publicado sem eventos visíveis',
        description: `${majorEvent.name} está publicado, mas nenhum evento filho publicado e visível será exibido.`,
      });
    }
  }

  return warnings;
}

function formatPublicationWarningDate(date: Date): string {
  return date.toLocaleString('pt-BR', { timeZone: PUBLICATION_WARNING_TIME_ZONE });
}
