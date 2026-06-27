import { fakerPT_BR as faker } from '@faker-js/faker';
import {
  PublicContentNode,
  PublicContentWorkspace,
  PublicationBulkInput,
  PublicationStateInput,
} from '../../../graphql/publishing-api.service';
import { PublicationState } from '../../../graphql/models';

export type PublicationStoryState = 'loaded' | 'empty' | 'loading' | 'error';

export interface PublicationStoryArgs {
  state: PublicationStoryState;
  majorEvents: number;
  standaloneGroups: number;
  standaloneEvents: number;
  includeHiddenEvents: boolean;
  includeCriticalWarnings: boolean;
}

export const defaultPublicationStoryArgs: PublicationStoryArgs = {
  state: 'loaded',
  majorEvents: 1,
  standaloneGroups: 1,
  standaloneEvents: 1,
  includeHiddenEvents: true,
  includeCriticalWarnings: true,
};

export function publicationActionResult(affectedNodes: PublicContentNode[] = []) {
  const affectedEventIds = affectedNodes.filter((node) => node.targetType === 'EVENT').map((node) => node.id);
  const affectedMajorEventIds = affectedNodes
    .filter((node) => node.targetType === 'MAJOR_EVENT')
    .map((node) => node.id);

  return {
    ok: true,
    message: 'Operação simulada concluída.',
    affectedEventIds,
    affectedMajorEventIds,
  };
}

export function buildPublicationWorkspace(args: PublicationStoryArgs): PublicContentWorkspace {
  faker.seed(20260801);
  const generatedAt = new Date('2026-08-01T12:00:00.000Z').toISOString();
  const tree = [
    ...Array.from({ length: args.majorEvents }, (_, index) => majorEventNode(index, args)),
    ...Array.from({ length: args.standaloneGroups }, (_, index) => groupNode(`standalone-group-${index}`, null, args)),
    ...Array.from({ length: args.standaloneEvents }, (_, index) =>
      eventNode(`standalone-event-${index}`, null, index, args),
    ),
  ];

  return {
    generatedAt,
    tree,
    items: flatten(tree),
    totalCount: flatten(tree).length,
    skip: 0,
    take: flatten(tree).length,
    hasMore: false,
    query: null,
    warnings: buildWarnings(args),
  };
}

export function applyStoryPublicationState(workspace: PublicContentWorkspace, input: unknown) {
  if (!isPublicationStateInput(input)) {
    return publicationActionResult();
  }

  const selected = findNode(workspace.tree ?? workspace.items, input.targetType, input.targetId);
  const affected = selected ? updateNodeAndDescendants(selected, input.state, input.scheduledPublishAt) : [];
  return publicationActionResult(affected);
}

export function applyStoryBulkOperation(workspace: PublicContentWorkspace, input: unknown) {
  if (!isPublicationBulkInput(input)) {
    return publicationActionResult();
  }

  const selected = findNode(workspace.tree ?? workspace.items, input.targetType, input.targetId);
  if (!selected) {
    return publicationActionResult();
  }

  if (input.operation === 'PUBLISH_MISSING_CHILDREN') {
    const pendingNodes = flatten(selected.children ?? []).filter((node) => node.publicationState !== 'PUBLISHED');
    return publicationActionResult(updateNodes(pendingNodes, 'PUBLISHED', null));
  }

  if (input.operation === 'SCHEDULE_BUNDLE') {
    return publicationActionResult(updateNodeAndDescendants(selected, 'SCHEDULED', input.scheduledPublishAt ?? null));
  }

  return publicationActionResult(updateNodeAndDescendants(selected, 'UNPUBLISHED', null));
}

function majorEventNode(index: number, args: PublicationStoryArgs) {
  return {
    targetType: 'MAJOR_EVENT' as const,
    id: `major-${index}`,
    label: `SECOMPP ${2026 + index}`,
    publicationState: index % 2 === 0 ? ('SCHEDULED' as const) : ('PUBLISHED' as const),
    statusLabel: index % 2 === 0 ? 'Agendado para 01/08/2026 09:00' : 'Publicado',
    scheduledPublishAt: index % 2 === 0 ? '2026-08-01T12:00:00.000Z' : null,
    publishedAt: index % 2 === 0 ? null : '2026-07-20T12:00:00.000Z',
    unpublishedAt: null,
    publiclyVisible: null,
    parentLabel: null,
    childCount: 3,
    children: [
      eventNode(`major-${index}-opening`, 'Abertura', 0, args),
      groupNode(`major-${index}-group`, `SECOMPP ${2026 + index}`, args),
      eventNode(`major-${index}-ceremony`, 'Encerramento', 2, args),
    ],
  };
}

