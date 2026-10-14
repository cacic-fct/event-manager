/** Internal transaction capability. It is never read from request JSON or persisted as a symbol. */
export const AUDIT_BATCH_TRANSACTION = Symbol('audit-batch-transaction');

export function auditBatchId(client: object): string | undefined {
  const value: unknown = Reflect.get(client, AUDIT_BATCH_TRANSACTION);
  return typeof value === 'string' ? value : undefined;
}

export function isBatchAuditEntry(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === 'object' && 'dataTransferBatchId' in metadata);
}
