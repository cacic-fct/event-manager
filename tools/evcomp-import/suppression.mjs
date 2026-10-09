import { createHmac } from 'node:crypto';

// Keep this versioned encoding in sync with backend lgpd-import-suppression.ts.
export function suppressionDigest(secret, purpose, namespace, sourceId = null) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['event-manager', 'import-suppression', 'v1', purpose, namespace, sourceId]))
    .digest('hex');
}

export async function loadSuppressedPeople(target, namespace, secret = process.env.LGPD_IMPORT_SUPPRESSION_SECRET) {
  const { rows } = await target.query(
    `SELECT "entityType", "sourceId", "targetId" FROM external_import_records
    WHERE "sourceNamespace"=$1 AND "entityType" IN ('person_suppression', 'person_suppression_key')`,
    [namespace],
  );
  if (rows.length === 0) return new Set();

  const normalizedSecret = secret?.trim();
  if (!normalizedSecret || Buffer.byteLength(normalizedSecret, 'utf8') < 32) {
    throw new Error('LGPD_IMPORT_SUPPRESSION_SECRET must contain at least 32 bytes to import after person erasure.');
  }
  const key = rows.find((row) => row.entityType === 'person_suppression_key' && row.sourceId === 'v1');
  if (!key || key.targetId !== suppressionDigest(normalizedSecret, 'key', namespace)) {
    throw new Error('LGPD import suppression key does not match existing suppression records.');
  }
  return new Set(rows.filter((row) => row.entityType === 'person_suppression').map((row) => row.sourceId));
}
