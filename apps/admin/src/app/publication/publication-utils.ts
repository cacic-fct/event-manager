import { PublicationNode } from '../graphql/publishing-api.service';
import { PublicationTargetType } from '@cacic-fct/event-manager-admin-contracts';
import { addDays, format, parseISO, set } from 'date-fns';

export interface PublicationListItem {
  key: string;
  level: number;
  node: PublicationNode;
}

export function flattenPublicationNodes(nodes: PublicationNode[]): PublicationNode[] {
  return nodes.flatMap((node) => [node, ...flattenPublicationNodes(node.children ?? [])]);
}

export function flattenPublicationListItems(
  nodes: PublicationNode[],
  level = 0,
  lineage = '',
  nestedNodeKeys = collectNestedNodeKeys(nodes),
): PublicationListItem[] {
  return nodes.flatMap((node, index) => {
    const key = `${lineage}/${node.targetType}:${node.id}:${index}`;
    if (level === 0 && nestedNodeKeys.has(publicationNodeKey(node))) {
      return [];
    }

    return [
      { key, level, node },
      ...flattenPublicationListItems(node.children ?? [], level + 1, key, nestedNodeKeys),
    ];
  });
}

function collectNestedNodeKeys(nodes: PublicationNode[]): Set<string> {
  const nestedNodeKeys = new Set<string>();
  for (const node of nodes) {
    collectChildNodeKeys(node.children ?? [], nestedNodeKeys);
  }
  return nestedNodeKeys;
}

function collectChildNodeKeys(nodes: PublicationNode[], nestedNodeKeys: Set<string>): void {
  for (const node of nodes) {
    nestedNodeKeys.add(publicationNodeKey(node));
    collectChildNodeKeys(node.children ?? [], nestedNodeKeys);
  }
}

function publicationNodeKey(node: PublicationNode): string {
  return `${node.targetType}:${node.id}`;
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
  return parseISO(value).toISOString();
}

export function defaultScheduledPublicationDate(): Date {
  return set(addDays(new Date(), 1), { minutes: 0, seconds: 0, milliseconds: 0 });
}

export function toDateTimeInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function publicationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível concluir a operação.';
}
