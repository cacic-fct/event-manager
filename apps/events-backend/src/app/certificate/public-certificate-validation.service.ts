import {
  CertificateScope,
  EventType,
  PublicCertificateValidation,
  PublicCertificateValidationEvent,
  PublicCertificateValidationEventSection,
} from '@cacic-eventos/shared-data-types';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';

const CERTIFICATE_VALIDATION_EVENT_SELECT = {
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  creditMinutes: true,
  type: true,
} satisfies Prisma.EventSelect;

const PUBLIC_CERTIFICATE_VALIDATION_SELECT = {
  id: true,
  issuedAt: true,
  personId: true,
  person: {
    select: {
      name: true,
      identityDocument: true,
      isCPF: true,
    },
  },
  config: {
    select: {
      name: true,
      scope: true,
      event: {
        select: CERTIFICATE_VALIDATION_EVENT_SELECT,
      },
      eventGroup: {
        select: {
          id: true,
          name: true,
          shouldIssueCertificateForEachEvent: true,
          shouldIssuePartialCertificate: true,
        },
      },
      majorEvent: {
        select: {
          id: true,
          name: true,
          emoji: true,
        },
      },
    },
  },
} satisfies Prisma.CertificateSelect;

type CertificateValidationEventRecord = Prisma.EventGetPayload<{
  select: typeof CERTIFICATE_VALIDATION_EVENT_SELECT;
}>;

type PublicCertificateValidationRecord = Prisma.CertificateGetPayload<{
  select: typeof PUBLIC_CERTIFICATE_VALIDATION_SELECT;
}>;

