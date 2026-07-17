import { CertificateIssuedTo, CertificateReissueResult, CertificateScope } from '@cacic-fct/shared-data-types';
import { AuditLogOperation } from '@prisma/client';
import { AuditActor, AuditPrismaClient } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { CERTIFICATE_CONFIG_SELECT, CERTIFICATE_SELECT, CertificateConfigRecord, CertificateRecord } from './certificate.constants';
import { CertificateEligibilityService, EligibleCertificateRecipient } from './certificate-eligibility.service';
import { CertificateIssuanceAudit } from './certificate-issuance-audit';
import { CertificateValidationService } from './certificate-validation.service';

type CertificateWriteClient = AuditPrismaClient;
type CertificateReissueClient = AuditPrismaClient;
type CertificateUpsertResult = { certificate: CertificateRecord; shouldNotify: boolean };

type UpsertCertificate = (
  config: CertificateConfigRecord,
  recipient: EligibleCertificateRecipient,
  issuedById?: string,
  options?: { auditActor?: AuditActor; notify?: boolean; prisma?: CertificateWriteClient },
) => Promise<CertificateUpsertResult>;

export class CertificateIssuanceRefresh {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly upsertCertificate: UpsertCertificate,
    private readonly audit: CertificateIssuanceAudit,
    private readonly notifyCertificateAvailable: (certificate: CertificateRecord) => Promise<void> = async () => undefined,
  ) {}

  async reissueAll(issuedById?: string): Promise<CertificateReissueResult> {
    const configs = await this.prisma.certificateConfig.findMany({
      where: { deletedAt: null },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const auditActor = await this.audit.resolveActor(issuedById, this.prisma);
    return this.reissueConfigs(configs, issuedById, { auditActor });
  }

  async reissueFolder(
    folderId: string,
    issuedById?: string,
    client: CertificateReissueClient = this.prisma,
    options: { notify?: boolean } = {},
  ): Promise<CertificateReissueResult> {
    const normalizedFolderId = this.validation.normalizeRequiredId('folderId', folderId);
    const configs = await client.certificateConfig.findMany({
      where: {
        deletedAt: null,
        scope: CertificateScope.OTHER,
        folderId: normalizedFolderId,
      },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const auditActor = await this.audit.resolveActor(issuedById, client);
    return this.reissueConfigs(configs, issuedById, { auditActor, client, notify: options.notify });
  }

  async refreshForPerson(personId: string, issuedById?: string): Promise<CertificateRecord[]> {
    const normalizedPersonId = this.validation.normalizeRequiredId('personId', personId);
    const refreshed = await this.prisma.$transaction(async (tx) => {
      const existingCertificates = await tx.certificate.findMany({
        where: {
          personId: normalizedPersonId,
          deletedAt: null,
          config: { deletedAt: null, isActive: true },
          person: { deletedAt: null },
        },
        select: { configId: true },
        orderBy: { issuedAt: 'asc' },
      });

      const auditActor = await this.audit.resolveActor(issuedById, tx);
      return this.refreshConfigsForPerson(
        normalizedPersonId,
        [...new Set(existingCertificates.map((certificate) => certificate.configId))],
        issuedById,
        tx,
        auditActor,
      );
    });

    await this.notifyPendingCertificates(refreshed);
    return refreshed.map(({ certificate }) => certificate);
  }

  async refreshAfterPeopleMerge(
    targetPersonId: string,
    sourcePersonId: string,
    issuedById?: string,
  ): Promise<CertificateRecord[]> {
    const normalizedTargetPersonId = this.validation.normalizeRequiredId('targetPersonId', targetPersonId);
    const normalizedSourcePersonId = this.validation.normalizeRequiredId('sourcePersonId', sourcePersonId);
    const refreshed = await this.prisma.$transaction(async (tx) => {
      const auditActor = await this.audit.resolveActor(issuedById, tx);
      const mergedCertificates = await tx.certificate.findMany({
        where: {
          personId: { in: [normalizedTargetPersonId, normalizedSourcePersonId] },
          deletedAt: null,
          config: { deletedAt: null, isActive: true },
        },
        select: { configId: true },
        orderBy: { issuedAt: 'asc' },
      });
      const configIds = [...new Set(mergedCertificates.map((certificate) => certificate.configId))];
      const refreshedCertificates = await this.refreshConfigsForPerson(normalizedTargetPersonId, configIds, issuedById, tx, auditActor);

      const sourceCertificates = await tx.certificate.findMany({
        where: { personId: normalizedSourcePersonId, deletedAt: null },
        select: CERTIFICATE_SELECT,
      });
      if (sourceCertificates.length === 0) {
        return refreshedCertificates;
      }

      const deletedAt = new Date();
      await tx.certificate.updateMany({
        where: { personId: normalizedSourcePersonId, deletedAt: null },
        data: { deletedAt },
      });
      await Promise.all(
        sourceCertificates.map((certificate) =>
          this.audit.record(
            certificate as CertificateRecord,
            { ...certificate, deletedAt } as CertificateRecord,
            AuditLogOperation.DELETE,
            issuedById,
            tx,
            auditActor,
          ),
        ),
      );

      return refreshedCertificates;
    });

    await this.notifyPendingCertificates(refreshed);
    return refreshed.map(({ certificate }) => certificate);
  }

  private async reissueConfigs(
    configs: CertificateConfigRecord[],
    issuedById?: string,
    options: { auditActor?: AuditActor; client?: CertificateReissueClient; notify?: boolean } = {},
  ): Promise<CertificateReissueResult> {
    let certificateCount = 0;
    for (const config of configs) {
      const certificates = await this.issueForConfigResults(config, issuedById, options);
      certificateCount += certificates.length;
    }

    return { configCount: configs.length, certificateCount };
  }

  async issueForConfig(
    config: CertificateConfigRecord,
    issuedById?: string,
    options: { auditActor?: AuditActor; client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateRecord[]> {
    return (await this.issueForConfigResults(config, issuedById, options)).map(({ certificate }) => certificate);
  }

  private async issueForConfigResults(
    config: CertificateConfigRecord,
    issuedById?: string,
    options: { auditActor?: AuditActor; client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateUpsertResult[]> {
    const client = options.client ?? this.prisma;
    const auditActor = options.auditActor ?? (await this.audit.resolveActor(issuedById, client));
    const existingCertificates = await client.certificate.findMany({
      where: { configId: config.id, deletedAt: null },
      select: { personId: true },
    });

    if (config.issuedTo === CertificateIssuedTo.OTHER) {
      return this.refreshManualConfig(config, existingCertificates.map((certificate) => certificate.personId), issuedById, {
        ...options,
        auditActor,
      });
    }

    const recipients = await this.eligibility.resolveEligibleRecipients(config);
    const eligiblePersonIds = new Set(recipients.map((recipient) => recipient.person.id));
    const invalidPersonIds = existingCertificates
      .map((certificate) => certificate.personId)
      .filter((personId) => !eligiblePersonIds.has(personId));
    if (invalidPersonIds.length > 0) {
      await this.invalidateCertificates(config.id, invalidPersonIds, issuedById, client, auditActor);
    }

    return this.upsertRecipients(config, recipients, issuedById, { ...options, auditActor });
  }

  private async refreshManualConfig(
    config: CertificateConfigRecord,
    personIds: string[],
    issuedById?: string,
    options: { auditActor?: AuditActor; client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateUpsertResult[]> {
    const certificates: CertificateUpsertResult[] = [];
    for (const batch of batches(personIds)) {
      const refreshed = await Promise.all(
        batch.map(async (personId) => {
          const recipients = await this.eligibility.resolveEligibleRecipients(config, personId);
          const recipient = recipients.find((item) => item.person.id === personId);
          if (recipient) {
            return this.upsertCertificate(config, recipient, issuedById, {
              auditActor: options.auditActor,
              prisma: options.client,
              notify: options.notify,
            });
          }
          await this.invalidateCertificates(config.id, [personId], issuedById, options.client ?? this.prisma, options.auditActor);
          return null;
        }),
      );
      certificates.push(...refreshed.filter((certificate): certificate is CertificateUpsertResult => certificate !== null));
    }
    return certificates;
  }

  private async refreshConfigsForPerson(
    personId: string,
    configIds: string[],
    issuedById?: string,
    client: CertificateWriteClient = this.prisma,
    auditActor?: AuditActor,
  ): Promise<CertificateUpsertResult[]> {
    const certificates: CertificateUpsertResult[] = [];
    for (const batch of batches(configIds)) {
      const refreshed = await Promise.all(
        batch.map(async (configId) => {
          const config = await this.eligibility.getConfigById(configId);
          const recipients = await this.eligibility.resolveEligibleRecipients(config, personId);
          const recipient = recipients.find((item) => item.person.id === personId);
          if (recipient) {
            return this.upsertCertificate(config, recipient, issuedById, { auditActor, prisma: client });
          }
          await this.invalidateCertificates(config.id, [personId], issuedById, client, auditActor);
          return null;
        }),
      );
      certificates.push(...refreshed.filter((certificate): certificate is CertificateUpsertResult => certificate !== null));
    }
    return certificates;
  }

  private async upsertRecipients(
    config: CertificateConfigRecord,
    recipients: EligibleCertificateRecipient[],
    issuedById?: string,
    options: { auditActor?: AuditActor; client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateUpsertResult[]> {
    const certificates: CertificateUpsertResult[] = [];
    for (const batch of batches(recipients)) {
      certificates.push(
        ...(await Promise.all(
          batch.map((recipient) =>
            this.upsertCertificate(config, recipient, issuedById, {
              auditActor: options.auditActor,
              prisma: options.client,
              notify: options.notify,
            }),
          ),
        )),
      );
    }
    return certificates;
  }

  private async notifyPendingCertificates(results: CertificateUpsertResult[]): Promise<void> {
    await Promise.all(
      results.filter(({ shouldNotify }) => shouldNotify).map(({ certificate }) => this.notifyCertificateAvailable(certificate)),
    );
  }

  private async invalidateCertificates(
    configId: string,
    personIds: string[],
    issuedById: string | undefined,
    client: CertificateWriteClient,
    auditActor?: AuditActor,
  ): Promise<void> {
    const remove = async (prisma: CertificateWriteClient) => {
      const certificates = await prisma.certificate.findMany({
        where: { configId, deletedAt: null, personId: { in: personIds } },
        select: CERTIFICATE_SELECT,
      });
      if (certificates.length === 0) {
        return;
      }

      const deletedAt = new Date();
      await prisma.certificate.updateMany({
        where: { configId, deletedAt: null, personId: { in: personIds } },
        data: { deletedAt },
      });
      await Promise.all(
        certificates.map((certificate) =>
          this.audit.record(
            certificate as CertificateRecord,
            { ...certificate, deletedAt } as CertificateRecord,
            AuditLogOperation.DELETE,
            issuedById,
            prisma,
            auditActor,
          ),
        ),
      );
    };

    if (client === this.prisma) {
      await this.prisma.$transaction((tx) => remove(tx));
      return;
    }
    await remove(client);
  }
}

function* batches<T>(items: T[], size = 10): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}
