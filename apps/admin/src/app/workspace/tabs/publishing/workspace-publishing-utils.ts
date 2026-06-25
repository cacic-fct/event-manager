import { PublicContentNode } from '../../../graphql/publishing-api.service';
import { PublicationState, PublicationTargetType } from '../../../graphql/models';

export function flattenPublicationNodes(nodes: PublicContentNode[]): PublicContentNode[] {
  return nodes.flatMap((node) => [node, ...flattenPublicationNodes(node.children)]);
}

export function publicationStatusLabel(state: PublicationState): string {
  const labels: Record<PublicationState, string> = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendado',
    PUBLISHED: 'Publicado',
    UNPUBLISHED: 'Despublicado',
  };
  return labels[state];
}

export function publicationTargetIcon(targetType: PublicationTargetType): string {
  const icons: Record<PublicationTargetType, string> = {
    EVENT: 'event',
    EVENT_GROUP: 'folder',
    MAJOR_EVENT: 'festival',
  };
  return icons[targetType];
}

export function publicationTargetLabel(targetType: PublicationTargetType): string {
  const labels: Record<PublicationTargetType, string> = {
    EVENT: 'Evento',
    EVENT_GROUP: 'Grupo de eventos',
    MAJOR_EVENT: 'Grande evento',
  };
  return labels[targetType];
}

export function publicationChildCountLabel(count: number): string {
  return count === 1 ? '1 item vinculado' : `${count} itens vinculados`;
}

export function localDateTimeInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function defaultScheduledPublicationDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return date;
}

export function toDateTimeInputValue(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function publicationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível concluir a operação.';
}
