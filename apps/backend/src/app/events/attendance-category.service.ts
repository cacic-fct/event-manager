import { Injectable } from '@nestjs/common';
import { AttendanceCategory, Prisma, PrismaClient } from '@prisma/client';
import { AttendanceCurrentAssessment } from '@cacic-fct/shared-data-types';
import { normalizeAttendancePriceTier } from './attendance-price-tier-policy';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTENDANCE_POLICY_EVENT_SELECT,
  currentAssessmentForAttendance,
  eventAttendanceEligibility,
} from './attendance-eligibility';
import { AttendanceEligibility } from '@cacic-fct/shared-event-participation';

type PrismaExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;

type AttendanceEvent = {
  regularAttendancePriceTierIds?: string[];
  allowSubscription: boolean;
  autoSubscribe?: boolean;
  eventGroupId?: string | null;
  majorEventId: string | null;
  attendanceEligibility?: AttendanceEligibility | null;
  eventGroup?: { attendanceEligibility?: AttendanceEligibility | null } | null;
  majorEvent: { isPaymentRequired: boolean; attendanceEligibility?: AttendanceEligibility | null } | null;
};

type AttendanceAssessmentSubject = {
  personId: string;
  eventId: string;
  category: AttendanceCategory;
  event: AttendanceEvent;
};

type AttendanceRefreshSubject = {
  personId: string;
  eventId: string;
  event: AttendanceEvent & { id: string };
};

type AttendanceRefreshRow = {
  personId: string;
  eventId: string;
  event: AttendanceRefreshSubject['event'];
};

type BulkMajorEventSubscription = {
  majorEventId: string;
  personId: string;
  paymentTier: string | null;
  subscriptionStatus: string;
  selectedEvents: Array<{ eventId: string }>;
};

type BulkPriceTier = {
  id: string;
  name: string;
  price: { majorEventId: string };
};

const ATTENDANCE_UPDATE_CHUNK_SIZE = 500;

const ATTENDANCE_EVENT_SELECT = {
  ...ATTENDANCE_POLICY_EVENT_SELECT,
  id: true,
  regularAttendancePriceTierIds: true,
  allowSubscription: true,
  autoSubscribe: true,
} satisfies Prisma.EventSelect;

export function attendanceAssessmentKey(personId: string, eventId: string): string {
  return `${personId}:${eventId}`;
}

