import { type AuditPrismaClient } from '../audit-log/audit-log.types';

/** Call inside the transaction that changes membership, revocation, or issuance. */
export async function lockCertificateRecipient(
  client: AuditPrismaClient,
  configId: string,
  personId: string,
): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([configId, personId])}, 0))`;
}
