import { AuditLogActorType, AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuditActor, type AuditPrismaClient } from '../audit-log/audit-log.types';
import { type CertificateConfigRecord, type CertificateRecord } from './certificate.constants';
import { toCertificateAuditSnapshot } from './certificate-audit-snapshots';

type CertificateWriteClient = AuditPrismaClient;

export class CertificateIssuanceAudit {
  constructor(private readonly auditLog: AuditLogService) {}

  async record(
    before: CertificateRecord | null,
    after: CertificateRecord,
    operation: AuditLogOperation,
    actorId: string | undefined,
    prisma: CertificateWriteClient,
    actor?: AuditActor,
  ): Promise<void> {
    const resolvedActor = actor ?? (await this.resolveActor(actorId, prisma));
    const config = after.config;
    const renderedDataChanged = before !== null && !isDeepStrictEqual(before.renderedData, after.renderedData);
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.CERTIFICATE,
        entityId: after.id,
        entityLabel: `${config.name} — ${after.person.name}`,
        operation,
        actor: resolvedActor,
        before: before ? toCertificateAuditSnapshot(before) : null,
        after: toCertificateAuditSnapshot(after),
        force: operation !== AuditLogOperation.REISSUE || renderedDataChanged,
        ...(operation === AuditLogOperation.REISSUE ? { metadata: { renderedDataChanged } } : {}),
        summary:
          operation === AuditLogOperation.UPDATE
            ? 'Revogação por remoção da lista retirada. Aguardando emissão.'
            : operation === AuditLogOperation.ISSUE
              ? 'Certificado emitido.'
              : operation === AuditLogOperation.DELETE
                ? after.revokedAt
                  ? 'Certificado revogado. Reemissão bloqueada.'
                  : 'Certificado invalidado por alteração de elegibilidade.'
                : before?.revokedAt && !after.revokedAt
                  ? 'Revogação removida e certificado reemitido.'
                  : 'Certificado reemitido.',
        scope: this.scopeForConfig(config),
      },
      prisma,
    );
  }

  async resolveActor(actorId: string | undefined, prisma: CertificateWriteClient): Promise<AuditActor | undefined> {
    if (!actorId) {
      return undefined;
    }
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
