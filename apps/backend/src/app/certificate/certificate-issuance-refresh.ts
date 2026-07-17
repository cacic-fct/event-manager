import { CertificateIssuedTo, CertificateReissueResult, CertificateScope } from '@cacic-fct/shared-data-types';
import { PrismaService } from '../prisma/prisma.service';
import { CERTIFICATE_CONFIG_SELECT, CertificateConfigRecord, CertificateRecord } from './certificate.constants';
import { CertificateEligibilityService, EligibleCertificateRecipient } from './certificate-eligibility.service';
import { CertificateValidationService } from './certificate-validation.service';

type CertificateWriteClient = Pick<PrismaService, 'certificate'>;
type CertificateReissueClient = Pick<PrismaService, 'certificate' | 'certificateConfig'>;

type UpsertCertificate = (
  config: CertificateConfigRecord,
  recipient: EligibleCertificateRecipient,
  issuedById?: string,
  options?: { notify?: boolean; prisma?: CertificateWriteClient },
) => Promise<CertificateRecord>;

export class CertificateIssuanceRefresh {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly upsertCertificate: UpsertCertificate,
  ) {}

  async reissueAll(issuedById?: string): Promise<CertificateReissueResult> {
    const configs = await this.prisma.certificateConfig.findMany({
      where: { deletedAt: null },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return this.reissueConfigs(configs, issuedById);
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

    return this.reissueConfigs(configs, issuedById, { client, notify: options.notify });
  }

  async refreshForPerson(personId: string, issuedById?: string): Promise<CertificateRecord[]> {
    const normalizedPersonId = this.validation.normalizeRequiredId('personId', personId);
    const existingCertificates = await this.prisma.certificate.findMany({
      where: {
        personId: normalizedPersonId,
        deletedAt: null,
        config: { deletedAt: null, isActive: true },
        person: { deletedAt: null },
      },
      select: { configId: true },
      orderBy: { issuedAt: 'asc' },
    });

    return this.refreshConfigsForPerson(
      normalizedPersonId,
      existingCertificates.map((certificate) => certificate.configId),
      issuedById,
    );
  }

  async refreshAfterPeopleMerge(
    targetPersonId: string,
    sourcePersonId: string,
    issuedById?: string,
  ): Promise<CertificateRecord[]> {
    const normalizedTargetPersonId = this.validation.normalizeRequiredId('targetPersonId', targetPersonId);
    const normalizedSourcePersonId = this.validation.normalizeRequiredId('sourcePersonId', sourcePersonId);
    const mergedCertificates = await this.prisma.certificate.findMany({
      where: {
        personId: { in: [normalizedTargetPersonId, normalizedSourcePersonId] },
        deletedAt: null,
        config: { deletedAt: null, isActive: true },
      },
      select: { configId: true },
      orderBy: { issuedAt: 'asc' },
    });
    const configIds = [...new Set(mergedCertificates.map((certificate) => certificate.configId))];
    const refreshedCertificates = await this.refreshConfigsForPerson(normalizedTargetPersonId, configIds, issuedById);

    await this.prisma.certificate.updateMany({
      where: { personId: normalizedSourcePersonId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return refreshedCertificates;
  }

  private async reissueConfigs(
    configs: CertificateConfigRecord[],
    issuedById?: string,
    options: { client?: CertificateReissueClient; notify?: boolean } = {},
  ): Promise<CertificateReissueResult> {
    let certificateCount = 0;
    for (const config of configs) {
      const certificates = await this.issueForConfig(config, issuedById, options);
      certificateCount += certificates.length;
    }

    return { configCount: configs.length, certificateCount };
  }

  async issueForConfig(
    config: CertificateConfigRecord,
    issuedById?: string,
    options: { client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateRecord[]> {
    const client = options.client ?? this.prisma;
    const existingCertificates = await client.certificate.findMany({
      where: { configId: config.id, deletedAt: null },
      select: { personId: true },
    });

    if (config.issuedTo === CertificateIssuedTo.OTHER) {
      return this.refreshManualConfig(config, existingCertificates.map((certificate) => certificate.personId), issuedById, options);
    }

    const recipients = await this.eligibility.resolveEligibleRecipients(config);
    const eligiblePersonIds = new Set(recipients.map((recipient) => recipient.person.id));
    const invalidPersonIds = existingCertificates
      .map((certificate) => certificate.personId)
      .filter((personId) => !eligiblePersonIds.has(personId));
    if (invalidPersonIds.length > 0) {
      await client.certificate.updateMany({
        where: { configId: config.id, deletedAt: null, personId: { in: invalidPersonIds } },
        data: { deletedAt: new Date() },
      });
    }

    return this.upsertRecipients(config, recipients, issuedById, options);
  }

  private async refreshManualConfig(
    config: CertificateConfigRecord,
    personIds: string[],
    issuedById?: string,
    options: { client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateRecord[]> {
    const certificates: CertificateRecord[] = [];
    for (const batch of batches(personIds)) {
      const refreshed = await Promise.all(
        batch.map(async (personId) => {
          const recipients = await this.eligibility.resolveEligibleRecipients(config, personId);
          const recipient = recipients.find((item) => item.person.id === personId);
          return recipient ? this.upsertCertificate(config, recipient, issuedById, { prisma: options.client, notify: options.notify }) : null;
        }),
      );
      certificates.push(...refreshed.filter((certificate): certificate is CertificateRecord => certificate !== null));
    }
    return certificates;
  }

  private async refreshConfigsForPerson(
    personId: string,
    configIds: string[],
    issuedById?: string,
  ): Promise<CertificateRecord[]> {
    const certificates: CertificateRecord[] = [];
    for (const batch of batches(configIds)) {
      const refreshed = await Promise.all(
        batch.map(async (configId) => {
          const config = await this.eligibility.getConfigById(configId);
          const recipients = await this.eligibility.resolveEligibleRecipients(config, personId);
          const recipient = recipients.find((item) => item.person.id === personId);
          return recipient ? this.upsertCertificate(config, recipient, issuedById) : null;
        }),
      );
      certificates.push(...refreshed.filter((certificate): certificate is CertificateRecord => certificate !== null));
    }
    return certificates;
  }

  private async upsertRecipients(
    config: CertificateConfigRecord,
    recipients: EligibleCertificateRecipient[],
    issuedById?: string,
    options: { client?: CertificateWriteClient; notify?: boolean } = {},
  ): Promise<CertificateRecord[]> {
    const certificates: CertificateRecord[] = [];
    for (const batch of batches(recipients)) {
      certificates.push(
        ...(await Promise.all(
          batch.map((recipient) => this.upsertCertificate(config, recipient, issuedById, { prisma: options.client, notify: options.notify })),
        )),
      );
    }
    return certificates;
  }
}

function* batches<T>(items: T[], size = 10): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}
