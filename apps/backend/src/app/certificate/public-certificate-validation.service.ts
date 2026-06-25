import {
  CertificateIssuedTo,
  CertificateScope,
  EventType,
  PublicCertificateValidation,
  PublicCertificateValidationEvent,
  PublicCertificateValidationEventSection,
} from '@cacic-fct/shared-data-types';
import { isValidCPF } from '@cacic-fct/shared-utils';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';

const CERTIFICATE_VALIDATION_EVENT_SELECT = {
  name: true,
  id: true,
  emoji: true,
  startDate: true,
  endDate: true,
  creditMinutes: true,
  type: true,
  publiclyVisible: true,
  publicationState: true,
  majorEventId: true,
  majorEvent: {
    select: {
      deletedAt: true,
      publicationState: true,
    },
  },
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
      issuedTo: true,
      certificateFields: true,
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
          deletedAt: true,
          publicationState: true,
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

  async validateCertificate(certificateId: string): Promise<PublicCertificateValidation | null> {
    const normalizedCertificateId = this.validation.normalizeOptionalId(certificateId);
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
    const publiclyVisibleEvents = events.filter((event) => this.isCertificateEventPublic(event));
    const sections = this.buildSections(certificate, publiclyVisibleEvents);

    return {
      id: certificate.id,
      issuedAt: certificate.issuedAt,
      personName: certificate.person.name,
      maskedIdentityDocument: this.maskCpf(certificate.person.identityDocument, certificate.person.isCPF),
      scope: certificate.config.scope as CertificateScope,
      certificateName: certificate.config.name,
      targetName: this.getTargetName(certificate, publiclyVisibleEvents),
      targetEmoji: this.getTargetEmoji(certificate),
      sections,
      totalCreditMinutes: this.sumCreditMinutes(publiclyVisibleEvents),
    };
  }

  private async resolveCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    if (certificate.config.issuedTo === CertificateIssuedTo.LECTURER) {
      return this.listLecturerCertificateEvents(certificate);
    }

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

  private async listLecturerCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    const events = await this.listCertificateTargetEvents(certificate);
    if (events.length === 0) {
      return [];
    }

    const lecturers = await this.prisma.eventLecturer.findMany({
      where: {
        personId: certificate.personId,
        eventId: {
          in: events.map((event) => event.id),
        },
      },
      select: {
        eventId: true,
      },
    });

    const lecturerEventCategory = this.parseLecturerEventCategory(certificate.config.certificateFields);
    const lecturerEventIds = new Set(lecturers.map((lecturer) => lecturer.eventId));
    return events.filter(
      (event) => lecturerEventIds.has(event.id) && this.matchesLecturerCategory(lecturerEventCategory, event),
    );
  }

  private listCertificateTargetEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> | CertificateValidationEventRecord[] {
    if (certificate.config.scope === CertificateScope.EVENT) {
      return certificate.config.event ? [certificate.config.event] : [];
    }

    if (certificate.config.scope === CertificateScope.EVENT_GROUP) {
      const eventGroupId = certificate.config.eventGroup?.id;
      return eventGroupId ? this.listAllEventGroupCertificateEvents(eventGroupId) : [];
    }

    if (certificate.config.scope === CertificateScope.MAJOR_EVENT) {
      const majorEventId = certificate.config.majorEvent?.id;
      return majorEventId ? this.listAllMajorEventCertificateEvents(majorEventId) : [];
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
      return this.listAttendedEventGroupCertificateEvents(certificate.personId, eventGroup.id);
    }

    const subscribedEvents = await this.listSubscribedEventGroupCertificateEvents(certificate.personId, eventGroup.id);

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

  private listAllEventGroupCertificateEvents(eventGroupId: string): Promise<CertificateValidationEventRecord[]> {
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

  private listAllMajorEventCertificateEvents(majorEventId: string): Promise<CertificateValidationEventRecord[]> {
    return this.prisma.event.findMany({
      where: {
        majorEventId,
        deletedAt: null,
        shouldIssueCertificate: true,
      },
      select: CERTIFICATE_VALIDATION_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  private matchesLecturerCategory(
    category: LecturerEventCategory | null,
    event: CertificateValidationEventRecord,
  ): boolean {
    if (!category) {
      return true;
    }

    if (category === 'PALESTRA') {
      return event.type === EventType.PALESTRA;
    }

    if (category === 'MINICURSO') {
      return event.type === EventType.MINICURSO;
    }

    return event.type !== EventType.PALESTRA && event.type !== EventType.MINICURSO;
  }

  private parseLecturerEventCategory(certificateFields: Prisma.JsonValue | null): LecturerEventCategory | null {
    if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
      return null;
    }

    const value = certificateFields[LECTURER_EVENT_CATEGORY_FIELD];
    return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
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
        events: events.filter((event) => event.type !== EventType.MINICURSO && event.type !== EventType.PALESTRA),
      },
    ]
      .filter((section) => section.events.length > 0)
      .map((section) => ({
        ...section,
        creditMinutes: this.sumCreditMinutes(section.events),
        events: section.events.map((event) => this.mapEvent(event)),
      }));
  }

  private getDefaultSectionTitle(certificate: PublicCertificateValidationRecord): string {
    if (certificate.config.scope === CertificateScope.EVENT_GROUP) {
      return certificate.config.eventGroup?.shouldIssuePartialCertificate
        ? 'Eventos com presença'
        : 'Eventos inscritos';
    }

    return 'Evento';
  }

  private mapEvent(event: CertificateValidationEventRecord): PublicCertificateValidationEvent {
    return {
      name: event.name,
      id: event.id,
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
      creditMinutes: event.creditMinutes ?? undefined,
    };
  }

  private getTargetName(
    certificate: PublicCertificateValidationRecord,
    publiclyVisibleEvents: CertificateValidationEventRecord[],
  ): string | undefined {
    if (
      certificate.config.scope === CertificateScope.EVENT &&
      !this.isCertificateEventPublic(certificate.config.event)
    ) {
      return undefined;
    }

    if (
      certificate.config.scope === CertificateScope.MAJOR_EVENT &&
      !this.isCertificateMajorEventPublic(certificate)
    ) {
      return undefined;
    }

    if (certificate.config.scope === CertificateScope.EVENT_GROUP && publiclyVisibleEvents.length === 0) {
      return undefined;
    }

    return (
      certificate.config.majorEvent?.name ??
      certificate.config.eventGroup?.name ??
      certificate.config.event?.name ??
      undefined
    );
  }

  private getTargetEmoji(certificate: PublicCertificateValidationRecord): string | undefined {
    if (
      certificate.config.scope === CertificateScope.EVENT &&
      !this.isCertificateEventPublic(certificate.config.event)
    ) {
      return undefined;
    }

    if (
      certificate.config.scope === CertificateScope.MAJOR_EVENT &&
      !this.isCertificateMajorEventPublic(certificate)
    ) {
      return undefined;
    }

    return certificate.config.majorEvent?.emoji ?? certificate.config.event?.emoji ?? undefined;
  }

  private isCertificateEventPublic(event?: CertificateValidationEventRecord | null): event is CertificateValidationEventRecord {
    return Boolean(
      event &&
        event.publiclyVisible &&
        event.publicationState === 'PUBLISHED' &&
        (!event.majorEventId ||
          Boolean(event.majorEvent && event.majorEvent.deletedAt == null && event.majorEvent.publicationState === 'PUBLISHED')),
    );
  }

  private isCertificateMajorEventPublic(certificate: PublicCertificateValidationRecord): boolean {
    return (
      certificate.config.majorEvent?.deletedAt == null &&
      certificate.config.majorEvent?.publicationState === 'PUBLISHED'
    );
  }

  private sumCreditMinutes(events: CertificateValidationEventRecord[]): number {
    return events.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
  }

  private maskCpf(identityDocument: string | null, isCpf: boolean | null): string | undefined {
    if (isCpf === false || !identityDocument) {
      return undefined;
    }

    const digits = identityDocument.replace(/\D/g, '');
    if (!isValidCPF(digits)) {
      return undefined;
    }

    return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
  }
}