@Injectable()
export class AttendanceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCurrentAssessments(
    attendances: readonly AttendanceAssessmentSubject[],
    tx: PrismaExecutor = this.prisma,
  ): Promise<Map<string, AttendanceCurrentAssessment>> {
    const undefinedAttendances = attendances.filter((attendance) => attendance.category === AttendanceCategory.UNKNOWN);
    if (undefinedAttendances.length === 0) {
      return new Map();
    }

    const eventPolicies = await tx.event.findMany({
      where: {
        id: { in: [...new Set(undefinedAttendances.map((attendance) => attendance.eventId))] },
      },
      select: {
        ...ATTENDANCE_POLICY_EVENT_SELECT,
        id: true,
        regularAttendancePriceTierIds: true,
      },
    });
    const policyByEventId = new Map(eventPolicies.map((event) => [event.id, event]));
    const subjects: AttendanceRefreshSubject[] = undefinedAttendances.map((attendance) => {
      const policy = policyByEventId.get(attendance.eventId);
      return {
        personId: attendance.personId,
        eventId: attendance.eventId,
        event: {
          ...attendance.event,
          id: attendance.eventId,
          majorEventId: policy ? policy.majorEventId : attendance.event.majorEventId,
          eventGroupId: policy ? policy.eventGroupId : attendance.event.eventGroupId,
          attendanceEligibility:
            policy?.attendanceEligibility ?? attendance.event.attendanceEligibility ?? null,
          eventGroup: policy?.eventGroup ?? attendance.event.eventGroup ?? null,
          majorEvent: policy?.majorEvent ?? attendance.event.majorEvent ?? null,
          regularAttendancePriceTierIds:
            policy?.regularAttendancePriceTierIds ?? attendance.event.regularAttendancePriceTierIds ?? [],
        },
      };
    });

    return this.assessAttendances(subjects, tx);
  }

  async refreshForAttendance(personId: string, eventId: string, tx: PrismaExecutor = this.prisma): Promise<void> {
    const attendance = await tx.eventAttendance.findUnique({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      select: {
        personId: true,
        event: {
          select: {
            ...ATTENDANCE_POLICY_EVENT_SELECT,
            id: true,
            regularAttendancePriceTierIds: true,
            allowSubscription: true,
            autoSubscribe: true,
          },
        },
      },
    });

    if (!attendance) {
      return;
    }

    const currentAssessment = await this.assessAttendance(tx, attendance.personId, attendance.event);
    const category =
      currentAssessment === AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET
        ? AttendanceCategory.REGULAR
        : AttendanceCategory.NON_REGULAR;

    await tx.eventAttendance.update({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      data: {
        category,
        currentAssessment,
      },
    });
  }

  async refreshForMajorEventPerson(
    majorEventId: string,
    personId: string,
    tx: PrismaExecutor = this.prisma,
  ): Promise<void> {
    const attendances = await tx.eventAttendance.findMany({
      where: {
        personId,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
        personId: true,
        event: {
          select: ATTENDANCE_EVENT_SELECT,
        },
      },
    });

    await this.refreshAttendances(attendances, tx);
  }

  async refreshForEventPersons(
    eventIds: string[],
    personIds: string[],
    tx: PrismaExecutor = this.prisma,
  ): Promise<void> {
    if (eventIds.length === 0 || personIds.length === 0) {
      return;
    }

    const attendances = await tx.eventAttendance.findMany({
      where: {
        eventId: {
          in: eventIds,
        },
        personId: {
          in: personIds,
        },
      },
      select: {
        personId: true,
        eventId: true,
        event: {
          select: ATTENDANCE_EVENT_SELECT,
        },
      },
    });

    await this.refreshAttendances(attendances, tx);
  }

  async refreshForEvent(eventId: string, tx: PrismaExecutor = this.prisma): Promise<void> {
    const attendances = await tx.eventAttendance.findMany({
      where: { eventId },
      select: {
        personId: true,
        eventId: true,
        event: {
          select: ATTENDANCE_EVENT_SELECT,
        },
      },
    });
    await this.refreshAttendances(attendances, tx);
  }

  private async refreshAttendances(attendances: readonly AttendanceRefreshRow[], tx: PrismaExecutor): Promise<void> {
    if (attendances.length === 0) {
      return;
    }

    const subjects: AttendanceRefreshSubject[] = attendances.map((attendance) => ({
      personId: attendance.personId,
      eventId: attendance.eventId,
      event: {
        ...attendance.event,
      },
    }));

    const assessments = await this.assessAttendances(subjects, tx);
    const updates = new Map<
      string,
      {
        category: AttendanceCategory;
        currentAssessment: AttendanceCurrentAssessment;
        keys: Array<{ personId: string; eventId: string }>;
      }
    >();

    for (const subject of subjects) {
      const key = attendanceAssessmentKey(subject.personId, subject.eventId);
      const currentAssessment = assessments.get(key);
      if (!currentAssessment) {
        continue;
      }

      const category =
        currentAssessment === AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET
          ? AttendanceCategory.REGULAR
          : AttendanceCategory.NON_REGULAR;
      const updateKey = `${category}:${currentAssessment}`;
      const update = updates.get(updateKey) ?? { category, currentAssessment, keys: [] };
      update.keys.push({ personId: subject.personId, eventId: subject.eventId });
      updates.set(updateKey, update);
    }

    for (const update of updates.values()) {
      for (let offset = 0; offset < update.keys.length; offset += ATTENDANCE_UPDATE_CHUNK_SIZE) {
        const keys = update.keys.slice(offset, offset + ATTENDANCE_UPDATE_CHUNK_SIZE);
        await tx.eventAttendance.updateMany({
          where: {
            OR: keys,
          },
          data: {
            category: update.category,
            currentAssessment: update.currentAssessment,
          },
        });
      }
    }
  }

  private async assessAttendances(
    attendances: readonly AttendanceRefreshSubject[],
    tx: PrismaExecutor,
  ): Promise<Map<string, AttendanceCurrentAssessment>> {
    if (attendances.length === 0) {
      return new Map();
    }

    const personIds = [...new Set(attendances.map((attendance) => attendance.personId))];
    const eventIds = [...new Set(attendances.map((attendance) => attendance.eventId))];
    const majorEventIds = [
      ...new Set(
        attendances
          .map((attendance) => attendance.event.majorEventId)
          .filter((majorEventId): majorEventId is string => Boolean(majorEventId)),
      ),
    ];
    const tierIds = [
      ...new Set(attendances.flatMap((attendance) => attendance.event.regularAttendancePriceTierIds ?? [])),
    ];
    const majorEventIdFilter = majorEventIds.length === 1 ? majorEventIds[0] : { in: majorEventIds };

    const [eventSubscriptions, majorEventSubscriptions, priceTiers] = await Promise.all([
      tx.eventSubscription.findMany({
        where: {
          eventId: { in: eventIds },
          personId: { in: personIds },
          deletedAt: null,
        },
        select: {
          eventId: true,
          personId: true,
        },
      }),
      majorEventIds.length
        ? tx.majorEventSubscription.findMany({
            where: {
              majorEventId: { in: majorEventIds },
              personId: { in: personIds },
              deletedAt: null,
            },
            select: {
              majorEventId: true,
              personId: true,
              paymentTier: true,
              subscriptionStatus: true,
              selectedEvents: {
                where: { eventId: { in: eventIds }, deletedAt: null },
                select: { eventId: true },
              },
            },
          })
        : Promise.resolve([] as BulkMajorEventSubscription[]),
      tierIds.length && majorEventIds.length
        ? tx.priceTier.findMany({
            where: {
              id: { in: tierIds },
              price: { majorEventId: majorEventIdFilter },
            },
            select: {
              id: true,
              name: true,
              price: {
                select: {
                  majorEventId: true,
                },
              },
            },
          })
        : Promise.resolve([] as BulkPriceTier[]),
    ]);

    const eventSubscriptionKeys = new Set(
      eventSubscriptions.map((subscription) => attendanceAssessmentKey(subscription.personId, subscription.eventId)),
    );
    const majorSubscriptionByKey = new Map<string, BulkMajorEventSubscription>(
      majorEventSubscriptions.map((subscription) => [
        attendanceAssessmentKey(subscription.personId, subscription.majorEventId),
        subscription,
      ]),
    );
    const tierById = new Map(priceTiers.map((tier) => [tier.id, tier]));

    return new Map(
      attendances.map((attendance) => {
        const key = attendanceAssessmentKey(attendance.personId, attendance.eventId);
        const event = attendance.event;
        const majorSubscription = event.majorEventId
          ? majorSubscriptionByKey.get(attendanceAssessmentKey(attendance.personId, event.majorEventId))
          : undefined;
        const paymentTier = normalizeAttendancePriceTier(majorSubscription?.paymentTier);
        const policy = eventAttendanceEligibility(event);
        const tierEligible =
          policy === AttendanceEligibility.ANYONE ||
          !event.regularAttendancePriceTierIds?.length ||
          Boolean(
            event.majorEventId &&
              paymentTier &&
              event.regularAttendancePriceTierIds.some((tierId) => {
                const tier = tierById.get(tierId);
                return (
                  tier?.price.majorEventId === event.majorEventId &&
                  normalizeAttendancePriceTier(tier.name) === paymentTier
                );
              }),
          );

        return [
          key,
          tierEligible
            ? currentAssessmentForAttendance(event, {
                hasEventSubscription: eventSubscriptionKeys.has(key),
                majorEventSubscriptionStatus: majorSubscription?.subscriptionStatus,
                hasSelectedEvent: majorSubscription?.selectedEvents?.some(
                  (selectedEvent) => selectedEvent.eventId === event.id,
                ),
                autoSubscribe: event.autoSubscribe,
              })
            : AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE,
        ];
      }),
    );
  }

  private async isPriceTierEligible(
    tx: PrismaExecutor,
    personId: string,
    event: AttendanceAssessmentSubject['event'],
  ): Promise<boolean> {
    if (eventAttendanceEligibility(event) === AttendanceEligibility.ANYONE) {
      return true;
    }

    if (!event.majorEventId) return false;
    const [tiers, subscription] = await Promise.all([
      tx.priceTier.findMany({
        where: { id: { in: event.regularAttendancePriceTierIds ?? [] }, price: { majorEventId: event.majorEventId } },
        select: { name: true },
      }),
      tx.majorEventSubscription.findFirst({
        where: { majorEventId: event.majorEventId, personId, deletedAt: null },
        select: { paymentTier: true },
      }),
    ]);
    const paymentTier = normalizeAttendancePriceTier(subscription?.paymentTier);
    return Boolean(paymentTier && tiers.some((tier) => normalizeAttendancePriceTier(tier.name) === paymentTier));
  }

  private async assessAttendance(
    tx: PrismaExecutor,
    personId: string,
    event: {
      id: string;
      regularAttendancePriceTierIds?: string[];
      allowSubscription: boolean;
      autoSubscribe?: boolean;
      eventGroupId?: string | null;
      attendanceEligibility?: AttendanceEligibility | null;
      eventGroup?: { attendanceEligibility?: AttendanceEligibility | null } | null;
      majorEventId: string | null;
      majorEvent: { isPaymentRequired: boolean; attendanceEligibility?: AttendanceEligibility | null } | null;
    },
  ): Promise<AttendanceCurrentAssessment> {
    if (
      event.regularAttendancePriceTierIds?.length &&
      eventAttendanceEligibility(event) !== AttendanceEligibility.ANYONE
    ) {
      const eligible = await this.isPriceTierEligible(tx, personId, event);
      if (!eligible) return AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE;
    }

    const [eventSubscription, majorEventSubscription] = await Promise.all([
      tx.eventSubscription.findFirst({
        where: {
          eventId: event.id,
          personId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      }),
      event.majorEventId
        ? tx.majorEventSubscription.findFirst({
            where: {
              majorEventId: event.majorEventId,
              personId,
              deletedAt: null,
            },
            select: {
              subscriptionStatus: true,
              selectedEvents: {
                where: { eventId: event.id, deletedAt: null },
                select: { eventId: true },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    return currentAssessmentForAttendance(event, {
      hasEventSubscription: Boolean(eventSubscription),
      majorEventSubscriptionStatus: majorEventSubscription?.subscriptionStatus,
      hasSelectedEvent: majorEventSubscription?.selectedEvents?.some((selected) => selected.eventId === event.id),
      autoSubscribe: event.autoSubscribe,
    });
  }
}
