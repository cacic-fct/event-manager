import {
  createTransferTemplate,
  type ResolvedTransferDocument,
  type TransferBatchSummary,
  type TransferPreview,
  type TransferResource,
  type TransferResult,
  type TransferItem,
} from '@cacic-fct/shared-data-transfer';

export const transferDocumentFixture = createTransferTemplate('event');
export const transferResolvedDocumentFixture: ResolvedTransferDocument = {
  ...transferDocumentFixture,
  resources: transferDocumentFixture.resources.map((resource, index) => {
    const resolved: TransferResource = {
      ...resource,
      id: resource.id ?? `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    };
    delete resolved.key;
    return resolved;
  }),
};

export const transferBatchSummaryFixture: TransferBatchSummary = {
  batchId: 'fixture-history-batch',
  auditEntryId: 'fixture-history-audit',
  createdAt: new Date().toISOString(),
  summary: { create: 2, update: 1, unchanged: 0, skip: 0 },
  undone: false,
  synchronizationPending: false,
};

export function createTransferPreviewFixture(blocked = false): TransferPreview {
  const sourceResource = transferDocumentFixture.resources[0];
  const generatedId = '00000000-0000-4000-8000-000000000001';
  const ready: TransferItem = {
    kind: 'event',
    id: sourceResource.key ? generatedId : (sourceResource.id ?? generatedId),
    ...(sourceResource.key ? { key: sourceResource.key } : {}),
    action: 'create',
    status: 'ready',
    message: 'Um novo evento será criado.',
    changes: [{ field: 'data.name', before: null, after: 'Novo evento' }],
  };
  const items: TransferItem[] = blocked
    ? [
        ready,
        {
          kind: 'event-attendance',
          id: 'attendance-missing-person',
          action: 'skip',
          status: 'blocked',
          message: 'Não foi encontrada uma pessoa correspondente única.',
          changes: [],
        },
      ]
    : [ready];

  return {
    items,
    summary: { create: 1, update: 0, unchanged: 0, skip: blocked ? 1 : 0 },
    planHash: 'fixture-reviewed-plan',
    canApply: !blocked,
    allocation: sourceResource.key
      ? {
          token: 'fixture-allocation-token',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          ids: { [sourceResource.key]: generatedId },
        }
      : undefined,
  };
}

export function createTransferResultFixture(blocked = false): TransferResult {
  const preview = createTransferPreviewFixture(blocked);
  return {
    ...preview,
    applied: true,
    canApply: false,
    document: transferResolvedDocumentFixture,
    batchId: 'fixture-import-batch',
    auditEntryId: 'fixture-import-audit',
    synchronizationPending: false,
    items: preview.items.map((item) => (item.status === 'ready' ? { ...item, status: 'applied' as const } : item)),
  };
}
