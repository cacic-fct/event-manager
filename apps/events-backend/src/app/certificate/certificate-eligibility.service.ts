import {
  CertificateIssuedTo,
  CertificateScope,
} from '@cacic-eventos/shared-data-types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_CONFIG_SELECT,
  EVENT_GROUP_SELECT,
  EVENT_SELECT,
  MAJOR_EVENT_SELECT,
  PERSON_SELECT,
  CertificateConfigRecord,
  EventRecord,
  PersonRecord,
} from './certificate.constants';

const MAJOR_EVENT_SUBSCRIPTION_SELECT = {
  majorEventId: true,
  personId: true,
  subscriptionStatus: true,
  person: {
    select: PERSON_SELECT,
  },
} satisfies Prisma.MajorEventSubscriptionSelect;

export type EligibleCertificateRecipient = {
  person: PersonRecord;
  events: EventRecord[];
};

@Injectable()
export class CertificateEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfigById(configId: string): Promise<CertificateConfigRecord> {
    const config = await this.prisma.certificateConfig.findFirst({
      where: {
        id: configId,
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    if (!config) {
      throw new NotFoundException(`Certificate config ${configId} not found.`);
    }

    return config;
  }

  async resolveEligibleRecipients(
    config: CertificateConfigRecord,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    if (config.issuedTo === CertificateIssuedTo.OTHER) {
      return personId ? this.resolveManualRecipient(config, personId) : [];
    }

    if (config.issuedTo === CertificateIssuedTo.LECTURER) {
      return this.resolveLecturerRecipients(config, personId);
    }

    if (config.scope === CertificateScope.EVENT) {
      return this.resolveEventRecipients(config.eventId, personId);
    }

    if (config.scope === CertificateScope.EVENT_GROUP) {
      return this.resolveEventGroupRecipients(config.eventGroupId, personId);
    }

    if (config.scope === CertificateScope.MAJOR_EVENT) {
      return this.resolveMajorEventRecipients(config.majorEventId, personId);
    }

    throw new BadRequestException(
      `Unsupported certificate scope ${config.scope}.`,
    );
  }

  private async resolveManualRecipient(
    config: CertificateConfigRecord,
    personId: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const person = await this.prisma.people.findFirst({
      where: {
        id: personId,
        deletedAt: null,
      },
      select: PERSON_SELECT,
    });

    if (!person) {
      return [];
    }

    return [
      {
        person,
        events: await this.resolveTargetEvents(config),
      },
    ];
  }

  private async resolveLecturerRecipients(
    config: CertificateConfigRecord,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const events = await this.resolveTargetEvents(config);
    if (events.length === 0) {
      return [];
    }

    const eventById = new Map(events.map((event) => [event.id, event]));
    const lecturers = await this.prisma.eventLecturer.findMany({
      where: {
        eventId: {
          in: events.map((event) => event.id),
        },
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        eventId: true,
        person: {
          select: PERSON_SELECT,
        },
      },
    });

    const recipientsByPerson = new Map<
      string,
      { person: PersonRecord; events: EventRecord[] }
    >();
    for (const lecturer of lecturers) {
      const event = eventById.get(lecturer.eventId);
      if (!event) {
        continue;
      }

      const current = recipientsByPerson.get(lecturer.personId);
      if (!current) {
        recipientsByPerson.set(lecturer.personId, {
          person: lecturer.person,
          events: [event],
        });
        continue;
      }

      current.events.push(event);
    }

    return [...recipientsByPerson.values()];
  }

  private async resolveTargetEvents(
    config: CertificateConfigRecord,
  ): Promise<EventRecord[]> {
    if (config.scope === CertificateScope.EVENT) {
      return config.event ? [config.event] : [];
    }

    if (config.scope === CertificateScope.EVENT_GROUP) {
      if (!config.eventGroupId) {
        throw new BadRequestException(
          'Event-group config must define eventGroupId.',
        );
      }

      return this.prisma.event.findMany({
        where: {
          eventGroupId: config.eventGroupId,
          deletedAt: null,
          majorEventId: null,
          shouldIssueCertificate: true,
        },
        select: EVENT_SELECT,
        orderBy: {
          startDate: 'asc',
        },
      });
    }

    if (config.scope === CertificateScope.MAJOR_EVENT) {
      if (!config.majorEventId) {
        throw new BadRequestException(
          'Major-event config must define majorEventId.',
        );
      }

      return this.prisma.event.findMany({
        where: {
          majorEventId: config.majorEventId,
          deletedAt: null,
          shouldIssueCertificate: true,
        },
        select: EVENT_SELECT,
        orderBy: {
          startDate: 'asc',
        },
      });
    }

    throw new BadRequestException(
      `Unsupported certificate scope ${config.scope}.`,
    );
  }

  private async resolveEventRecipients(
    eventId: string | null,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    if (!eventId) {
      throw new BadRequestException('Event config must define eventId.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        majorEventId: null,
        shouldIssueCertificate: true,
        OR: [
          {
            eventGroupId: null,
          },
          {
            eventGroup: {
              deletedAt: null,
              shouldIssueCertificateForEachEvent: true,
            },
          },
        ],
      },
      select: EVENT_SELECT,
    });

    if (!event) {
      throw new BadRequestException(
        `Event ${eventId} is not eligible for individual certificates.`,
      );
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: event.id,
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        person: {
          select: PERSON_SELECT,
        },
      },
    });

