import {
  CertificateIssuedTo,
  CertificateScope,
} from '@cacic-eventos/shared-data-types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceCategory, Prisma, SubscriptionStatus } from '@prisma/client';
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
        category: true,
        person: {
          select: PERSON_SELECT,
        },
      },
    });

    return attendances
      .filter((attendance) =>
        this.canIssueForAttendanceCategory(
          attendance.category,
          event.shouldIssueCertificateForNonPayingAttendees,
          event.shouldIssueCertificateForNonSubscribedAttendees,
        ),
      )
      .map((attendance) => ({
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
        category: true,
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
      const event = eventById.get(attendance.eventId);
      if (
        !event ||
        !this.canIssueForGroupedEventAttendance(attendance.category, event)
      ) {
        continue;
      }

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
        ...(majorEvent.isPaymentRequired ||
        !majorEvent.shouldIssueCertificateForNonPayingAttendees
          ? { subscriptionStatus: SubscriptionStatus.CONFIRMED }
          : {}),
        deletedAt: null,
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: MAJOR_EVENT_SUBSCRIPTION_SELECT,
    });

    const includeAttendanceWithoutMajorEventSubscription =
      !majorEvent.isPaymentRequired &&
      majorEvent.shouldIssueCertificateForNonPayingAttendees;

    if (
      subscriptions.length === 0 &&
      !includeAttendanceWithoutMajorEventSubscription
    ) {
      return [];
    }

    const issuableEvents = await this.prisma.event.findMany({
      where: {
        majorEventId: majorEvent.id,
        deletedAt: null,
        shouldIssueCertificate: true,
        OR: [
          {
            eventGroupId: null,
          },
          {
            eventGroup: {
              deletedAt: null,
              shouldIssueCertificate: true,
            },
          },
        ],
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
    const issuableEventById = new Map(
      issuableEvents.map((event) => [event.id, event]),
    );
    const groupedIssuableEvents = this.groupMajorEventEvents(issuableEvents);
    const attendancesByPerson = await this.prisma.eventAttendance.findMany({
      where: {
        ...(includeAttendanceWithoutMajorEventSubscription
          ? personId
            ? { personId }
            : {}
          : {
              personId: {
                in: subscriptions.map((subscription) => subscription.personId),
              },
            }),
        eventId: {
          in: issuableEventIds,
        },
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        eventId: true,
        category: true,
        person: {
          select: PERSON_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const peopleByPersonId = new Map(
      subscriptions.map((subscription) => [
        subscription.personId,
        subscription.person,
      ]),
    );
    const attendedEventIdsByPersonId = new Map<string, Set<string>>();
    for (const attendance of attendancesByPerson) {
      const event = issuableEventById.get(attendance.eventId);
      if (
        !event ||
        !this.canIssueForMajorEventAttendance(
          attendance.category,
          event,
          majorEvent,
        )
      ) {
        continue;
      }

      peopleByPersonId.set(attendance.personId, attendance.person);
      const current =
        attendedEventIdsByPersonId.get(attendance.personId) ?? new Set();
      current.add(attendance.eventId);
      attendedEventIdsByPersonId.set(attendance.personId, current);
    }

    return [...peopleByPersonId.entries()].flatMap(([personId, person]) => {
      const attendedEventIds = attendedEventIdsByPersonId.get(personId);
      if (!attendedEventIds) {
        return [];
      }
      const attendedEvents = this.resolveMajorEventCertificateEvents(
        attendedEventIds,
        issuableEventById,
        groupedIssuableEvents,
      );

      if (attendedEvents.length === 0) {
        return [];
      }

      return [
        {
          person,
          events: attendedEvents,
        },
      ];
    });
  }

  private groupMajorEventEvents(
    events: EventRecord[],
  ): Map<string, EventRecord[]> {
    const groupedEvents = new Map<string, EventRecord[]>();
    for (const event of events) {
      if (!event.eventGroupId) {
        continue;
      }

      const current = groupedEvents.get(event.eventGroupId) ?? [];
      current.push(event);
      groupedEvents.set(event.eventGroupId, current);
    }

    return groupedEvents;
  }

  private resolveMajorEventCertificateEvents(
    attendedEventIds: Set<string>,
    issuableEventById: Map<string, EventRecord>,
    groupedIssuableEvents: Map<string, EventRecord[]>,
  ): EventRecord[] {
    const completedEventGroupIds = new Set(
      [...groupedIssuableEvents.entries()]
        .filter(([, events]) =>
          events.every((event) => attendedEventIds.has(event.id)),
        )
        .map(([eventGroupId]) => eventGroupId),
    );

    return [...attendedEventIds]
      .map((eventId) => issuableEventById.get(eventId))
      .filter((event): event is EventRecord => event != null)
      .filter((event) => {
        if (!event.eventGroupId) {
          return true;
        }

        if (!event.eventGroup?.shouldIssueCertificate) {
          return false;
        }

        if (event.eventGroup?.shouldIssueCertificateForEachEvent) {
          return true;
        }

        if (event.eventGroup?.shouldIssuePartialCertificate) {
          return true;
        }

        return completedEventGroupIds.has(event.eventGroupId);
      });
  }

  private canIssueForGroupedEventAttendance(
    category: AttendanceCategory,
    event: EventRecord,
  ): boolean {
    return this.canIssueForAttendanceCategory(
      category,
      event.shouldIssueCertificateForNonPayingAttendees &&
        Boolean(event.eventGroup?.shouldIssueCertificateForNonPayingAttendees),
      event.shouldIssueCertificateForNonSubscribedAttendees &&
        Boolean(
          event.eventGroup?.shouldIssueCertificateForNonSubscribedAttendees,
        ),
    );
  }

  private canIssueForMajorEventAttendance(
    category: AttendanceCategory,
    event: EventRecord,
    majorEvent: {
      shouldIssueCertificateForNonPayingAttendees: boolean;
      shouldIssueCertificateForNonSubscribedAttendees: boolean;
    },
  ): boolean {
    return this.canIssueForAttendanceCategory(
      category,
      majorEvent.shouldIssueCertificateForNonPayingAttendees &&
        event.shouldIssueCertificateForNonPayingAttendees &&
        (event.eventGroupId
          ? Boolean(
              event.eventGroup?.shouldIssueCertificateForNonPayingAttendees,
            )
          : true),
      majorEvent.shouldIssueCertificateForNonSubscribedAttendees &&
        event.shouldIssueCertificateForNonSubscribedAttendees &&
        (event.eventGroupId
          ? Boolean(
              event.eventGroup?.shouldIssueCertificateForNonSubscribedAttendees,
            )
          : true),
    );
  }

  private canIssueForAttendanceCategory(
    category: AttendanceCategory,
    allowNonPaying: boolean,
    allowNonSubscribed: boolean,
  ): boolean {
    if (
      category === AttendanceCategory.REGULAR ||
      category === AttendanceCategory.UNKNOWN
    ) {
      return true;
    }

    if (category === AttendanceCategory.NON_PAYING) {
      return allowNonPaying;
    }

    if (category === AttendanceCategory.NON_SUBSCRIBED) {
      return allowNonSubscribed;
    }

    return false;
  }
}
