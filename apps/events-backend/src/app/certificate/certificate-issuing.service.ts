import {
  Certificate,
  CertificateIssuedTo,
  CertificateScope,
  EventType,
} from '@cacic-eventos/shared-data-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_SELECT,
  CertificateRecord,
  CertificateConfigRecord,
  EventRecord,
  buildConfigTargetWhere,
  mapCertificate,
} from './certificate.constants';
import {
  CertificateEligibilityService,
  EligibleCertificateRecipient,
} from './certificate-eligibility.service';
import { CertificateValidationService } from './certificate-validation.service';

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
    const normalizedTargetId = this.validation.normalizeRequiredId(
      'targetId',
      targetId,
    );
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

  async issueForPerson(
    configId: string,
    personId: string,
    issuedById?: string,
  ): Promise<Certificate> {
    const normalizedConfigId = this.validation.normalizeRequiredId(
      'configId',
      configId,
    );
    const normalizedPersonId = this.validation.normalizeRequiredId(
      'personId',
      personId,
    );

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
      throw new BadRequestException(
        `Person ${normalizedPersonId} was not found.`,
      );
    }

    const config =
      await this.eligibilityService.getConfigById(normalizedConfigId);
    const recipients = await this.eligibilityService.resolveEligibleRecipients(
      config,
      normalizedPersonId,
    );
    const recipient = recipients.find(
      (item) => item.person.id === normalizedPersonId,
    );
    if (!recipient) {
      throw new BadRequestException(
        `Person ${normalizedPersonId} is not eligible for config ${normalizedConfigId}.`,
      );
    }

    const certificate = await this.upsertCertificateForRecipient(
      config,
      recipient,
      issuedById,
    );
    return mapCertificate(certificate);
  }

  async issueMissedCertificates(
    configId: string,
    issuedById?: string,
  ): Promise<Certificate[]> {
    const normalizedConfigId = this.validation.normalizeRequiredId(
      'configId',
      configId,
    );
    const config =
      await this.eligibilityService.getConfigById(normalizedConfigId);
    const recipients =
      await this.eligibilityService.resolveEligibleRecipients(config);
    const eligiblePersonIds = new Set(
      recipients.map((recipient) => recipient.person.id),
    );
    const existingCertificates = await this.prisma.certificate.findMany({
      where: {
        configId: config.id,
      },
      select: {
        personId: true,
      },
    });
    const invalidPersonIds = existingCertificates
      .map((certificate) => certificate.personId)
      .filter((personId) => !eligiblePersonIds.has(personId));
    if (invalidPersonIds.length > 0) {
      await this.prisma.certificate.deleteMany({
        where: {
          configId: config.id,
          personId: {
            in: invalidPersonIds,
          },
        },
      });
    }
    if (recipients.length === 0) {
      return [];
    }

    const certificates: CertificateRecord[] = [];
    for (
      let index = 0;
      index < recipients.length;
      index += CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE
    ) {
      const batch = recipients.slice(
        index,
        index + CertificateIssuingService.CERTIFICATE_ISSUING_BATCH_SIZE,
      );
      const issuedBatch = await Promise.all(
        batch.map((recipient) =>
          this.upsertCertificateForRecipient(config, recipient, issuedById),
        ),
      );
      certificates.push(...issuedBatch);
    }

    return certificates.map(mapCertificate);
  }

  private async upsertCertificateForRecipient(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
    issuedById?: string,
  ) {
    const now = new Date();
    const renderedData = this.buildRenderedData(config, recipient);

    return this.prisma.certificate.upsert({
      where: {
        personId_configId: {
          personId: recipient.person.id,
          configId: config.id,
        },
      },
      create: {
        personId: recipient.person.id,
        configId: config.id,
        renderedData,
        certificateTemplateId: config.certificateTemplateId,
        issuedById: issuedById ?? null,
        issuedAt: now,
      },
      update: {
        renderedData,
        certificateTemplateId: config.certificateTemplateId,
        issuedById: issuedById ?? null,
        issuedAt: now,
        deletedAt: null,
      },
      select: CERTIFICATE_SELECT,
    });
  }

  private buildRenderedData(
    config: CertificateConfigRecord,
    recipient: EligibleCertificateRecipient,
  ): Prisma.InputJsonObject {
    const totalCreditMinutes = recipient.events.reduce(
      (total, event) => total + (event.creditMinutes ?? 0),
      0,
    );

    const target =
      config.scope === CertificateScope.EVENT
        ? config.event
        : config.scope === CertificateScope.EVENT_GROUP
          ? config.eventGroup
          : config.majorEvent;
    const targetName = target?.name ?? '';
    const issuedAt = new Date();

    return {
      scope: config.scope,
      issuedTo: config.issuedTo,
      configId: config.id,
      configName: config.name,
      configText: config.certificateText ?? null,
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
      templateData: this.buildExampleTemplateData(
        config,
        recipient,
        targetName,
        issuedAt,
      ),
    };
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
    const formattedDocument = this.formatIdentityDocument(
      recipient.person.identityDocument,
    );
    const sortedEvents = [...recipient.events].sort(
      (left, right) => left.startDate.getTime() - right.startDate.getTime(),
    );
    const minicursos = sortedEvents.filter(
      (event) => event.type === EventType.MINICURSO,
    );
    const palestras = sortedEvents.filter(
      (event) => event.type === EventType.PALESTRA,
    );
    const otherEvents = sortedEvents.filter(
      (event) =>
        event.type !== EventType.MINICURSO && event.type !== EventType.PALESTRA,
    );

    const contentLines: string[] = [];
    const minicursoLines = this.buildMinicursoLines(minicursos);
    if (minicursoLines.length > 0) {
      contentLines.push('Minicursos:');
      contentLines.push(...this.applyBulletLineEndings(minicursoLines));
      contentLines.push('');
    }

    const palestraLines = this.buildSingleEventLines(palestras);
    if (palestraLines.length > 0) {
      contentLines.push('Palestras:');
      contentLines.push(...this.applyBulletLineEndings(palestraLines));
      contentLines.push('');
    }

    const otherEventLines = this.buildSingleEventLines(otherEvents);
    if (otherEventLines.length > 0) {
      contentLines.push(...this.applyBulletLineEndings(otherEventLines));
      contentLines.push('');
    }

    contentLines.push('Observações:');
    contentLines.push('Datas em formato "dia/mês/ano".');

    return {
      issue_day: issueDay,
      issue_month: issueMonth,
      issue_year: issueYear,
      'top-text': this.getCertificateFieldValue(
        config.certificateFields,
        'top-text',
        'Certificamos a participação de',
      ),
      'bottom-text': this.getCertificateFieldValue(
        config.certificateFields,
        'bottom-text',
        'no evento',
      ),
      date: `${issueDay} de ${issueMonth} de ${issueYear}`,
      participation_type: this.buildParticipationType(config.issuedTo),
      name: recipient.person.name,
      event_type: 'no evento',
      major_event_or_event_name: targetName,
      event_name: targetName,
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
      minicursosSection:
        minicursoLines.length > 0
          ? `Minicursos:\n${this.applyBulletLineEndings(minicursoLines).join('\n')}`
          : '',
      palestrasSection:
        palestraLines.length > 0
          ? `Palestras:\n${this.applyBulletLineEndings(palestraLines).join('\n')}`
          : '',
      otherEventTypesList:
        otherEventLines.length > 0
          ? this.applyBulletLineEndings(otherEventLines).join('\n')
          : '',
    };
  }

  private getCertificateFieldValue(
    fields: Prisma.JsonValue | null,
    key: string,
    fallback: string,
  ): string {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return fallback;
    }

    const value = fields[key];
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private buildParticipationType(issuedTo: CertificateIssuedTo): string {
    if (issuedTo === CertificateIssuedTo.LECTURER) {
      return 'Certificamos a participação como palestrante de:';
    }

    return 'Certificamos a participação de:';
  }

  private buildMinicursoLines(events: EventRecord[]): string[] {
    if (events.length === 0) {
      return [];
    }

    const groupedEvents = new Map<
      string,
      { label: string; events: EventRecord[]; hasGroup: boolean }
    >();
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
      const totalMinutes = sortedGroupEvents.reduce(
        (total, event) => total + (event.creditMinutes ?? 0),
        0,
      );
      const totalHours = this.formatHours(totalMinutes);

      if (sortedGroupEvents.length === 1 && !group.hasGroup) {
        const event = sortedGroupEvents[0];
        return `• ${this.formatDate(event.startDate)} - ${event.name} - Carga horária ${totalHours} horas`;
      }

      const dates = sortedGroupEvents.map((event) =>
        this.formatDate(event.startDate),
      );
      return `• ${dates.join(', ')} - ${group.label} - Carga horária: ${totalHours} horas`;
    });
  }

  private buildSingleEventLines(events: EventRecord[]): string[] {
    return events.map((event) => {
      const hours = this.formatHours(event.creditMinutes ?? 0);
      return `• ${this.formatDate(event.startDate)} - ${event.name} - Carga horária ${hours} horas`;
    });
  }

  private applyBulletLineEndings(lines: string[]): string[] {
    return lines.map(
      (line, index) => `${line}${index === lines.length - 1 ? '.' : ';'}`,
    );
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(date);
  }

  private formatHours(totalMinutes: number): string {
    const hours = totalMinutes / 60;
    return hours
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
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