    return attendances.map((attendance) => ({
      person: attendance.person,
      events: [event],
    }));
  }

  private async resolveEventGroupRecipients(
    eventGroupId: string | null,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    if (!eventGroupId) {
      throw new BadRequestException(
        'Event-group config must define eventGroupId.',
      );
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id: eventGroupId,
        deletedAt: null,
      },
      select: EVENT_GROUP_SELECT,
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${eventGroupId} was not found.`);
    }

    if (eventGroup.shouldIssueCertificateForEachEvent) {
      throw new BadRequestException(
        `Event group ${eventGroupId} issues certificates per event. Use Event configs instead.`,
      );
    }

    const groupEvents = await this.prisma.event.findMany({
      where: {
        eventGroupId: eventGroup.id,
        deletedAt: null,
        majorEventId: null,
        shouldIssueCertificate: true,
      },
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    if (groupEvents.length === 0) {
      return [];
    }

    const groupEventIds = new Set(groupEvents.map((event) => event.id));
    const groupEventCount = groupEvents.length;
    const eventById = new Map(groupEvents.map((event) => [event.id, event]));

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: {
          in: [...groupEventIds],
        },
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        eventId: true,
        person: {
          select: PERSON_SELECT,
        },
      },
    });

    const attendanceByPerson = new Map<
      string,
      { person: PersonRecord; eventIds: Set<string> }
    >();
    for (const attendance of attendances) {
      const current = attendanceByPerson.get(attendance.personId);
      if (!current) {
        attendanceByPerson.set(attendance.personId, {
          person: attendance.person,
          eventIds: new Set([attendance.eventId]),
        });
        continue;
      }

      current.eventIds.add(attendance.eventId);
    }

    const recipients: EligibleCertificateRecipient[] = [];
    for (const { person, eventIds } of attendanceByPerson.values()) {
      if (
        !eventGroup.shouldIssuePartialCertificate &&
        eventIds.size < groupEventCount
      ) {
        continue;
      }

      const eventsForCertificate = eventGroup.shouldIssuePartialCertificate
        ? groupEvents.filter((event) => eventIds.has(event.id))
        : groupEvents;
      if (eventsForCertificate.length === 0) {
        continue;
      }

      // Preserve event ordering and avoid stale references.
      const orderedEvents = eventsForCertificate
        .map((event) => eventById.get(event.id))
        .filter((event): event is EventRecord => event != null);
      recipients.push({
        person,
        events: orderedEvents,
      });
    }

    return recipients;
  }

  private async resolveMajorEventRecipients(
    majorEventId: string | null,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    if (!majorEventId) {
      throw new BadRequestException(
        'Major-event config must define majorEventId.',
      );
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
      },
      select: MAJOR_EVENT_SELECT,
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId: majorEvent.id,
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        deletedAt: null,
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: MAJOR_EVENT_SUBSCRIPTION_SELECT,
    });

    if (subscriptions.length === 0) {
      return [];
    }

    const issuableEvents = await this.prisma.event.findMany({
      where: {
        majorEventId: majorEvent.id,
        deletedAt: null,
        shouldIssueCertificate: true,
      },
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    if (issuableEvents.length === 0) {
      return [];
    }

    const issuableEventIds = issuableEvents.map((event) => event.id);
    const attendancesByPerson = await this.prisma.eventAttendance.findMany({
      where: {
        personId: {
          in: subscriptions.map((subscription) => subscription.personId),
        },
        eventId: {
          in: issuableEventIds,
        },
      },
      select: {
        personId: true,
        event: {
          select: EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const attendedEventsByPersonId = new Map<string, EventRecord[]>();
    for (const attendance of attendancesByPerson) {
      const current = attendedEventsByPersonId.get(attendance.personId) ?? [];
      current.push(attendance.event);
      attendedEventsByPersonId.set(attendance.personId, current);
    }

    return subscriptions.flatMap((subscription) => {
      const attendedEvents =
        attendedEventsByPersonId.get(subscription.personId) ?? [];

      if (attendedEvents.length === 0) {
        return [];
      }

      return [
        {
          person: subscription.person,
          events: attendedEvents,
        },
      ];
    });
  }
}