@Injectable()
export class PublicCertificateValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
  ) {}

  async validateCertificate(
    certificateId: string,
  ): Promise<PublicCertificateValidation | null> {
    const normalizedCertificateId =
      this.validation.normalizeOptionalId(certificateId);
    if (!normalizedCertificateId) {
      return null;
    }

    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: normalizedCertificateId,
        deletedAt: null,
      },
      select: PUBLIC_CERTIFICATE_VALIDATION_SELECT,
    });
    if (!certificate) {
      return null;
    }

    const events = await this.resolveCertificateEvents(certificate);
    const sections = this.buildSections(certificate, events);

    return {
      id: certificate.id,
      issuedAt: certificate.issuedAt,
      personName: certificate.person.name,
      maskedIdentityDocument: this.maskCpf(
        certificate.person.identityDocument,
        certificate.person.isCPF,
      ),
      scope: certificate.config.scope as CertificateScope,
      certificateName: certificate.config.name,
      targetName: this.getTargetName(certificate),
      targetEmoji: this.getTargetEmoji(certificate),
      sections,
      totalCreditMinutes: this.sumCreditMinutes(events),
    };
  }

  private async resolveCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    if (certificate.config.scope === CertificateScope.MAJOR_EVENT) {
      return this.listAttendedMajorEventCertificateEvents(certificate);
    }

    if (certificate.config.scope === CertificateScope.EVENT_GROUP) {
      return this.listEventGroupCertificateEvents(certificate);
    }

    if (certificate.config.scope === CertificateScope.EVENT) {
      return certificate.config.event ? [certificate.config.event] : [];
    }

    return [];
  }

  private async listAttendedMajorEventCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    const majorEventId = certificate.config.majorEvent?.id;
    if (!majorEventId) {
      return [];
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        personId: certificate.personId,
        event: {
          majorEventId,
          deletedAt: null,
          shouldIssueCertificate: true,
        },
      },
      select: {
        event: {
          select: CERTIFICATE_VALIDATION_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return attendances.map((attendance) => attendance.event);
  }

  private async listEventGroupCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    const eventGroup = certificate.config.eventGroup;
    if (!eventGroup) {
      return [];
    }

    if (eventGroup.shouldIssuePartialCertificate) {
      return this.listAttendedEventGroupCertificateEvents(
        certificate.personId,
        eventGroup.id,
      );
    }

    const subscribedEvents =
      await this.listSubscribedEventGroupCertificateEvents(
        certificate.personId,
        eventGroup.id,
      );

    if (subscribedEvents.length > 0) {
      return subscribedEvents;
    }

    return this.listAllEventGroupCertificateEvents(eventGroup.id);
  }

  private async listAttendedEventGroupCertificateEvents(
    personId: string,
    eventGroupId: string,
  ): Promise<CertificateValidationEventRecord[]> {
    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        personId,
        event: {
          eventGroupId,
          deletedAt: null,
          shouldIssueCertificate: true,
        },
      },
      select: {
        event: {
          select: CERTIFICATE_VALIDATION_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return attendances.map((attendance) => attendance.event);
  }

  private async listSubscribedEventGroupCertificateEvents(
    personId: string,
    eventGroupId: string,
  ): Promise<CertificateValidationEventRecord[]> {
    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          eventGroupId,
          deletedAt: null,
          shouldIssueCertificate: true,
        },
      },
      select: {
        event: {
          select: CERTIFICATE_VALIDATION_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return subscriptions.map((subscription) => subscription.event);
  }

  private listAllEventGroupCertificateEvents(
    eventGroupId: string,
  ): Promise<CertificateValidationEventRecord[]> {
    return this.prisma.event.findMany({
      where: {
        eventGroupId,
        deletedAt: null,
        shouldIssueCertificate: true,
      },
      select: CERTIFICATE_VALIDATION_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  private buildSections(
    certificate: PublicCertificateValidationRecord,
    events: CertificateValidationEventRecord[],
  ): PublicCertificateValidationEventSection[] {
    if (certificate.config.scope === CertificateScope.MAJOR_EVENT) {
      return this.buildMajorEventSections(events);
    }

    if (events.length === 0) {
      return [];
    }

    return [
      {
        title: this.getDefaultSectionTitle(certificate),
        creditMinutes: this.sumCreditMinutes(events),
        events: events.map((event) => this.mapEvent(event)),
      },
    ];
  }

  private buildMajorEventSections(
    events: CertificateValidationEventRecord[],
  ): PublicCertificateValidationEventSection[] {
    return [
      {
        title: 'Minicursos',
        type: EventType.MINICURSO,
        events: events.filter((event) => event.type === EventType.MINICURSO),
      },
      {
        title: 'Palestras',
        type: EventType.PALESTRA,
        events: events.filter((event) => event.type === EventType.PALESTRA),
      },
      {
        title: 'Outros',
        type: EventType.OTHER,
        events: events.filter(
          (event) =>
            event.type !== EventType.MINICURSO &&
            event.type !== EventType.PALESTRA,
        ),
      },
    ]
      .filter((section) => section.events.length > 0)
      .map((section) => ({
        ...section,
        creditMinutes: this.sumCreditMinutes(section.events),
        events: section.events.map((event) => this.mapEvent(event)),
      }));
  }

  private getDefaultSectionTitle(
    certificate: PublicCertificateValidationRecord,
  ): string {
    if (certificate.config.scope === CertificateScope.EVENT_GROUP) {
      return certificate.config.eventGroup?.shouldIssuePartialCertificate
        ? 'Eventos com presença'
        : 'Eventos inscritos';
    }

    return 'Evento';
  }

  private mapEvent(
    event: CertificateValidationEventRecord,
  ): PublicCertificateValidationEvent {
    return {
      name: event.name,
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
      creditMinutes: event.creditMinutes ?? undefined,
    };
  }

  private getTargetName(
    certificate: PublicCertificateValidationRecord,
  ): string | undefined {
    return (
      certificate.config.majorEvent?.name ??
      certificate.config.eventGroup?.name ??
      certificate.config.event?.name ??
      undefined
    );
  }

  private getTargetEmoji(
    certificate: PublicCertificateValidationRecord,
  ): string | undefined {
    return (
      certificate.config.majorEvent?.emoji ??
      certificate.config.event?.emoji ??
      undefined
    );
  }

  private sumCreditMinutes(events: CertificateValidationEventRecord[]): number {
    return events.reduce(
      (total, event) => total + (event.creditMinutes ?? 0),
      0,
    );
  }

  private maskCpf(
    identityDocument: string | null,
    isCpf: boolean | null,
  ): string | undefined {
    if (isCpf === false || !identityDocument) {
      return undefined;
    }

    const digits = identityDocument.replace(/\D/g, '');
    if (!this.isValidCpf(digits)) {
      return undefined;
    }

    return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
  }

  private isValidCpf(digits: string): boolean {
    if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) {
      return false;
    }

    const firstDigit = this.calculateCpfDigit(digits.slice(0, 9), 10);
    const secondDigit = this.calculateCpfDigit(digits.slice(0, 10), 11);

    return (
      firstDigit === Number(digits[9]) && secondDigit === Number(digits[10])
    );
  }

  private calculateCpfDigit(digits: string, firstWeight: number): number {
    const sum = [...digits].reduce(
      (total, digit, index) => total + Number(digit) * (firstWeight - index),
      0,
    );
    const calculatedDigit = 11 - (sum % 11);
    return calculatedDigit >= 10 ? 0 : calculatedDigit;
  }
}
