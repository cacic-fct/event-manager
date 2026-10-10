import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { isAttendanceEligible } from '@cacic-fct/shared-event-participation';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CertificateSportsEligibility } from './certificate-sports-eligibility';
import { isAutomaticSportsCertificateIssuedTo, isManualCertificateIssuedTo } from './certificate-sports-roles';
import { isApprovedAttendance, isRegisteredAttendanceEvidence } from '../events/attendance-eligibility';
import { normalizeAttendancePriceTier } from '../events/attendance-price-tier-policy';

const MAJOR_EVENT_SUBSCRIPTION_SELECT = {
  majorEventId: true,
  personId: true,
  subscriptionStatus: true,
  person: {
    select: PERSON_SELECT,
  },
} satisfies Prisma.MajorEventSubscriptionSelect;

const ATTENDANCE_MAJOR_EVENT_SUBSCRIPTION_SELECT = {
  majorEventId: true,
  personId: true,
  subscriptionStatus: true,
  paymentTier: true,
  selectedEvents: {
    where: {
      deletedAt: null,
    },
    select: {
      eventId: true,
    },
  },
} satisfies Prisma.MajorEventSubscriptionSelect;

const ATTENDANCE_PRICE_TIER_SELECT = {
  id: true,
  name: true,
  price: {
    select: {
      majorEventId: true,
    },
  },
} satisfies Prisma.PriceTierSelect;

type CertificateAttendanceFact = {
  registered: boolean;
  approved: boolean;
  hasEventSubscription: boolean;
  majorEventSubscriptionStatus: SubscriptionStatus | null;
  paymentTier: string | null;
  tierEligible: boolean;
};

type AttendanceMajorEventSubscription = Prisma.MajorEventSubscriptionGetPayload<{
  select: typeof ATTENDANCE_MAJOR_EVENT_SUBSCRIPTION_SELECT;
}>;

type AttendancePriceTier = Prisma.PriceTierGetPayload<{
  select: typeof ATTENDANCE_PRICE_TIER_SELECT;
}>;

type CertificateMajorEventPolicy = {
  isPaymentRequired: boolean;
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
};

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';

export type EligibleCertificateRecipient = {
  person: PersonRecord;
  events: EventRecord[];
};

