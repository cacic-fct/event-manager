import { HttpResponse, http } from 'msw';
import {
  parseTransferDocument,
  TransferDocumentSchema,
  type ResolvedTransferDocument,
  type TransferApplyRequest,
  type TransferBatchSummary,
  type TransferDocument,
  type TransferItem,
  type TransferPreview,
  type TransferPreviewRequest,
  type TransferResource,
  type TransferResult,
  type TransferSummary,
  type TransferUndoResult,
} from '@cacic-fct/shared-data-transfer';
import { transferDocumentFixture } from './data-transfer-page.fixtures';

export interface DataTransferStoryRequestRecord {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

declare global {
  interface Window {
    __dataTransferStoryRequests?: DataTransferStoryRequestRecord[];
  }
}

const endpoint = '/api/admin/data-transfer';
const generatedBatchId = 'storybook-import-batch';
const generatedAuditId = 'storybook-import-audit';
const undoConflictMessage = 'Este lote não pode ser revertido porque um registro foi alterado depois da importação.';

let lastPreview: TransferPreview | null = null;
let batchHistory: TransferBatchSummary[] = [];
let committedResult: TransferResult | null = null;
let committedRequest = '';

export function resetDataTransferStoryApi(mode: string): void {
  lastPreview = null;
  committedResult = null;
  committedRequest = '';
  batchHistory = mode.endsWith('undo-only') ? [undoOnlyBatchFixture()] : [];
  if (typeof window !== 'undefined') {
    window.__dataTransferStoryRequests = [];
  }
}

export function createDataTransferStoryHandlers(getMode: () => string) {
  return [
    http.get(`${endpoint}/schema`, ({ request }) => {
      recordRequest(request);
      return HttpResponse.json(TransferDocumentSchema);
    }),
    http.get(`${endpoint}/history`, ({ request }) => {
      recordRequest(request);
      return HttpResponse.json(batchHistory);
    }),
    http.post(`${endpoint}/export`, async ({ request }) => {
      const body = await request.json();
      recordRequest(request, body);
      return HttpResponse.json({ document: transferDocumentFixture, issues: [] });
    }),
    http.post(`${endpoint}/preview`, async ({ request }) => {
      const body = (await request.json()) as TransferPreviewRequest;
      recordRequest(request, body);
      try {
        const document = parseTransferDocument(body.document);
        lastPreview = createPreview(document, getMode() === 'connected-blocked');
        return HttpResponse.json(lastPreview);
      } catch {
        return HttpResponse.json(
          { issues: [{ message: 'O servidor rejeitou o documento de exemplo.' }] },
          { status: 400 },
        );
      }
    }),
    http.post(`${endpoint}/apply`, async ({ request }) => {
      const body = (await request.json()) as TransferApplyRequest;
      recordRequest(request, body);
      if (getMode() === 'connected-response-lost' && committedResult && JSON.stringify(body) === committedRequest) {
        return HttpResponse.json(committedResult);
      }
      if (!lastPreview || body.planHash !== lastPreview.planHash) {
        return HttpResponse.json(
          { issues: [{ message: 'O plano revisado expirou. Revise o arquivo novamente.' }] },
          { status: 409 },
        );
      }
      if (lastPreview.summary.skip > 0 && !body.allowPartial) {
        return HttpResponse.json(
          { issues: [{ message: 'Confirme a importação parcial antes de aplicar.' }] },
          { status: 400 },
        );
      }

      const result = createResult(body, lastPreview);
      const historyEntry = summaryFromResult(result);
      batchHistory = [historyEntry, ...batchHistory.filter((batch) => batch.batchId !== historyEntry.batchId)];
      if (getMode() === 'connected-response-lost') {
        committedRequest = JSON.stringify(body);
        committedResult = result;
        return HttpResponse.json({ message: 'Resposta interrompida após salvar o lote.' }, { status: 503 });
      }
      return HttpResponse.json(result);
    }),
    http.post(`${endpoint}/undo`, async ({ request }) => {
      const body = (await request.json()) as { batchId: string };
      recordRequest(request, body);
      if (getMode() === 'connected-conflict') {
        return HttpResponse.json({ issues: [{ message: undoConflictMessage }] }, { status: 409 });
      }
      const batch = batchHistory.find((item) => item.batchId === body.batchId);
      if (!batch || batch.undone) {
        return HttpResponse.json(
          { issues: [{ message: 'Esta importação já foi revertida ou não está disponível.' }] },
          { status: 409 },
        );
      }
      batchHistory = batchHistory.map((item) => (item.batchId === body.batchId ? { ...item, undone: true } : item));
      const result: TransferUndoResult = {
        batchId: body.batchId,
        auditEntryId: `storybook-undo-audit-${body.batchId}`,
        undone: true,
      };
      return HttpResponse.json(result);
    }),
  ];
}

function createPreview(document: TransferDocument, blocked: boolean): TransferPreview {
  const allocationIds: Record<string, string> = {};
  document.resources.forEach((resource, index) => {
    if (!resource.id && resource.key) {
      allocationIds[resource.key] = generatedId(index);
    }
  });

  const items: TransferItem[] = document.resources.map((resource, index) => {
    const id = resource.id ?? (resource.key ? allocationIds[resource.key] : undefined) ?? generatedId(index);
    return {
      kind: resource.kind,
      id,
      ...(resource.key ? { key: resource.key } : {}),
      label: resourceName(resource),
      action: resource.id ? 'update' : 'create',
      status: 'ready',
      message: resource.id
        ? 'Os campos diferentes serão atualizados.'
        : 'Este recurso será criado com um ID reservado.',
      changes: [
        {
          field: 'data.name',
          before: resource.id ? 'Nome atual' : null,
          after: resourceName(resource),
        },
      ],
    };
  });

  if (blocked) {
    items.push({
      kind: 'event-attendance',
      id: 'attendance-without-person-match',
      action: 'skip',
      status: 'blocked',
      message: 'Não foi encontrada uma pessoa correspondente única para esta presença.',
      changes: [],
    });
  }

  const summary: TransferSummary = {
    create: items.filter((item) => item.action === 'create').length,
    update: items.filter((item) => item.action === 'update').length,
    unchanged: 0,
    skip: blocked ? 1 : 0,
  };
  const hasAllocation = Object.keys(allocationIds).length > 0;

  return {
    items,
    summary,
    planHash: 'storybook-reviewed-plan',
    canApply: !blocked && (summary.create > 0 || summary.update > 0),
    ...(hasAllocation
      ? {
          allocation: {
            token: 'storybook-allocation-token',
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            ids: allocationIds,
          },
        }
      : {}),
  };
}

function createResult(body: TransferApplyRequest, preview: TransferPreview): TransferResult {
  const document = parseTransferDocument(body.document);
  const resources: TransferResource[] = document.resources.map((resource, index) => {
    const id = resource.id ?? (resource.key ? preview.allocation?.ids[resource.key] : undefined) ?? generatedId(index);
    const resolvedResource: TransferResource = { ...resource, id };
    delete resolvedResource.key;
    return resolvedResource;
  });
  const resolvedDocument: ResolvedTransferDocument = { ...document, resources };

  return {
    ...preview,
    applied: true,
    canApply: false,
    document: resolvedDocument,
    batchId: generatedBatchId,
    auditEntryId: generatedAuditId,
    synchronizationPending: false,
    items: preview.items.map((item) => (item.status === 'ready' ? { ...item, status: 'applied' } : item)),
  };
}

function summaryFromResult(result: TransferResult): TransferBatchSummary {
  return {
    batchId: result.batchId ?? generatedBatchId,
    auditEntryId: result.auditEntryId ?? generatedAuditId,
    createdAt: new Date().toISOString(),
    summary: result.summary,
    undone: false,
    synchronizationPending: result.synchronizationPending ?? false,
  };
}

function undoOnlyBatchFixture(): TransferBatchSummary {
  return {
    batchId: 'storybook-history-batch',
    auditEntryId: 'storybook-history-audit',
    createdAt: new Date().toISOString(),
    summary: { create: 2, update: 1, unchanged: 0, skip: 0 },
    undone: false,
    synchronizationPending: false,
  };
}

function resourceName(resource: TransferDocument['resources'][number]): string {
  const data = resource.data;
  if (data !== null && typeof data === 'object' && 'name' in data && typeof data.name === 'string') {
    return data.name;
  }
  return 'Novo recurso';
}

function generatedId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function recordRequest(request: Request, body?: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.__dataTransferStoryRequests ??= [];
  window.__dataTransferStoryRequests.push({
    method: request.method as 'GET' | 'POST',
    path: new URL(request.url).pathname,
    ...(body === undefined ? {} : { body }),
  });
}
