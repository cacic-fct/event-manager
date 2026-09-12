export async function assertProvenanceSchema(target) {
  const { rows } = await target.query("SELECT to_regclass('external_import_records') AS table_name");
  if (!rows[0]?.table_name) {
    throw new Error('Apply the external_import_records migration before running the EvComp importer.');
  }
}

export async function getImportedTarget(target, sourceNamespace, entityType, sourceId) {
  const { rows } = await target.query(
    `SELECT "targetId" FROM external_import_records
    WHERE "sourceNamespace"=$1 AND "entityType"=$2 AND "sourceId"=$3`,
    [sourceNamespace, entityType, String(sourceId)],
  );
  return rows[0]?.targetId ?? null;
}

export async function recordImportedTarget(target, sourceNamespace, entityType, sourceId, targetId) {
  await target.query(
    `INSERT INTO external_import_records ("sourceNamespace", "entityType", "sourceId", "targetId")
    VALUES ($1,$2,$3,$4)`,
    [sourceNamespace, entityType, String(sourceId), targetId],
  );
}
