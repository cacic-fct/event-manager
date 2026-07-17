import { Certificate, CertificateIssuedTo, CertificateReissueResult, CertificateScope, DeletionResult } from '@cacic-fct/shared-data-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_SELECT,
  CertificateRecord,
  CertificateConfigRecord,
  EventRecord,
  buildConfigTargetWhere,
  mapCertificate,
} from './certificate.constants';
import { CertificateEligibilityService, EligibleCertificateRecipient } from './certificate-eligibility.service';
import { CertificateIssuanceAudit } from './certificate-issuance-audit';
import { notifyCertificateAvailable } from './certificate-issuance-notifications';
import { CertificateIssuanceRefresh } from './certificate-issuance-refresh';
import { CertificateIssuanceRecipients } from './certificate-issuance-recipients';
import { buildCertificateRenderedData, hasSameJson } from './certificate-rendered-data';
import { CertificateValidationService } from './certificate-validation.service';

type CertificateWriteClient = Pick<PrismaService, 'certificate'>;
type CertificateReissueClient = Pick<PrismaService, 'certificate' | 'certificateConfig'>;

@Injectable()
export class CertificateIssuingService {
  private static readonly CERTIFICATE_ISSUING_BATCH_SIZE = 10;
  private readonly audit: CertificateIssuanceAudit;
  private readonly refresh: CertificateIssuanceRefresh;
  private readonly recipients: CertificateIssuanceRecipients;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly eligibilityService: CertificateEligibilityService,
    private readonly notifications?: NovuNotificationsService,
    auditLog: AuditLogService = { record: async () => undefined } as unknown as AuditLogService,
  ) {
    this.audit = new CertificateIssuanceAudit(prisma, auditLog);
    this.recipients = new CertificateIssuanceRecipients(prisma, eligibilityService);
    this.refresh = new CertificateIssuanceRefresh(
      prisma,
      validation,
      eligibilityService,
      (config, recipient, issuedById, options) =>
        options === undefined
          ? this.upsertCertificateForRecipient(config, recipient, issuedById)
          : this.upsertCertificateForRecipient(config, recipient, issuedById, options),
    );
  }

  async listCertificatesByTarget(
    scope: CertificateScope,
    targetId: string,
    configId?: string,
    skip?: number,
    take?: number,
  ): Promise<Certificate[]> {
    this.validation.assertSupportedScope(scope);
    const normalizedTargetId = this.validation.normalizeRequiredId('targetId', targetId);
    const normalizedConfigId = configId?.trim() ? configId.trim() : undefined;

    const certificates = await this.prisma.certificate.findMany({
      where: {
        deletedAt: null,
        config: {
          deletedAt: null,
          ...buildConfigTargetWhere(scope, normalizedTargetId),
          ...(normalizedConfigId ? { id: normalizedConfigId } : {}),
        },
      },
      select: CERTIFICATE_SELECT,
      orderBy: {
        issuedAt: 'desc',
      },
      skip,
      take,
    });

    return certificates.map(mapCertificate);
  }

  async issueForPerson(configId: string, personId: string, issuedById?: string): Promise<Certificate> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const normalizedPersonId = this.validation.normalizeRequiredId('personId', personId);
    const { config, recipient } = await this.resolvePersonRecipient(normalizedConfigId, normalizedPersonId);

    const certificate = await this.upsertCertificateForRecipient(config, recipient, issuedById);
    return mapCertificate(certificate);
  }

  async issueManualForPeople(configId: string, personIds: string[], issuedById?: string): Promise<Certificate[]> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const config = await this.eligibilityService.getConfigById(normalizedConfigId);
    if (config.issuedTo !== CertificateIssuedTo.OTHER) {
      throw new BadRequestException('CSV imports are available only for manual certificate configurations.');
    }

    const uniquePersonIds = [...new Set(personIds.map((personId) => this.validation.normalizeRequiredId('personId', personId)))];
    const certificates: CertificateRecord[] = [];
    for (let index = 0; index < uniquePersonIds.length; index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE) {
      const batch = uniquePersonIds.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
      const issuedBatch = await Promise.all(
        batch.map(async (personId) => {
          const recipient = await this.resolveRecipientForConfig(config, normalizedConfigId, personId);
          return this.upsertCertificateForRecipient(config, recipient, issuedById);
        }),
      );
      certificates.push(...issuedBatch);
    }

    return certificates.map(mapCertificate);
  }

  async issueMissedCertificates(configId: string, issuedById?: string): Promise<Certificate[]> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const config = await this.eligibilityService.getConfigById(normalizedConfigId);
    return (await this.refresh.issueForConfig(config, issuedById)).map(mapCertificate);
  }

  async issueForExistingConfigRecipients(
    sourceConfigId: string,
    targetConfigId: string,
    issuedById?: string,
  ): Promise<Certificate[]> {
    const normalizedSourceConfigId = this.validation.normalizeRequiredId('sourceConfigId', sourceConfigId);
    const normalizedTargetConfigId = this.validation.normalizeRequiredId('targetConfigId', targetConfigId);
    const sourceCertificates = await this.prisma.certificate.findMany({
      where: {
        configId: normalizedSourceConfigId,
        deletedAt: null,
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });
    const personIds = [...new Set(sourceCertificates.map((certificate) => certificate.personId))];
    const config = await this.eligibilityService.getConfigById(normalizedTargetConfigId);
    const recipients: EligibleCertificateRecipient[] = [];

    for (let index = 0; index < personIds.length; index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE) {
      const batch = personIds.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
      const issuedBatch = await Promise.allSettled(
        batch.map(async (personId) => {
          const normalizedPersonId = this.validation.normalizeRequiredId('personId', personId);
          return this.resolveRecipientForConfig(config, normalizedTargetConfigId, normalizedPersonId);
        }),
      );
      const unexpectedError = issuedBatch.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected' && !this.isExpectedRecipientSkipError(result.reason),
      );
      if (unexpectedError) {
        throw unexpectedError.reason;
      }
      recipients.push(
        ...issuedBatch
          .filter(
            (result): result is PromiseFulfilledResult<EligibleCertificateRecipient> => result.status === 'fulfilled',
          )
          .map((result) => result.value),
      );
    }

    const issuedCertificates = await this.prisma.$transaction(async (tx) => {
      const certificates: { certificate: CertificateRecord; shouldNotify: boolean }[] = [];
      for (
        let index = 0;
        index < recipients.length;
        index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE
      ) {
        const batch = recipients.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
        const issuedBatch = await Promise.all(
          batch.map((recipient) =>
            this.upsertCertificateForRecipientResult(config, recipient, issuedById, {
              notify: false,
              prisma: tx,
            }),
          ),
        );
        certificates.push(...issuedBatch);
      }

      return certificates;
    });

    await Promise.all(
      issuedCertificates
        .filter((issued) => issued.shouldNotify)
        .map((issued) => this.notifyCertificateAvailable(issued.certificate)),
    );

    return issuedCertificates.map((issued) => mapCertificate(issued.certificate));
  }

  private isExpectedRecipientSkipError(error: unknown): boolean {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : undefined;
    const messages = Array.isArray(message) ? message : [message];

    return messages.some(
      (item) =>
        typeof item === 'string' &&
        item.startsWith('Person ') &&
        (item.includes(' was not found.') || item.includes(' is not eligible for config ')),
    );
  }

  async reissueAllCertificates(issuedById?: string): Promise<CertificateReissueResult> {
    return this.refresh.reissueAll(issuedById);
  }

  async reissueCertificatesForFolder(
    folderId: string,
    issuedById?: string,
    client: CertificateReissueClient = this.prisma,
    options: { notify?: boolean } = {},
  ): Promise<CertificateReissueResult> {
    return this.refresh.reissueFolder(folderId, issuedById, client, options);
  }

  async refreshIssuedCertificatesForPerson(personId: string, issuedById?: string): Promise<Certificate[]> {
    return (await this.refresh.refreshForPerson(personId, issuedById)).map(mapCertificate);
  }

  async refreshIssuedCertificatesAfterPeopleMerge(
    targetPersonId: string,
    sourcePersonId: string,
    issuedById?: string,
  ): Promise<Certificate[]> {
    return (await this.refresh.refreshAfterPeopleMerge(targetPersonId, sourcePersonId, issuedById)).map(mapCertificate);
  }

  async deleteCertificate(certificateId: string, deletedById?: string): Promise<DeletionResult> {
    const normalizedCertificateId = this.validation.normalizeRequiredId('certificateId', certificateId);
    await this.prisma.$transaction(async (tx) => {
      const certificate = await tx.certificate.findFirst({
        where: { id: normalizedCertificateId, deletedAt: null },
        select: CERTIFICATE_SELECT,
      });
      if (!certificate) throw new NotFoundException(`Certificate ${normalizedCertificateId} not found.`);
      const deleted = await tx.certificate.update({
        where: { id: normalizedCertificateId },
        data: { deletedAt: new Date() },
        select: CERTIFICATE_SELECT,
      });
      await this.recordCertificateAudit(certificate, deleted, AuditLogOperation.DELETE, deletedById, tx);
    });

    return {
      deleted: true,
      id: normalizedCertificateId,
    };
  }

  private async resolvePersonRecipient(
    configId: string,
    personId: string,
  ): Promise<{ config: CertificateConfigRecord; recipient: EligibleCertificateRecipient }> {
    return this.recipients.resolvePersonRecipient(configId, personId);
  }

  private async resolveRecipientForConfig(
    config: CertificateConfigRecord,
    configId: string,
    personId: string,
    options: { personExists?: boolean } = {},
  ): Promise<EligibleCertificateRecipient> {
    return this.recipients.resolveForConfig(config, configId, personId, options);
  }

  private async upsertCertificateForRecipient(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedById?: string,
    options: { notify?: boolean; prisma?: CertificateWriteClient } = {},
  ) {
    const result = await this.upsertCertificateForRecipientResult(config, recipient, issuedById, options);
    return result.certificate;
  }

  private async upsertCertificateForRecipientResult(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedById?: string,
    options: { notify?: boolean; prisma?: CertificateWriteClient } = {},
  ): Promise<{ certificate: CertificateRecord; shouldNotify: boolean }> {
    const shouldNotifyNow = options.notify ?? true;
    const prisma = options.prisma ?? this.prisma;
    const existingCertificate = await prisma.certificate.findUnique({
      where: {
        personId_configId: {
          personId: recipient.person.id,
          configId: config.id,
        },
      },
      select: CERTIFICATE_SELECT,
    });
    const now = new Date();
    const currentRenderedData = existingCertificate
      ? this.buildRenderedData(config, recipient, existingCertificate.issuedAt)
      : null;
    const hasChanges =
      !existingCertificate ||
      existingCertificate.deletedAt !== null ||
      existingCertificate.certificateTemplateId !== config.certificateTemplateId ||
      !hasSameJson(existingCertificate.renderedData, currentRenderedData);

    if (existingCertificate && !hasChanges) {
      return { certificate: existingCertificate, shouldNotify: false };
    }

    const issuedAt = hasChanges ? now : (existingCertificate?.issuedAt ?? now);
    const renderedData = this.buildRenderedData(config, recipient, issuedAt);

    if (!existingCertificate) {
      const createCertificate = async (client: CertificateWriteClient) => {
        const certificate = await client.certificate.create({
          data: {
            personId: recipient.person.id,
            configId: config.id,
            renderedData,
            certificateTemplateId: config.certificateTemplateId,
            issuedById: issuedById ?? null,
            issuedAt,
          },
          select: CERTIFICATE_SELECT,
        });
        await this.recordCertificateAudit(null, certificate, AuditLogOperation.ISSUE, issuedById, client);
        return certificate;
      };
      const certificate = options.prisma && options.prisma !== this.prisma
        ? await createCertificate(options.prisma)
        : await this.prisma.$transaction((tx) => createCertificate(tx));
      if (shouldNotifyNow) {
        await this.notifyCertificateAvailable(certificate);
      }
      return { certificate, shouldNotify: true };
    }

    const updateCertificate = async (client: CertificateWriteClient) => {
      const certificate = await client.certificate.update({
        where: {
          id: existingCertificate.id,
        },
        data: {
          personId: recipient.person.id,
          configId: config.id,
          renderedData,
          certificateTemplateId: config.certificateTemplateId,
          issuedById: issuedById ?? null,
          issuedAt,
          deletedAt: null,
        },
        select: CERTIFICATE_SELECT,
      });
      await this.recordCertificateAudit(existingCertificate, certificate, AuditLogOperation.REISSUE, issuedById, client);
      return certificate;
    };
    const certificate = options.prisma && options.prisma !== this.prisma
      ? await updateCertificate(options.prisma)
      : await this.prisma.$transaction((tx) => updateCertificate(tx));
    if (shouldNotifyNow) {
      await this.notifyCertificateAvailable(certificate);
    }
    return { certificate, shouldNotify: true };
  }

  private async recordCertificateAudit(
    before: CertificateRecord | null,
    after: CertificateRecord,
    operation: AuditLogOperation,
    actorId: string | undefined,
    prisma: CertificateWriteClient,
  ): Promise<void> {
    return this.audit.record(before, after, operation, actorId, prisma);
  }

  private async notifyCertificateAvailable(certificate: CertificateRecord): Promise<void> {
    return notifyCertificateAvailable(this.notifications, certificate);
  }

  private buildRenderedData(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedAt: Date,
  ): Prisma.InputJsonObject {
    return buildCertificateRenderedData(config, recipient, issuedAt);
  }
}
