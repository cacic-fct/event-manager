import { ServiceUnavailableException } from '@nestjs/common';
import { ExternalImportRecord, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';

const SUPPRESSION_ENTITY_TYPE = 'person_suppression';
const KEY_ENTITY_TYPE = 'person_suppression_key';
const SUPPRESSION_VERSION = 'v1';

// Keep this versioned encoding in sync with tools/evcomp-import/suppression.mjs.
function digest(secret: string, purpose: string, namespace: string, sourceId?: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['event-manager', 'import-suppression', SUPPRESSION_VERSION, purpose, namespace, sourceId ?? null]))
    .digest('hex');
}

export async function suppressErasedImportPeople(tx: Prisma.TransactionClient, personIds: string[]): Promise<number> {
  // Share the importer's lock so a concurrent import cannot recreate an erased person.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('evcomp-import'))`;
  const subjectRecords = await tx.externalImportRecord.findMany({
    where: { entityType: 'person', targetId: { in: personIds } },
  });
  // Older erasures left mappings after their People rows were deleted. They
  // cannot be resolved as a data subject again, so scrub those orphans too.
  const orphanedRecords = await tx.$queryRaw<ExternalImportRecord[]>`
    SELECT record.* FROM external_import_records record
    WHERE record."entityType" = 'person'
      AND NOT EXISTS (SELECT 1 FROM people WHERE people.id = record."targetId")
  `;
  const records = [...subjectRecords, ...orphanedRecords];
  if (records.length === 0) {
    return 0;
  }

  const secret = process.env['LGPD_IMPORT_SUPPRESSION_SECRET']?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ServiceUnavailableException('LGPD_IMPORT_SUPPRESSION_SECRET must contain at least 32 bytes to erase imported people.');
  }

  for (const sourceNamespace of new Set(records.map((record) => record.sourceNamespace))) {
    const keyWhere = { sourceNamespace, entityType: KEY_ENTITY_TYPE, sourceId: SUPPRESSION_VERSION };
    const fingerprint = digest(secret, 'key', sourceNamespace);
    const existingKey = await tx.externalImportRecord.findUnique({
      where: { sourceNamespace_entityType_sourceId: keyWhere },
    });
    if (existingKey && existingKey.targetId !== fingerprint) {
      throw new ServiceUnavailableException('LGPD import suppression key does not match existing suppression records.');
    }
    if (!existingKey) {
      const existingToken = await tx.externalImportRecord.findFirst({
        where: { sourceNamespace, entityType: SUPPRESSION_ENTITY_TYPE },
      });
      if (existingToken) {
        throw new ServiceUnavailableException('LGPD import suppression records have no verifiable key fingerprint.');
      }
    }
    await tx.externalImportRecord.upsert({
      where: { sourceNamespace_entityType_sourceId: keyWhere },
      create: { ...keyWhere, targetId: fingerprint },
      update: {},
    });
  }

  for (const record of records) {
    const tokenWhere = {
      sourceNamespace: record.sourceNamespace,
      entityType: SUPPRESSION_ENTITY_TYPE,
      sourceId: digest(secret, 'person', record.sourceNamespace, record.sourceId),
    };
    await tx.externalImportRecord.upsert({
      where: { sourceNamespace_entityType_sourceId: tokenWhere },
      create: { ...tokenWhere, targetId: 'suppressed' },
      update: {},
    });
  }

  const deleted = await tx.externalImportRecord.deleteMany({
    where: {
      OR: records.map((record) => ({
        sourceNamespace: record.sourceNamespace, entityType: 'person', sourceId: record.sourceId,
      })),
    },
  });
  return deleted.count;
}
