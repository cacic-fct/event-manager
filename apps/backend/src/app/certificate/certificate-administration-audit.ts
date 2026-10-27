import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, type CertificateIssuanceRun } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuditPrismaClient } from '../audit-log/audit-log.types';

type CertificateAuditScope = {
  id: string;
  name: string;
  eventId?: string | null;
  eventGroupId?: string | null;
  majorEventId?: string | null;
};

const RUN_OPERATIONS = {
  PENDING: AuditLogOperation.ISSUE,
  PROCESSING: AuditLogOperation.START,
  COMPLETED: AuditLogOperation.FINALIZE,
  FAILED: AuditLogOperation.REJECT,
  CANCELLED: AuditLogOperation.UNDO,
};
const RUN_SUMMARIES = {
  PENDING: 'Emissão de certificados solicitada.',
  PROCESSING: 'Emissão de certificados iniciada.',
  COMPLETED: 'Emissão de certificados concluída.',
  FAILED: 'Emissão de certificados falhou.',
  CANCELLED: 'Emissão de certificados cancelada.',
};

export class CertificateAdministrationAudit {
  constructor(private readonly audit: AuditLogService) {}

  async record(
    client: AuditPrismaClient,
    configId: string,
    actorId: string | undefined,
    operation: AuditLogOperation,
    summary: string,
    metadata: Record<string, unknown>,
    knownConfig?: CertificateAuditScope,
  ) {
    const config =
      knownConfig ??
      (await client.certificateConfig.findUniqueOrThrow({
        where: { id: configId },
        select: { id: true, name: true, eventId: true, eventGroupId: true, majorEventId: true },
      }));
    const user = actorId
      ? await client.user.findUnique({
          where: { id: actorId },
          select: { name: true, email: true },
        })
      : null;
    await this.audit.record(
      {
        entityType: AuditLogEntityType.CERTIFICATE_CONFIG,
        entityId: configId,
        entityLabel: config.name,
        operation,
        summary,
        actor: actorId
          ? { id: actorId, name: user?.name ?? actorId, email: user?.email, type: AuditLogActorType.USER }
          : { name: 'Reconciliação de certificados', type: AuditLogActorType.SYSTEM },
        scope: config,
        metadata,
        force: true,
        squashWindowMs: 0,
      },
      client,
    );
  }

  async recordRun(client: AuditPrismaClient, run: CertificateIssuanceRun) {
    const operation = run.error ? AuditLogOperation.REJECT : RUN_OPERATIONS[run.status];
    const summary =
      run.error && run.status === 'PENDING'
        ? 'Emissão interrompida. Nova tentativa pendente.'
        : RUN_SUMMARIES[run.status];
    return this.record(client, run.configId, run.requestedById ?? undefined, operation, summary, {
      resourceType: 'CERTIFICATE_ISSUANCE_RUN',
      runId: run.id,
      status: run.status,
      scheduledAt: run.scheduledAt.toISOString(),
      reissue: run.reissue,
      notifyRecipients: run.notifyRecipients,
      automatic: run.automatic,
      certificateCount: run.certificateCount,
      error: run.error,
    });
  }
}