function groupNode(id: string, parentLabel: string | null, args: PublicationStoryArgs) {
  return {
    targetType: 'EVENT_GROUP' as const,
    id,
    label: parentLabel ? 'Grupo de workshops' : 'Minicursos de Férias',
    publicationState: 'SCHEDULED' as const,
    statusLabel: 'Agendado',
    scheduledPublishAt: '2026-08-01T12:00:00.000Z',
    publishedAt: null,
    unpublishedAt: null,
    publiclyVisible: null,
    parentLabel,
    childCount: 2,
    children: [
      eventNode(`${id}-angular`, 'Minicurso Angular', 1, args),
      eventNode(`${id}-docker`, 'Workshop Docker', 3, args),
    ],
  };
}

function eventNode(id: string, parentLabel: string | null, index: number, args: PublicationStoryArgs) {
  const hidden = args.includeHiddenEvents && index === 3;
  const states = ['PUBLISHED', 'SCHEDULED', 'UNPUBLISHED', 'DRAFT'] as const;
  const publicationState = hidden ? 'PUBLISHED' : states[index % states.length];
  return {
    targetType: 'EVENT' as const,
    id,
    label: parentLabel ?? faker.company.catchPhrase(),
    publicationState,
    statusLabel: hidden ? 'Publicado, mas oculto dos usuários' : statusLabel(publicationState),
    scheduledPublishAt: publicationState === 'SCHEDULED' ? '2026-08-01T12:00:00.000Z' : null,
    publishedAt: publicationState === 'PUBLISHED' ? '2026-07-20T12:00:00.000Z' : null,
    unpublishedAt: publicationState === 'UNPUBLISHED' ? '2026-07-22T12:00:00.000Z' : null,
    publiclyVisible: !hidden,
    parentLabel,
    childCount: 0,
    children: [],
  };
}

function statusLabel(state: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'UNPUBLISHED'): string {
  return {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendado',
    PUBLISHED: 'Publicado',
    UNPUBLISHED: 'Despublicado',
  }[state];
}

function updateNodeAndDescendants(
  node: PublicContentNode,
  state: PublicationState,
  scheduledPublishAt: string | null | undefined,
): PublicContentNode[] {
  return updateNodes([node, ...flatten(node.children ?? [])], state, scheduledPublishAt ?? null);
}

function updateNodes(
  nodes: PublicContentNode[],
  state: PublicationState,
  scheduledPublishAt: string | null,
): PublicContentNode[] {
  const changedAt = new Date('2026-08-01T14:30:00.000Z').toISOString();
  for (const node of nodes) {
    node.publicationState = state;
    node.statusLabel = storyStatusLabel(state, scheduledPublishAt);
    node.scheduledPublishAt = state === 'SCHEDULED' ? scheduledPublishAt : null;
    node.publishedAt = state === 'PUBLISHED' ? changedAt : node.publishedAt;
    node.unpublishedAt = state === 'UNPUBLISHED' ? changedAt : null;
  }
  return nodes;
}

function storyStatusLabel(state: PublicationState, scheduledPublishAt: string | null): string {
  if (state === 'SCHEDULED' && scheduledPublishAt) {
    return `Agendado para ${new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(scheduledPublishAt))}`;
  }

  return statusLabel(state);
}

function buildWarnings(args: PublicationStoryArgs) {
  if (!args.includeCriticalWarnings) {
    return [];
  }

  return [
    {
      type: 'PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT' as const,
      action: 'OPEN_PUBLICATION' as const,
      targetId: 'major-0-opening',
      severity: 'CRITICAL' as const,
      title: 'Evento publicado em grande evento não publicado',
      description: 'Abertura está publicada, mas SECOMPP 2026 ainda não está publicada.',
      eventId: 'major-0-opening',
      relatedEventId: null,
      personId: null,
    },
    {
      type: 'PUBLISHED_EVENT_HIDDEN_FROM_USERS' as const,
      action: 'OPEN_PUBLICATION' as const,
      targetId: 'major-0-group-docker',
      severity: 'WARNING' as const,
      title: 'Evento publicado, mas oculto',
      description: 'Workshop Docker não aparece para usuários enquanto a visibilidade pública estiver desligada.',
      eventId: 'major-0-group-docker',
      relatedEventId: null,
      personId: null,
    },
  ];
}

function flatten(nodes: PublicContentNode[]): PublicContentNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

function findNode(
  nodes: PublicContentNode[],
  targetType: PublicationStateInput['targetType'],
  targetId: string,
): PublicContentNode | null {
  for (const node of nodes) {
    if (node.targetType === targetType && node.id === targetId) {
      return node;
    }
    const child = findNode(node.children ?? [], targetType, targetId);
    if (child) {
      return child;
    }
  }
  return null;
}

function isPublicationStateInput(input: unknown): input is PublicationStateInput {
  return input != null && typeof input === 'object' && 'targetType' in input && 'targetId' in input && 'state' in input;
}

function isPublicationBulkInput(input: unknown): input is PublicationBulkInput {
  return (
    input != null && typeof input === 'object' && 'targetType' in input && 'targetId' in input && 'operation' in input
  );
}