@Injectable()
export class CertificateEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportsEligibility: CertificateSportsEligibility,
  ) {}

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
    if (isManualCertificateIssuedTo(config.issuedTo as CertificateIssuedTo)) {
      return personId ? this.resolveManualRecipient(config, personId) : [];
    }

    if (config.issuedTo === CertificateIssuedTo.LECTURER) {
      return this.resolveLecturerRecipients(config, personId);
    }

    if (isAutomaticSportsCertificateIssuedTo(config.issuedTo as CertificateIssuedTo)) {
      return this.sportsEligibility.resolve(config, personId);
    }

    if (config.scope === CertificateScope.EVENT) {
      return this.resolveEventRecipients(config, personId);
    }

    if (config.scope === CertificateScope.EVENT_GROUP) {
      return this.resolveEventGroupRecipients(config, personId);
    }

    if (config.scope === CertificateScope.MAJOR_EVENT) {
      return this.resolveMajorEventRecipients(config, personId);
    }

    throw new BadRequestException(`Unsupported certificate scope ${config.scope}.`);
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

    const recipientsByPerson = new Map<string, { person: PersonRecord; events: EventRecord[] }>();
    const lecturerEventCategory = this.parseLecturerEventCategory(config.certificateFields);
    for (const lecturer of lecturers) {
      const event = eventById.get(lecturer.eventId);
      if (!event || !this.matchesLecturerCategory(lecturerEventCategory, event)) {
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

  private matchesLecturerCategory(category: LecturerEventCategory | null, event: EventRecord): boolean {
    if (!category) {
      return true;
    }

    if (category === 'PALESTRA') {
      return event.type === EventType.PALESTRA;
    }

    if (category === 'MINICURSO') {
      return event.type === EventType.MINICURSO;
    }

    return true;
  }

  private parseLecturerEventCategory(certificateFields: Prisma.JsonValue | null): LecturerEventCategory | null {
    if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
      return null;
    }

    const value = certificateFields[LECTURER_EVENT_CATEGORY_FIELD];
    return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
  }

  private async resolveTargetEvents(config: CertificateConfigRecord): Promise<EventRecord[]> {
    if (config.scope === CertificateScope.EVENT) {
      return config.event ? [config.event] : [];
    }

    if (config.scope === CertificateScope.EVENT_GROUP) {
      if (!config.eventGroupId) {
        throw new BadRequestException('Event-group config must define eventGroupId.');
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
        throw new BadRequestException('Major-event config must define majorEventId.');
      }

      return this.prisma.event.findMany({
        where: {
          majorEventId: config.majorEventId,
          deletedAt: null,
          shouldIssueCertificate: true,
          sportsMatch: { is: null },
        },
        select: EVENT_SELECT,
        orderBy: {
          startDate: 'asc',
        },
      });
    }

    if (config.scope === CertificateScope.OTHER) {
      return [];
    }

    throw new BadRequestException(`Unsupported certificate scope ${config.scope}.`);
  }

  private async resolveEventRecipients(
    config: CertificateConfigRecord,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const eventId = config.eventId;
    if (!eventId) {
      throw new BadRequestException('Event config must define eventId.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        shouldIssueCertificate: true,
        OR: [
          {
            eventGroupId: null,
            majorEventId: null,
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
      throw new BadRequestException(`Event ${eventId} is not eligible for individual certificates.`);
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: event.id,
        status: 'PRESENT',
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

    const facts = await this.resolveAttendanceFacts([event], attendances.map((attendance) => attendance.personId));

    return attendances
      .filter((attendance) => this.canIssueForConfiguredAttendance(config, event, facts.get(this.attendanceFactKey(attendance.personId, event.id))))
      .map((attendance) => ({
        person: attendance.person,
        events: [event],
      }));
  }

  private async resolveEventGroupRecipients(
    config: CertificateConfigRecord,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const eventGroupId = config.eventGroupId;
    if (!eventGroupId) {
      throw new BadRequestException('Event-group config must define eventGroupId.');
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
        status: 'PRESENT',
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

    const facts = await this.resolveAttendanceFacts(groupEvents, attendances.map((attendance) => attendance.personId));

    const attendanceByPerson = new Map<string, { person: PersonRecord; eventIds: Set<string> }>();
    for (const attendance of attendances) {
      const event = eventById.get(attendance.eventId);
      if (
        !event ||
        !this.canIssueForConfiguredAttendance(
          config,
          event,
          facts.get(this.attendanceFactKey(attendance.personId, event.id)),
        )
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
      if (!eventGroup.shouldIssuePartialCertificate && eventIds.size < groupEventCount) {
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
    config: CertificateConfigRecord,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const majorEventId = config.majorEventId;
    if (!majorEventId) {
      throw new BadRequestException('Major-event config must define majorEventId.');
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

    const includeAttendanceWithoutMajorEventSubscription =
      !majorEvent.isPaymentRequired && majorEvent.shouldIssueCertificateForNonPayingAttendees;
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId: majorEvent.id,
        ...(includeAttendanceWithoutMajorEventSubscription ? {} : { subscriptionStatus: SubscriptionStatus.CONFIRMED }),
        deletedAt: null,
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
      },
      select: MAJOR_EVENT_SUBSCRIPTION_SELECT,
    });

    if (subscriptions.length === 0 && !includeAttendanceWithoutMajorEventSubscription) {
      return [];
    }

    const issuableEvents = await this.prisma.event.findMany({
      where: {
        majorEventId: majorEvent.id,
        deletedAt: null,
        shouldIssueCertificate: true,
        sportsMatch: { is: null },
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
    const issuableEventById = new Map(issuableEvents.map((event) => [event.id, event]));
    const groupedIssuableEvents = this.groupMajorEventEvents(issuableEvents);
    const attendancesByPerson = await this.prisma.eventAttendance.findMany({
      where: {
        status: 'PRESENT',
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

    const facts = await this.resolveAttendanceFacts(issuableEvents, attendancesByPerson.map((attendance) => attendance.personId));

    const peopleByPersonId = new Map(subscriptions.map((subscription) => [subscription.personId, subscription.person]));
    const attendedEventIdsByPersonId = new Map<string, Set<string>>();
    for (const attendance of attendancesByPerson) {
      const event = issuableEventById.get(attendance.eventId);
      if (
        !event ||
        !this.canIssueForConfiguredAttendance(
          config,
          event,
          facts.get(this.attendanceFactKey(attendance.personId, event.id)),
          majorEvent,
        )
      ) {
        continue;
      }

      peopleByPersonId.set(attendance.personId, attendance.person);
      const current = attendedEventIdsByPersonId.get(attendance.personId) ?? new Set();
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

  private groupMajorEventEvents(events: EventRecord[]): Map<string, EventRecord[]> {
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
        .filter(([, events]) => events.every((event) => attendedEventIds.has(event.id)))
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

  private async resolveAttendanceFacts(
    events: readonly EventRecord[],
    personIds: readonly string[],
  ): Promise<Map<string, CertificateAttendanceFact>> {
    const uniquePersonIds = [...new Set(personIds)];
    const uniqueEventIds = [...new Set(events.map((event) => event.id))];
    const majorEventIds = [
      ...new Set(
        events
          .map((event) => event.majorEventId)
          .filter((majorEventId): majorEventId is string => Boolean(majorEventId)),
      ),
    ];
    if (uniquePersonIds.length === 0 || uniqueEventIds.length === 0) {
      return new Map();
    }

    const tierIds = [
      ...new Set(events.flatMap((event) => event.regularAttendancePriceTierIds ?? [])),
    ];
    const [eventSubscriptions, majorSubscriptions, priceTiers] = await Promise.all([
      this.prisma.eventSubscription.findMany({
        where: {
          eventId: { in: uniqueEventIds },
          personId: { in: uniquePersonIds },
          deletedAt: null,
        },
        select: { eventId: true, personId: true },
      }),
      majorEventIds.length
        ? this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId: { in: majorEventIds },
              personId: { in: uniquePersonIds },
              deletedAt: null,
            },
            select: {
              ...ATTENDANCE_MAJOR_EVENT_SUBSCRIPTION_SELECT,
              selectedEvents: {
                where: {
                  eventId: { in: uniqueEventIds },
                  deletedAt: null,
                },
                select: {
                  eventId: true,
                },
              },
            },
          })
        : Promise.resolve([] as AttendanceMajorEventSubscription[]),
      tierIds.length > 0 && majorEventIds.length > 0
        ? this.prisma.priceTier.findMany({
            where: {
              id: { in: tierIds },
              price: {
                majorEventId: { in: majorEventIds },
              },
            },
            select: ATTENDANCE_PRICE_TIER_SELECT,
          })
        : Promise.resolve([] as AttendancePriceTier[]),
    ]);

    const eventSubscriptionKeys = new Set(
      eventSubscriptions.map((subscription) => this.attendanceFactKey(subscription.personId, subscription.eventId)),
    );
    const majorSubscriptionByKey = new Map<string, AttendanceMajorEventSubscription>(
      majorSubscriptions.map((subscription) => [
        this.attendanceFactKey(subscription.personId, subscription.majorEventId),
        subscription,
      ]),
    );
    const priceTierById = new Map(priceTiers.map((tier) => [tier.id, tier]));
    const facts = new Map<string, CertificateAttendanceFact>();
    for (const personId of uniquePersonIds) {
      for (const event of events) {
        const majorSubscription = event.majorEventId
          ? majorSubscriptionByKey.get(this.attendanceFactKey(personId, event.majorEventId))
          : undefined;
        const registrationEvidence = {
          hasEventSubscription: eventSubscriptionKeys.has(this.attendanceFactKey(personId, event.id)),
          majorEventSubscriptionStatus: majorSubscription?.subscriptionStatus,
          hasSelectedEvent: majorSubscription?.selectedEvents?.some((selected) => selected.eventId === event.id),
          autoSubscribe: event.autoSubscribe,
        };
        const paymentTier = normalizeAttendancePriceTier(majorSubscription?.paymentTier);
        const regularAttendancePriceTierIds = event.regularAttendancePriceTierIds ?? [];
        facts.set(this.attendanceFactKey(personId, event.id), {
          registered: isRegisteredAttendanceEvidence(event, registrationEvidence),
          approved: isApprovedAttendance(event, registrationEvidence),
          hasEventSubscription: registrationEvidence.hasEventSubscription,
          majorEventSubscriptionStatus: majorSubscription?.subscriptionStatus ?? null,
          paymentTier,
          tierEligible:
            regularAttendancePriceTierIds.length === 0 ||
            Boolean(
              event.majorEventId &&
                paymentTier &&
                regularAttendancePriceTierIds.some((tierId) => {
                  const tier = priceTierById.get(tierId);
                  return (
                    tier?.price.majorEventId === event.majorEventId &&
                    normalizeAttendancePriceTier(tier.name) === paymentTier
                  );
                }),
            ),
        });
      }
    }

    return facts;
  }

  private canIssueForConfiguredAttendance(
    config: CertificateConfigRecord,
    event: EventRecord,
    fact: CertificateAttendanceFact | undefined,
    majorEvent?: CertificateMajorEventPolicy | null,
  ): boolean {
    if (!fact || !fact.tierEligible) {
      return false;
    }

    if (!this.canIssueForTargetAttendance(config.scope, event, fact, majorEvent ?? config.majorEvent)) {
      return false;
    }

    if (!this.matchesCertificatePaymentTiers(config, fact)) {
      return false;
    }

    if (!config.attendeeEligibility) {
      return true;
    }

    return isAttendanceEligible(config.attendeeEligibility, fact);
  }

  private canIssueForTargetAttendance(
    scope: CertificateScope,
    event: EventRecord,
    fact: CertificateAttendanceFact,
    majorEvent?: CertificateMajorEventPolicy | null,
  ): boolean {
    const eventGroup = event.eventGroupId ? event.eventGroup : null;
    const allowsNonPaying =
      event.shouldIssueCertificateForNonPayingAttendees &&
      (!event.eventGroupId || eventGroup?.shouldIssueCertificateForNonPayingAttendees === true);
    const allowsNonSubscribed =
      event.shouldIssueCertificateForNonSubscribedAttendees &&
      (!event.eventGroupId || eventGroup?.shouldIssueCertificateForNonSubscribedAttendees === true);
    const isPaymentPending =
      Boolean(event.majorEventId) &&
      (scope === CertificateScope.MAJOR_EVENT
        ? majorEvent?.isPaymentRequired
        : event.majorEvent?.isPaymentRequired ?? false) &&
      fact.majorEventSubscriptionStatus !== SubscriptionStatus.CONFIRMED;

    if (isPaymentPending) {
      return scope === CertificateScope.MAJOR_EVENT
        ? Boolean(majorEvent?.shouldIssueCertificateForNonPayingAttendees && allowsNonPaying)
        : allowsNonPaying;
    }

    if (event.allowSubscription && !fact.hasEventSubscription) {
      return scope === CertificateScope.MAJOR_EVENT
        ? Boolean(majorEvent?.shouldIssueCertificateForNonSubscribedAttendees && allowsNonSubscribed)
        : allowsNonSubscribed;
    }

    return true;
  }

  private matchesCertificatePaymentTiers(
    config: CertificateConfigRecord,
    fact: CertificateAttendanceFact,
  ): boolean {
    const configuredTiers = (config.paymentTiers ?? [])
      .map((tier) => normalizeAttendancePriceTier(tier))
      .filter((tier): tier is string => tier !== null);
    if ((config.paymentTiers ?? []).length === 0) {
      return true;
    }

    return fact.paymentTier !== null && configuredTiers.includes(fact.paymentTier);
  }

  private attendanceFactKey(personId: string, eventId: string): string {
    return `${personId}:${eventId}`;
  }
}
