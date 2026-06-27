import type { PublicContentNode } from '../../../graphql/publishing-api.service';
import {
  defaultScheduledPublicationDate,
  flattenPublicationListItems,
  flattenPublicationNodes,
  localDateTimeInputToIso,
  publicationChildCountLabel,
  publicationErrorMessage,
  publicationTargetIcon,
  publicationTargetLabel,
  toDateTimeInputValue,
} from './workspace-publishing-utils';

describe('workspace publishing utils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flattens publication nodes depth-first without mutating the tree', () => {
    const tree = [
      node('major-event', 'MAJOR_EVENT', [
        node('group', 'EVENT_GROUP', [node('group-event', 'EVENT')]),
        node('standalone-event', 'EVENT'),
      ]),
    ];

    expect(flattenPublicationNodes(tree).map((item) => item.id)).toEqual([
      'major-event',
      'group',
      'group-event',
      'standalone-event',
    ]);
    expect(tree[0].children?.[0].children).toHaveLength(1);
  });

  it('treats flat GraphQL nodes without children as leaves', () => {
    const item = node('flat-event', 'EVENT');
    delete item.children;

    expect(flattenPublicationNodes([item]).map((node) => node.id)).toEqual(['flat-event']);
    expect(flattenPublicationListItems([item]).map(({ node }) => node.id)).toEqual(['flat-event']);
  });

  it('keeps stable keys and levels for recursive list rendering', () => {
    const items = flattenPublicationListItems([
      node('major-event', 'MAJOR_EVENT', [node('group', 'EVENT_GROUP'), node('event', 'EVENT')]),
    ]);

    expect(items.map(({ key, level, node }) => ({ key, level, id: node.id }))).toEqual([
      { key: '/MAJOR_EVENT:major-event:0', level: 0, id: 'major-event' },
      { key: '/MAJOR_EVENT:major-event:0/EVENT_GROUP:group:0', level: 1, id: 'group' },
      { key: '/MAJOR_EVENT:major-event:0/EVENT:event:1', level: 1, id: 'event' },
    ]);
  });

  it('formats target metadata and child counts for the Portuguese UI', () => {
    expect(publicationTargetIcon('EVENT')).toBe('event');
    expect(publicationTargetIcon('EVENT_GROUP')).toBe('folder');
    expect(publicationTargetIcon('MAJOR_EVENT')).toBe('festival');

    expect(publicationTargetLabel('EVENT')).toBe('Evento');
    expect(publicationTargetLabel('EVENT_GROUP')).toBe('Grupo de eventos');
    expect(publicationTargetLabel('MAJOR_EVENT')).toBe('Grande evento');

    expect(publicationChildCountLabel(1)).toBe('1 item vinculado');
    expect(publicationChildCountLabel(2)).toBe('2 itens vinculados');
  });

  it('normalizes dates for scheduling inputs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 26, 15, 42, 31, 500));

    expect(defaultScheduledPublicationDate()).toEqual(new Date(2026, 5, 27, 15, 0, 0, 0));
    expect(toDateTimeInputValue(new Date(2026, 5, 26, 9, 5))).toBe('2026-06-26T09:05');
    expect(localDateTimeInputToIso('2026-06-26T09:05')).toBe(new Date('2026-06-26T09:05').toISOString());
  });

  it('preserves explicit errors and falls back for unknown failures', () => {
    expect(publicationErrorMessage(new Error('Falha simulada.'))).toBe('Falha simulada.');
    expect(publicationErrorMessage({ message: 'not an Error instance' })).toBe('Não foi possível concluir a operação.');
  });
});

function node(
  id: string,
  targetType: PublicContentNode['targetType'],
  children: PublicContentNode[] = [],
): PublicContentNode {
  return {
    targetType,
    id,
    label: id,
    publicationState: 'DRAFT',
    statusLabel: 'Rascunho',
    childCount: children.length,
    children,
  };
}
