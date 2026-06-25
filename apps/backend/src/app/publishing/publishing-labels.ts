import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { PublicationBulkOperation } from './publishing.models';
import { TargetSync } from './publishing.types';

export function publicationSummary(state: PublicationState): string {
  const summaries: Record<PublicationState, string> = {
    DRAFT: 'Conteúdo movido para rascunho.',
    SCHEDULED: 'Publicação agendada.',
    PUBLISHED: 'Conteúdo publicado.',
    UNPUBLISHED: 'Conteúdo despublicado.',
  };
  return summaries[state];
}

export function describeStateChange(state: PublicationState, sync: TargetSync): string {
  const total = sync.eventIds.length + sync.majorEventIds.length;
  return `${publicationSummary(state)} ${affectedItemsLabel(total)}`;
}

export function describeBulkOperation(operation: PublicationBulkOperation, sync: TargetSync): string {
  const total = sync.eventIds.length + sync.majorEventIds.length;
  const labels: Record<PublicationBulkOperation, (total: number) => string> = {
    PUBLISH_MISSING_CHILDREN: (affectedTotal) =>
      affectedTotal === 1 ? 'Item vinculado pendente publicado.' : 'Itens vinculados pendentes publicados.',
    SCHEDULE_BUNDLE: () => 'Conjunto agendado.',
    UNPUBLISH_BUNDLE: () => 'Conjunto despublicado.',
  };
  return `${labels[operation](total)} ${affectedItemsLabel(total)}`;
}

function affectedItemsLabel(total: number): string {
  return total === 1 ? '1 item afetado.' : `${total} itens afetados.`;
}

export function publicationStateLabel(state: PublicationState, scheduledPublishAt?: Date | null): string {
  if (state === PrismaPublicationState.SCHEDULED && scheduledPublishAt) {
    return `Agendado para ${scheduledPublishAt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })}`;
  }

  const labels: Record<PublicationState, string> = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendado',
    PUBLISHED: 'Publicado',
    UNPUBLISHED: 'Despublicado',
  };
  return labels[state];
}
