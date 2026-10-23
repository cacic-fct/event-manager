import {
  CertificateIssuedTo,
  CertificateScope,
  EventType,
  PublicCertificateValidation,
  PublicCertificateValidationEvent,
  PublicCertificateValidationEventSection,
} from '@cacic-fct/shared-data-types';
import { isValidCPF, maskCPF } from '@cacic-fct/shared-utils';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';
import { isManualCertificateIssuedTo } from './certificate-sports-roles';

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
  isPubliclyListed: true,
  deletedAt: true,
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
  renderedData: true,
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
      isActive: true,
      issuedTo: true,
      certificateText: true,
      shouldAutofillSecondPage: true,
      secondPageText: true,
      certificateTypeLabel: true,
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
          events: {
            where: {
              deletedAt: null,
              isPubliclyListed: true,
              publicationState: 'PUBLISHED',
              OR: [{ majorEventId: null }, { majorEvent: { deletedAt: null, publicationState: 'PUBLISHED' } }],
            },
            select: { id: true },
            take: 1,
          },
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
      folder: {
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

  async validateCertificate(certificateId: string): Promise<PublicCertificateValidation | null> {
    const normalizedCertificateId = this.validation.normalizeOptionalId(certificateId);
    if (!normalizedCertificateId) {
      return null;
    }

    const storedCertificate = await this.prisma.certificate.findFirst({
      where: {
        id: normalizedCertificateId,
        deletedAt: null,
        config: {
          deletedAt: null,
          isActive: true,
        },
      },
      select: PUBLIC_CERTIFICATE_VALIDATION_SELECT,
    });
    if (!storedCertificate) {
      return null;
    }

    // Scope and role belong to the issued certificate, even if its config changes.
    const renderedData = this.getRenderedDataObject(storedCertificate);
    const certificate = {
      ...storedCertificate,
      config: {
        ...storedCertificate.config,
        scope: this.readEnum(renderedData.scope, CertificateScope, storedCertificate.config.scope as CertificateScope),
        issuedTo: this.readEnum(
          renderedData.issuedTo,
          CertificateIssuedTo,
          storedCertificate.config.issuedTo as CertificateIssuedTo,
        ),
      },
    };
    const person = this.asJsonObject(renderedData.person);
    const events = await this.resolveCertificateEvents(certificate);
    const publiclyListedEvents = events.filter((event) => this.isCertificateEventPublic(event));
    const sections = this.buildSections(certificate, publiclyListedEvents);

    return {
      id: certificate.id,
      issuedAt: certificate.issuedAt,
      personName: this.readNonEmptyString(person?.name, certificate.person.name),
      maskedIdentityDocument:
        person && Object.prototype.hasOwnProperty.call(person, 'identityDocument')
          ? this.maskCpf(typeof person.identityDocument === 'string' ? person.identityDocument : null, null)
          : this.maskCpf(certificate.person.identityDocument, certificate.person.isCPF),
      scope: certificate.config.scope as CertificateScope,
      certificateName: this.readNonEmptyString(renderedData.configName, certificate.config.name),
      issuedTo: certificate.config.issuedTo as CertificateIssuedTo,
      certificateTypeLabel: this.readRenderedNullableString(
        certificate,
        'certificateTypeLabel',
        certificate.config.certificateTypeLabel,
      ),
      certificateText: this.readRenderedNullableString(certificate, 'configText', certificate.config.certificateText),
      shouldAutofillSecondPage: this.readRenderedBoolean(
        certificate,
        'shouldAutofillSecondPage',
        certificate.config.shouldAutofillSecondPage,
      ),
      secondPageText: this.readRenderedNullableString(certificate, 'secondPageText', certificate.config.secondPageText),
      targetName: this.getTargetName(certificate, publiclyListedEvents),
      targetEmoji: this.getTargetEmoji(certificate),
      sections,
      totalCreditMinutes: this.sumCreditMinutes(publiclyListedEvents),
    };
  }

  private async resolveCertificateEvents(
    certificate: PublicCertificateValidationRecord,
  ): Promise<CertificateValidationEventRecord[]> {
    // Manual recipients inherit target events during issuance for template variables.
    // Those events do not represent activities credited to this recipient.
    if (isManualCertificateIssuedTo(certificate.config.issuedTo as CertificateIssuedTo)) {
      return [];
    }

    const issuedEvents = this.getIssuedEvents(certificate);
    if (issuedEvents !== null) {
      return this.listIssuedCertificateEvents(issuedEvents);
    }

    if (certificate.config.issuedTo === CertificateIssuedTo.LECTURER) {
      return this.listLecturerCertificateEvents(certificate);
    }

    // Sports participation cannot be reconstructed from ordinary attendance.
    if (certificate.config.issuedTo !== CertificateIssuedTo.ATTENDEE) {
      return [];
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

  private getIssuedEvents(certificate: PublicCertificateValidationRecord): Map<string, Prisma.JsonObject> | null {
    const renderedEvents = this.getRenderedDataObject(certificate).events;
    if (!Array.isArray(renderedEvents)) {
      return null;
    }

    const events = new Map<string, Prisma.JsonObject>();
    for (const value of renderedEvents) {
      const event = this.asJsonObject(value);
      if (event && typeof event.id === 'string' && event.id.trim() && !events.has(event.id)) {
        events.set(event.id, event);
      }
    }
    return events;
  }

  private async listIssuedCertificateEvents(
    issuedEvents: Map<string, Prisma.JsonObject>,
  ): Promise<CertificateValidationEventRecord[]> {
    if (issuedEvents.size === 0) {
      return [];
    }

    const events = await this.prisma.event.findMany({
      where: {
        id: {
          in: [...issuedEvents.keys()],
        },
        deletedAt: null,
      },
      select: CERTIFICATE_VALIDATION_EVENT_SELECT,
    });
    const eventsById = new Map(events.map((event) => [event.id, event]));

    return [...issuedEvents].flatMap(([eventId, issued]) => {
      const event = eventsById.get(eventId);
      if (!event) {
        return [];
      }

      // Keep live publication checks, but show the details captured at issuance.
      return [
        {
          ...event,
          name: this.readNonEmptyString(issued.name, event.name),
          startDate: this.readDate(issued.startDate, event.startDate),
          endDate: this.readDate(issued.endDate, event.endDate),
          creditMinutes: this.readCreditMinutes(issued.creditMinutes, event.creditMinutes),
          type: this.readEnum(issued.type, EventType, event.type as EventType),
        },
      ];
    });
  }

  private asJsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  private readNonEmptyString(value: Prisma.JsonValue | undefined, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private readEnum<T extends string>(value: Prisma.JsonValue | undefined, values: Record<string, T>, fallback: T): T {
    return Object.values(values).find((candidate) => candidate === value) ?? fallback;
  }

  private readCreditMinutes(value: Prisma.JsonValue | undefined, fallback: number | null): number | null {
    if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
      return value;
    }
    return fallback;
  }

  private readDate(value: Prisma.JsonValue | undefined, fallback: Date): Date {
    const date = typeof value === 'string' ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : fallback;
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
        status: 'PRESENT',
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
        status: 'PRESENT',
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

    // Keep legacy certificates consistent with issuance: OTHER is the
    // catch-all lecturer option, rather than an EventType.OTHER filter.
    return true;
  }

  private parseLecturerEventCategory(certificateFields: Prisma.JsonValue | null): LecturerEventCategory | null {
    if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
      return null;
    }

    const value = certificateFields[LECTURER_EVENT_CATEGORY_FIELD];
    return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
  }

  private readRenderedNullableString(
    certificate: PublicCertificateValidationRecord,
    key: string,
    fallback: string | null,
  ): string | null {
    const renderedData = this.getRenderedDataObject(certificate);
    if (!Object.prototype.hasOwnProperty.call(renderedData, key)) {
      return fallback;
    }

    const value = renderedData[key];
    return typeof value === 'string' || value === null ? value : fallback;
  }

  private readRenderedBoolean(certificate: PublicCertificateValidationRecord, key: string, fallback: boolean): boolean {
    const renderedData = this.getRenderedDataObject(certificate);
    if (!Object.prototype.hasOwnProperty.call(renderedData, key)) {
      return fallback;
    }

    const value = renderedData[key];
    return typeof value === 'boolean' ? value : fallback;
  }

  private getRenderedDataObject(certificate: PublicCertificateValidationRecord): Prisma.JsonObject {
    return certificate.renderedData &&
      typeof certificate.renderedData === 'object' &&
      !Array.isArray(certificate.renderedData)
      ? certificate.renderedData
      : {};
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
      return 'Eventos certificados';
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
    publiclyListedEvents: CertificateValidationEventRecord[],
  ): string | undefined {
    if (
      certificate.config.scope === CertificateScope.EVENT &&
      !this.isCertificateEventPublic(certificate.config.event)
    ) {
      return undefined;
    }

    if (certificate.config.scope === CertificateScope.MAJOR_EVENT && !this.isCertificateMajorEventPublic(certificate)) {
      return undefined;
    }

    if (
      certificate.config.scope === CertificateScope.EVENT_GROUP &&
      publiclyListedEvents.length === 0 &&
      !certificate.config.eventGroup?.events?.length
    ) {
      return undefined;
    }

    const target = this.getCurrentTarget(certificate);
    const issuedTarget = this.asJsonObject(this.getRenderedDataObject(certificate).target);
    if (issuedTarget && issuedTarget.id !== target?.id) {
      return undefined;
    }
    return issuedTarget ? this.readNonEmptyString(issuedTarget.name, target?.name ?? '') : target?.name;
  }

  private getCurrentTarget(certificate: PublicCertificateValidationRecord) {
    switch (certificate.config.scope) {
      case CertificateScope.EVENT:
        return certificate.config.event;
      case CertificateScope.EVENT_GROUP:
        return certificate.config.eventGroup;
      case CertificateScope.MAJOR_EVENT:
        return certificate.config.majorEvent;
      case CertificateScope.OTHER:
        return certificate.config.folder;
    }
    return null;
  }

  private getTargetEmoji(certificate: PublicCertificateValidationRecord): string | undefined {
    const issuedTarget = this.asJsonObject(this.getRenderedDataObject(certificate).target);
    if (issuedTarget && issuedTarget.id !== this.getCurrentTarget(certificate)?.id) {
      return undefined;
    }
    if (
      certificate.config.scope === CertificateScope.EVENT &&
      !this.isCertificateEventPublic(certificate.config.event)
    ) {
      return undefined;
    }

    if (certificate.config.scope === CertificateScope.MAJOR_EVENT && !this.isCertificateMajorEventPublic(certificate)) {
      return undefined;
    }

    if (certificate.config.scope === CertificateScope.OTHER) {
      return certificate.config.folder?.emoji ?? undefined;
    }

    return certificate.config.majorEvent?.emoji ?? certificate.config.event?.emoji ?? undefined;
  }

  private isCertificateEventPublic(
    event?: CertificateValidationEventRecord | null,
  ): event is CertificateValidationEventRecord {
    return Boolean(
      event &&
        event.deletedAt == null &&
        event.isPubliclyListed &&
        event.publicationState === 'PUBLISHED' &&
        (!event.majorEventId ||
          Boolean(
            event.majorEvent && event.majorEvent.deletedAt == null && event.majorEvent.publicationState === 'PUBLISHED',
          )),
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

    return maskCPF(digits);
  }
}
