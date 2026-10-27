import { CertificateIssuedTo } from '@cacic-fct/shared-data-types';
import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { AuditLogOperation } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { DeferredInjection } from '../common/deferred-injection';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateAdministrationAudit } from './certificate-administration-audit';
import { CERTIFICATE_SELECT, PERSON_SELECT } from './certificate.constants';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateIssuanceAudit } from './certificate-issuance-audit';
import { CertificateNotificationJobsService } from './certificate-notification-jobs.service';
import { lockCertificateRecipient } from './certificate-recipient-lock';
import { isManualCertificateIssuedTo } from './certificate-sports-roles';

@Injectable()
export class CertificateManualRecipientsService {
  private readonly administrationAudit: CertificateAdministrationAudit;
  private readonly certificateAudit: CertificateIssuanceAudit;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly notifications: CertificateNotificationJobsService,
    @Inject(forwardRef(() => AuditLogService)) audit: DeferredInjection<AuditLogService>,
  ) {
    this.administrationAudit = new CertificateAdministrationAudit(audit);
    this.certificateAudit = new CertificateIssuanceAudit(audit);
  }

  async list(configId: string) {
    const saved = await this.prisma.certificateManualRecipient.findMany({
      where: { configId, removedAt: null, person: { deletedAt: null } },
      select: { person: { select: PERSON_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    return saved.map(({ person }) => person);
  }

  async add(configId: string, personId: string, actorId?: string) {
    await this.assertManualConfig(configId);
    const person = await this.prisma.people.findFirst({
      where: { id: personId, deletedAt: null },
      select: PERSON_SELECT,
    });
    if (!person) throw new BadRequestException('Pessoa não encontrada.');
    await this.prisma.$transaction(async (tx) => {
      await lockCertificateRecipient(tx, configId, personId);
      const before = await tx.certificateManualRecipient.findUnique({
        where: { configId_personId: { configId, personId } },
      });
      if (before && !before.removedAt) return;
      await tx.certificateManualRecipient.upsert({
        where: { configId_personId: { configId, personId } },
        create: { configId, personId, createdById: actorId },
        update: { removedAt: null },
      });
      const certificate = await tx.certificate.findUnique({
        where: { personId_configId: { configId, personId } },
        select: CERTIFICATE_SELECT,
      });
      if (certificate?.revocationReason === 'MANUAL_RECIPIENT_REMOVED') {
        const restored = await tx.certificate.update({
          where: { id: certificate.id },
          data: { revokedAt: null, revokedById: null, revocationReason: null },
          select: CERTIFICATE_SELECT,
        });
        await this.certificateAudit.record(certificate, restored, AuditLogOperation.UPDATE, actorId, tx);
      }
      await this.administrationAudit.record(
        tx,
        configId,
        actorId,
        AuditLogOperation.ASSIGN,
        'Destinatário adicionado à lista manual de certificados.',
        { resourceType: 'CERTIFICATE_MANUAL_RECIPIENT', personId, included: true },
      );
    });
    return person;
  }

  async remove(configId: string, personId: string, actorId?: string) {
    await this.assertManualConfig(configId);
    await this.prisma.$transaction(async (tx) => {
      await lockCertificateRecipient(tx, configId, personId);
      const before = await tx.certificateManualRecipient.findUnique({
        where: { configId_personId: { configId, personId } },
      });
      if (before?.removedAt) return;
      const now = new Date();
      await tx.certificateManualRecipient.upsert({
        where: { configId_personId: { configId, personId } },
        create: { configId, personId, createdById: actorId, removedAt: now },
        update: { removedAt: now },
      });
      const certificate = await tx.certificate.findUnique({
        where: { personId_configId: { configId, personId } },
        select: CERTIFICATE_SELECT,
      });
      if (certificate) {
        const revoked = await tx.certificate.update({
          where: { id: certificate.id },
          data: {
            deletedAt: certificate.deletedAt ?? now,
            revokedAt: certificate.revokedAt ?? now,
            revokedById: certificate.revokedById ?? actorId ?? null,
            revocationReason: certificate.revocationReason === 'ADMIN' ? 'ADMIN' : 'MANUAL_RECIPIENT_REMOVED',
          },
          select: CERTIFICATE_SELECT,
        });
        await this.notifications.supersedeCertificateNotifications(certificate.id, tx);
        await this.certificateAudit.record(certificate, revoked, AuditLogOperation.DELETE, actorId, tx);
      }
      await this.administrationAudit.record(
        tx,
        configId,
        actorId,
        AuditLogOperation.UNDO,
        'Destinatário removido da lista manual. Certificado revogado e futuras emissões bloqueadas.',
        { resourceType: 'CERTIFICATE_MANUAL_RECIPIENT', personId, included: false },
      );
    });
    return { id: personId, deleted: true };
  }

  private async assertManualConfig(configId: string) {
    const config = await this.eligibility.getConfigById(configId);
    if (!isManualCertificateIssuedTo(config.issuedTo as CertificateIssuedTo)) {
      throw new BadRequestException('A lista de destinatários está disponível apenas para certificados manuais.');
    }
  }
}
