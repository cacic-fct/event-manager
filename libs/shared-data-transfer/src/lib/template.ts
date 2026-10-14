import type { TransferTarget } from './models';
import type { TransferDocument } from './schema';
import { TRANSFER_FORMAT, TRANSFER_SCHEMA_ID, TRANSFER_VERSION } from './schema-helpers';

export function createTransferTemplate(
  kind: TransferTarget['kind'] = 'major-event',
  now = new Date(),
  scope?: TransferTarget,
): TransferDocument {
  const startDate = new Date(now.getTime() + 7 * 86400000).toISOString();
  const endDate = new Date(now.getTime() + 7 * 86400000 + 3600000).toISOString();

  if (scope?.kind === kind) {
    if (kind === 'major-event') {
      return createDocument([
        { kind, id: scope.id, data: {} },
        { kind: 'group', key: 'GROUP-1', data: { name: 'Novo grupo de eventos', majorEventId: scope.id } },
        {
          kind: 'event',
          key: 'EVENT-1',
          data: {
            name: 'Novo evento',
            startDate,
            endDate,
            eventGroupId: 'GROUP-1',
            majorEventId: scope.id,
          },
        },
      ]);
    }

    if (kind === 'group') {
      return createDocument([
        { kind, id: scope.id, data: {} },
        {
          kind: 'event',
          key: 'EVENT-1',
          data: { name: 'Novo evento', startDate, endDate, eventGroupId: scope.id },
        },
      ]);
    }

    return createDocument([{ kind, id: scope.id, data: {} }]);
  }

  const resources: TransferDocument['resources'] = [];
  if (kind === 'major-event') {
    resources.push({ kind, key: 'MAJOR-1', data: { name: 'Novo grande evento', startDate, endDate } });
  }
  if (kind !== 'event') {
    resources.push({
      kind: 'group',
      key: 'GROUP-1',
      data: { name: 'Novo grupo de eventos', ...(kind === 'major-event' ? { majorEventId: 'MAJOR-1' } : {}) },
    });
  }
  resources.push({
    kind: 'event',
    key: 'EVENT-1',
    data: {
      name: 'Novo evento',
      startDate,
      endDate,
      ...(kind !== 'event' ? { eventGroupId: 'GROUP-1' } : {}),
      ...(kind === 'major-event' ? { majorEventId: 'MAJOR-1' } : {}),
    },
  });
  return createDocument(resources);
}

function createDocument(resources: TransferDocument['resources']): TransferDocument {
  return { $schema: TRANSFER_SCHEMA_ID, format: TRANSFER_FORMAT, version: TRANSFER_VERSION, resources };
}
