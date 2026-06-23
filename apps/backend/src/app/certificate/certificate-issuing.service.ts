import {
  Certificate,
  CertificateIssuedTo,
  CertificateReissueResult,
  CertificateScope,
  DeletionResult,
  EventType,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_CONFIG_SELECT,
  CERTIFICATE_SELECT,
  CertificateRecord,
  CertificateConfigRecord,
  EventRecord,
  buildConfigTargetWhere,
  mapCertificate,
} from './certificate.constants';
import { CertificateEligibilityService, EligibleCertificateRecipient } from './certificate-eligibility.service';
import { CertificateValidationService } from './certificate-validation.service';

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';

@Injectable()
export class CertificateIssuingService {
  private static readonly CERTIFICATE_ISSUING_BATCH_SIZE = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly eligibilityService: CertificateEligibilityService,
  ) {}

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

    const person = await this.prisma.people.findFirst({
      where: {
        id: normalizedPersonId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new BadRequestException(`Person ${normalizedPersonId} was not found.`);
    }

    const config = await this.eligibilityService.getConfigById(normalizedConfigId);
    const recipients = await this.eligibilityService.resolveEligibleRecipients(config, normalizedPersonId);
    const recipient = recipients.find((item) => item.person.id === normalizedPersonId);
    if (!recipient) {
      throw new BadRequestException(`Person ${normalizedPersonId} is not eligible for config ${normalizedConfigId}.`);
    }

    const certificate = await this.upsertCertificateForRecipient(config, recipient, issuedById);
    return mapCertificate(certificate);
  }

  async issueMissedCertificates(configId: string, issuedById?: string): Promise<Certificate[]> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const config = await this.eligibilityService.getConfigById(normalizedConfigId);
    const result = await this.issueCertificatesForConfig(config, issuedById);

    return result.certificates.map(mapCertificate);
  }

  async reissueAllCertificates(issuedById?: string): Promise<CertificateReissueResult> {
    const configs = await this.prisma.certificateConfig.findMany({
      where: {
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: {
        createdAt: 'asc',
      },
    });

    let certificateCount = 0;
    for (const config of configs) {
      const result = await this.issueCertificatesForConfig(config, issuedById);
      certificateCount += result.certificates.length;
    }

    return {
      configCount: configs.length,
      certificateCount,
    };
  }

  private async issueCertificatesForConfig(
    config: CertificateConfigRecord,
    issuedById?: string,
  ): Promise<{ certificates: CertificateRecord[] }> {
    const existingCertificates = await this.prisma.certificate.findMany({
      where: {
        configId: config.id,
        deletedAt: null,
      },
      select: {
        personId: true,
      },
    });

    if (config.issuedTo === CertificateIssuedTo.OTHER) {
      return this.refreshManualCertificatesForConfig(
        config,
        existingCertificates.map((certificate) => certificate.personId),
        issuedById,
      );
    }

    const recipients = await this.eligibilityService.resolveEligibleRecipients(config);
    const eligiblePersonIds = new Set(recipients.map((recipient) => recipient.person.id));
    const invalidPersonIds = existingCertificates
      .map((certificate) => certificate.personId)
      .filter((personId) => !eligiblePersonIds.has(personId));
    if (invalidPersonIds.length > 0) {
      await this.prisma.certificate.updateMany({
        where: {
          configId: config.id,
          deletedAt: null,
          personId: {
            in: invalidPersonIds,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }
    if (recipients.length === 0) {
      return { certificates: [] };
    }

    const certificates: CertificateRecord[] = [];
    for (let index = 0; index < recipients.length; index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE) {
      const batch = recipients.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
      const issuedBatch = await Promise.all(
        batch.map((recipient) => this.upsertCertificateForRecipient(config, recipient, issuedById)),
      );
      certificates.push(...issuedBatch);
    }

    return { certificates };
  }

  private async refreshManualCertificatesForConfig(
    config: CertificateConfigRecord,
    personIds: string[],
    issuedById?: string,
  ): Promise<{ certificates: CertificateRecord[] }> {
    if (personIds.length === 0) {
      return { certificates: [] };
    }

    const certificates: CertificateRecord[] = [];
    for (let index = 0; index < personIds.length; index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE) {
      const batch = personIds.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
      const refreshedBatch = await Promise.all(
        batch.map(async (personId) => {
          const recipients = await this.eligibilityService.resolveEligibleRecipients(config, personId);
          const recipient = recipients.find((item) => item.person.id === personId);
          return recipient ? this.upsertCertificateForRecipient(config, recipient, issuedById) : null;
        }),
      );
      certificates.push(
        ...refreshedBatch.filter((certificate): certificate is CertificateRecord => certificate !== null),
      );
    }

    return { certificates };
  }

  async refreshIssuedCertificatesForPerson(personId: string, issuedById?: string): Promise<Certificate[]> {
    const normalizedPersonId = this.validation.normalizeRequiredId('personId', personId);
    const existingCertificates = await this.prisma.certificate.findMany({
      where: {
        personId: normalizedPersonId,
        deletedAt: null,
        config: {
          deletedAt: null,
          isActive: true,
        },
        person: {
          deletedAt: null,
        },
      },
      select: {
        configId: true,
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });

    if (existingCertificates.length === 0) {
      return [];
    }

    return this.refreshCertificateConfigsForPerson(
      normalizedPersonId,
      existingCertificates.map((certificate) => certificate.configId),
      issuedById,
    );
  }

  async refreshIssuedCertificatesAfterPeopleMerge(
    targetPersonId: string,
    sourcePersonId: string,
    issuedById?: string,
  ): Promise<Certificate[]> {
    const normalizedTargetPersonId = this.validation.normalizeRequiredId('targetPersonId', targetPersonId);
    const normalizedSourcePersonId = this.validation.normalizeRequiredId('sourcePersonId', sourcePersonId);
    const mergedCertificates = await this.prisma.certificate.findMany({
      where: {
        personId: {
          in: [normalizedTargetPersonId, normalizedSourcePersonId],
        },
        deletedAt: null,
        config: {
          deletedAt: null,
          isActive: true,
        },
      },
      select: {
        configId: true,
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });
    const configIds = [...new Set(mergedCertificates.map((certificate) => certificate.configId))];

    const refreshedCertificates = await this.refreshCertificateConfigsForPerson(
      normalizedTargetPersonId,
      configIds,
      issuedById,
    );

    await this.prisma.certificate.updateMany({
      where: {
        personId: normalizedSourcePersonId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return refreshedCertificates;
  }

  async deleteCertificate(certificateId: string): Promise<DeletionResult> {
    const normalizedCertificateId = this.validation.normalizeRequiredId('certificateId', certificateId);
    const { count } = await this.prisma.certificate.updateMany({
      where: {
        id: normalizedCertificateId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Certificate ${normalizedCertificateId} not found.`);
    }

    return {
      deleted: true,
      id: normalizedCertificateId,
    };
  }

  private async refreshIssuedCertificateForPersonConfig(
    configId: string,
    personId: string,
    issuedById?: string,
  ): Promise<CertificateRecord | null> {
    const config = await this.eligibilityService.getConfigById(configId);
    const recipients = await this.eligibilityService.resolveEligibleRecipients(config, personId);
    const recipient = recipients.find((item) => item.person.id === personId);
    if (!recipient) {
      return null;
    }

    return this.upsertCertificateForRecipient(config, recipient, issuedById);
  }

  private async refreshCertificateConfigsForPerson(
    personId: string,
    configIds: string[],
    issuedById?: string,
  ): Promise<Certificate[]> {
    if (configIds.length === 0) {
      return [];
    }

    const refreshedCertificates: CertificateRecord[] = [];
    for (let index = 0; index < configIds.length; index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE) {
      const batch = configIds.slice(index, index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE);
      const refreshedBatch = await Promise.all(
        batch.map((configId) => this.refreshIssuedCertificateForPersonConfig(configId, personId, issuedById)),
      );
      refreshedCertificates.push(
        ...refreshedBatch.filter((certificate): certificate is CertificateRecord => certificate !== null),
      );
    }

    return refreshedCertificates.map(mapCertificate);
  }

  private async upsertCertificateForRecipient(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedById?: string,
  ) {
    const existingCertificate = await this.prisma.certificate.findUnique({
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
      !this.isSameJson(existingCertificate.renderedData, currentRenderedData);

    if (existingCertificate && !hasChanges) {
      return existingCertificate;
    }

    const issuedAt = hasChanges ? now : (existingCertificate?.issuedAt ?? now);
    const renderedData = this.buildRenderedData(config, recipient, issuedAt);

    if (!existingCertificate) {
      return this.prisma.certificate.create({
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
    }

    return this.prisma.certificate.update({
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
  }

  private buildRenderedData(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedAt: Date,
  ): Prisma.InputJsonObject {
    const totalCreditMinutes = recipient.events.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);

    const target =
      config.scope === CertificateScope.EVENT
        ? config.event
        : config.scope === CertificateScope.EVENT_GROUP
          ? config.eventGroup
          : config.majorEvent;
    const targetName = target?.name ?? '';
    return {
      scope: config.scope,
      issuedTo: config.issuedTo,
      configId: config.id,
      configName: config.name,
      configText: config.certificateText ?? null,
      shouldAutofillSecondPage: config.shouldAutofillSecondPage,
      secondPageText: config.secondPageText ?? null,
      person: {
        id: recipient.person.id,
        name: recipient.person.name,
        email: recipient.person.email ?? null,
        identityDocument: recipient.person.identityDocument ?? null,
        academicId: recipient.person.academicId ?? null,
      },
      target: target
        ? {
            id: target.id,
            name: target.name,
          }
        : null,
      events: recipient.events.map((event) => ({
        id: event.id,
        name: event.name,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        creditMinutes: event.creditMinutes ?? null,
        type: event.type,
        eventGroupId: event.eventGroupId ?? null,
        eventGroupName: event.eventGroup?.name ?? null,
      })),
      totalCreditMinutes,
      totalCreditHours: totalCreditMinutes / 60,
      templateData: this.buildExampleTemplateData(config, recipient, targetName, issuedAt),
    };
  }

  private isSameJson(
    left: Prisma.JsonValue | Prisma.InputJsonValue,
    right: Prisma.JsonValue | Prisma.InputJsonValue | null,
  ): boolean {
    return this.stableJsonStringify(left) === this.stableJsonStringify(right);
  }

  private stableJsonStringify(value: Prisma.JsonValue | Prisma.InputJsonValue | null): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJsonStringify(item)).join(',')}]`;
    }

    return `{${Object.entries(value)
      .sort()
      .map(([key, child]) => `${JSON.stringify(key)}:${this.stableJsonStringify(child)}`)
      .join(',')}}`;
  }

  private buildExampleTemplateData(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    targetName: string,
    issuedAt: Date,
  ): Prisma.InputJsonObject {
    const issueDay = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
    }).format(issuedAt);
    const issueMonth = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
    }).format(issuedAt);
    const issueYear = new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric',
    }).format(issuedAt);
    const verificationUrl = 'eventos.cacic.dev.br/app/validate/{certificateID}';
    const formattedDocument = this.formatIdentityDocument(recipient.person.identityDocument);
    const sortedEvents = [...recipient.events].sort(
      (left, right) => left.startDate.getTime() - right.startDate.getTime(),
    );
    const minicursos = sortedEvents.filter((event) => event.type === EventType.MINICURSO);
    const palestras = sortedEvents.filter((event) => event.type === EventType.PALESTRA);
    const otherEvents = sortedEvents.filter(
      (event) => event.type !== EventType.MINICURSO && event.type !== EventType.PALESTRA,
    );

    const contentLines: string[] = [];
    const minicursoLines = this.buildMinicursoLines(minicursos);
    if (minicursoLines.length > 0) {
      contentLines.push('Minicursos:');
      contentLines.push(...this.applyBulletLineEndings(minicursoLines));
      const minicursoTotalMinutes = minicursos.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
      contentLines.push(`Carga horária total: ${this.formatCargaHoraria(minicursoTotalMinutes)}.`);
      contentLines.push('');
    }

    const palestraLines = this.buildSingleEventLines(palestras);
    if (palestraLines.length > 0) {
      contentLines.push('Palestras:');
      contentLines.push(...this.applyBulletLineEndings(palestraLines));
      const palestraTotalMinutes = palestras.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
      contentLines.push(`Carga horária total: ${this.formatCargaHoraria(palestraTotalMinutes)}.`);
      contentLines.push('');
    }

    const otherEventLines = this.buildSingleEventLines(otherEvents);
    if (otherEventLines.length > 0) {
      contentLines.push(...this.applyBulletLineEndings(otherEventLines));
      const otherEventsTotalMinutes = otherEvents.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
      contentLines.push(`Carga horária total: ${this.formatCargaHoraria(otherEventsTotalMinutes)}.`);
      contentLines.push('');
    }

    contentLines.push('Observações:');
    contentLines.push('Datas em formato "dia/mês/ano".');
    const secondPageEventContent = this.buildSecondPageEventContent({
      minicursosSection:
        minicursoLines.length > 0
          ? (() => {
              const minicursoTotalMinutes = minicursos.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
              return `Minicursos:\n${this.applyBulletLineEndings(minicursoLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(minicursoTotalMinutes)}.`;
            })()
          : '',
      palestrasSection:
        palestraLines.length > 0
          ? (() => {
              const palestraTotalMinutes = palestras.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
              return `Palestras:\n${this.applyBulletLineEndings(palestraLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(palestraTotalMinutes)}.`;
            })()
          : '',
      otherEventTypesList:
        otherEventLines.length > 0
          ? (() => {
              const otherEventsTotalMinutes = otherEvents.reduce(
                (total, event) => total + (event.creditMinutes ?? 0),
                0,
              );
              return `${this.applyBulletLineEndings(otherEventLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(otherEventsTotalMinutes)}.`;
            })()
          : '',
    });
    const secondPageCustomContent = config.secondPageText?.trim() ?? '';

    return {
      issue_day: issueDay,
      issue_month: issueMonth,
      issue_year: issueYear,
      'top-text': this.getCertificateFieldValue(
        config.certificateFields,
        'top-text',
        config.certificateTemplate?.certificateFields ?? null,
        'Certificamos a participação de',
      ),
      'bottom-text': this.getCertificateFieldValue(
        config.certificateFields,
        'bottom-text',
        config.certificateTemplate?.certificateFields ?? null,
        'no evento',
      ),
      date: `${issueDay} de ${issueMonth} de ${issueYear}`,
      participation_type: this.buildParticipationType(config),
      name: recipient.person.name,
      event_type: 'no evento',
      major_event_or_event_name: targetName,
      event_name: targetName,
      'majorEvent or event name': targetName,
      additional_text: config.certificateText ?? '',
      qrcode: verificationUrl,
      url: verificationUrl,
      identity_document: formattedDocument,
      identityDocument: formattedDocument,
      certificateID: '{certificateID}',
      name_small: recipient.person.name,
      document: `Documento: ${formattedDocument}`,
      event_name_small: targetName,
      content: contentLines.join('\n'),
      second_page_content: config.shouldAutofillSecondPage ? secondPageEventContent : secondPageCustomContent,
      minicursosSection:
        minicursoLines.length > 0
          ? (() => {
              const minicursoTotalMinutes = minicursos.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
              return `Minicursos:\n${this.applyBulletLineEndings(minicursoLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(minicursoTotalMinutes)}.`;
            })()
          : '',
      palestrasSection:
        palestraLines.length > 0
          ? (() => {
              const palestraTotalMinutes = palestras.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
              return `Palestras:\n${this.applyBulletLineEndings(palestraLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(palestraTotalMinutes)}.`;
            })()
          : '',
      otherEventTypesList:
        otherEventLines.length > 0
          ? (() => {
              const otherEventsTotalMinutes = otherEvents.reduce(
                (total, event) => total + (event.creditMinutes ?? 0),
                0,
              );
              return `${this.applyBulletLineEndings(otherEventLines).join('\n')}\nCarga horária total: ${this.formatCargaHoraria(otherEventsTotalMinutes)}.`;
            })()
          : '',
    };
  }

  private buildSecondPageEventContent(input: {
    minicursosSection: string;
    palestrasSection: string;
    otherEventTypesList: string;
  }): string {
    return [
      input.minicursosSection,
      input.palestrasSection,
      input.otherEventTypesList,
      'Observações:',
      'Datas em formato "dia/mês/ano".',
    ]
      .filter((line) => line.trim().length > 0)
      .join('\n\n');
  }

  private getCertificateFieldValue(
    customFields: Prisma.JsonValue | null,
    key: string,
    templateFields: Prisma.JsonValue | null,
    fallback: string,
  ): string {
    // Check custom config fields first
    if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
      const value = customFields[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    // Fall back to template fields
    if (templateFields && typeof templateFields === 'object' && !Array.isArray(templateFields)) {
      const value = templateFields[key];
      const normalizedValue = this.normalizeCertificateFieldValue(value);
      if (normalizedValue) {
        return normalizedValue;
      }
    }

    // Fall back to hardcoded default
    return fallback;
  }

  private normalizeCertificateFieldValue(value: Prisma.JsonValue | undefined): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const defaultValue = value.default;
    if (typeof defaultValue === 'string') {
      const normalized = defaultValue.trim();
      return normalized || null;
    }

    if (typeof defaultValue === 'number' || typeof defaultValue === 'boolean') {
      return String(defaultValue);
    }

    return null;
  }

  private buildParticipationType(config: CertificateConfigRecord): string {
    if (config.issuedTo !== CertificateIssuedTo.LECTURER) {
      return 'Certificamos a participação de:';
    }

    const lecturerEventCategory = this.parseLecturerEventCategory(config.certificateFields);
    if (lecturerEventCategory === 'PALESTRA') {
      return 'Certificamos a participação como palestrante de:';
    }

    if (lecturerEventCategory === 'MINICURSO') {
      return 'Certificamos a participação como ministrante de:';
    }

    if (lecturerEventCategory === 'OTHER') {
      return 'Certificamos a participação como palestrante/ministrante de:';
    }

    return 'Certificamos a participação como palestrante de:';
  }

  private parseLecturerEventCategory(certificateFields: Prisma.JsonValue | null): LecturerEventCategory | null {
    if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
      return null;
    }

    const value = certificateFields[LECTURER_EVENT_CATEGORY_FIELD];
    return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
  }

  private buildMinicursoLines(events: EventRecord[]): string[] {
    if (events.length === 0) {
      return [];
    }

    const groupedEvents = new Map<string, { label: string; events: EventRecord[]; hasGroup: boolean }>();
    for (const event of events) {
      const key = event.eventGroupId ?? event.id;
      const label = event.eventGroup?.name ?? event.name;
      const group = groupedEvents.get(key);
      if (!group) {
        groupedEvents.set(key, {
          label,
          events: [event],
          hasGroup: Boolean(event.eventGroupId),
        });
        continue;
      }

      group.events.push(event);
    }

    const groups = [...groupedEvents.values()].sort((left, right) => {
      const leftDate = left.events[0]?.startDate.getTime() ?? 0;
      const rightDate = right.events[0]?.startDate.getTime() ?? 0;
      return leftDate - rightDate;
    });

    return groups.map((group) => {
      const sortedGroupEvents = [...group.events].sort(
        (left, right) => left.startDate.getTime() - right.startDate.getTime(),
      );
      const totalMinutes = sortedGroupEvents.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);

      if (sortedGroupEvents.length === 1 && !group.hasGroup) {
        const event = sortedGroupEvents[0];
        return `• ${this.formatDate(event.startDate)} - ${event.name} - Carga horária: ${this.formatCargaHoraria(totalMinutes)}`;
      }

      const dates = sortedGroupEvents.map((event) => this.formatDate(event.startDate));
      return `• ${dates.join(', ')} - ${group.label} - Carga horária: ${this.formatCargaHoraria(totalMinutes)}`;
    });
  }

  private buildSingleEventLines(events: EventRecord[]): string[] {
    return events.map((event) => {
      return `• ${this.formatDate(event.startDate)} - ${event.name} - Carga horária: ${this.formatCargaHoraria(event.creditMinutes ?? 0)}`;
    });
  }

  private applyBulletLineEndings(lines: string[]): string[] {
    return lines.map((line, index) => `${line}${index === lines.length - 1 ? '.' : ';'}`);
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private formatCargaHoraria(totalMinutes: number): string {
    if (totalMinutes === 0) {
      return '0 minutos';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    }

    if (minutes === 0) {
      return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }

    return `${hours} ${hours === 1 ? 'hora' : 'horas'} e ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }

  private formatIdentityDocument(identityDocument?: string | null): string {
    const trimmedDocument = identityDocument?.trim();
    if (!trimmedDocument) {
      return '';
    }

    const digits = trimmedDocument.replace(/\D/g, '');
    if (digits.length === 11) {
      return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
    }

    return trimmedDocument;
  }
}
