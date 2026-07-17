import { AuditLogActorType, AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActor, AuditPrismaClient } from '../audit-log/audit-log.types';
import { CertificateConfigRecord, CertificateRecord } from './certificate.constants';

type CertificateWriteClient = AuditPrismaClient;

export class CertificateIssuanceAudit {
  constructor(private readonly auditLog: AuditLogService) {}

  async record(
    before: CertificateRecord | null,
    after: CertificateRecord,
    operation: AuditLogOperation,
    actorId: string | undefined,
    prisma: CertificateWriteClient,
  ): Promise<void> {
    const actor = await this.resolveActor(actorId, prisma);
    const config = after.config;
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.CERTIFICATE,
        entityId: after.id,
        entityLabel: `${config.name} — ${after.person.name}`,
        operation,
        actor,
        before,
        after,
        force: true,
        summary:
          operation === AuditLogOperation.ISSUE
            ? 'Certificado emitido.'
            : operation === AuditLogOperation.DELETE
              ? 'Certificado removido.'
              : 'Certificado reemitido.',
        scope: this.scopeForConfig(config),
      },
      prisma,
    );
  }

  private async resolveActor(
    actorId: string | undefined,
    prisma: CertificateWriteClient,
  ): Promise<AuditActor | undefined> {
    if (!actorId) return undefined;
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, email: true },
    });
    return {
      id: actorId,
      name: user?.name ?? actorId,
      email: user?.email ?? null,
      type: AuditLogActorType.USER,
    };
  }

  private scopeForConfig(config: CertificateConfigRecord) {
    return {
      eventId: config.eventId,
      eventGroupId: config.eventGroupId,
      majorEventId: config.majorEventId,
    };
  }
}
