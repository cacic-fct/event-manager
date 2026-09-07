import { Injectable } from '@nestjs/common';
import { AttendanceCategory, Prisma, PrismaClient } from '@prisma/client';
import { AttendanceCurrentAssessment } from '@cacic-fct/shared-data-types';
import { normalizeAttendancePriceTier } from './attendance-price-tier-policy';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;

type AttendanceAssessmentSubject = {
  personId: string;
  eventId: string;
  category: AttendanceCategory;
  event: {
    regularAttendancePriceTierIds?: string[];
    allowSubscription: boolean;
    majorEventId: string | null;
    majorEvent: { isPaymentRequired: boolean } | null;
  };
};

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

    const personIds = [...new Set(undefinedAttendances.map((attendance) => attendance.personId))];
    const eventIds = [...new Set(undefinedAttendances.map((attendance) => attendance.eventId))];
    const majorEventIds = [
      ...new Set(
        undefinedAttendances
          .map((attendance) => attendance.event.majorEventId)
          .filter((majorEventId): majorEventId is string => Boolean(majorEventId)),
      ),
    ];
    const [eventSubscriptions, majorEventSubscriptions] = await Promise.all([
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
              subscriptionStatus: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const eventSubscriptionKeys = new Set(
      eventSubscriptions.map((subscription) => attendanceAssessmentKey(subscription.personId, subscription.eventId)),
    );
    const majorSubscriptionStatusByKey = new Map(
      majorEventSubscriptions.map((subscription) => [
        attendanceAssessmentKey(subscription.personId, subscription.majorEventId),
        subscription.subscriptionStatus,
      ]),
    );

    const restrictedEvents = await tx.event.findMany({
      where: { id: { in: eventIds }, regularAttendancePriceTierIds: { isEmpty: false } },
      select: { id: true, regularAttendancePriceTierIds: true, majorEventId: true },
    });
    const tierEligibility = new Map<string, boolean>();
    for (const attendance of undefinedAttendances) {
      const policy = restrictedEvents.find((event) => event.id === attendance.eventId);
      if (policy) {
        tierEligibility.set(
          attendanceAssessmentKey(attendance.personId, attendance.eventId),
          await this.isPriceTierEligible(tx, attendance.personId, { ...attendance.event, ...policy }),
        );
      }
    }

    return new Map(
      undefinedAttendances.map((attendance) => [
        attendanceAssessmentKey(attendance.personId, attendance.eventId),
        tierEligibility.get(attendanceAssessmentKey(attendance.personId, attendance.eventId)) === false
          ? AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE
          : this.resolveCurrentAssessment(
              attendance.event,
              majorSubscriptionStatusByKey.get(
                attendance.event.majorEventId
                  ? attendanceAssessmentKey(attendance.personId, attendance.event.majorEventId)
                  : '',
              ),
              eventSubscriptionKeys.has(attendanceAssessmentKey(attendance.personId, attendance.eventId)),
            ),
      ]),
    );
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
            id: true,
            regularAttendancePriceTierIds: true,
            allowSubscription: true,
            majorEventId: true,
            majorEvent: {
              select: {
                isPaymentRequired: true,
              },
            },
          },
        },
      },
    });

    if (!attendance) {
      return;
    }

    const currentAssessment = await this.assessAttendance(tx, attendance.personId, attendance.event);
    const category = currentAssessment === AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET
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
      },
    });

    for (const attendance of attendances) {
      await this.refreshForAttendance(personId, attendance.eventId, tx);
    }
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
      },
    });

    for (const attendance of attendances) {
      await this.refreshForAttendance(attendance.personId, attendance.eventId, tx);
    }
  }

  async refreshForEvent(eventId: string, tx: PrismaExecutor = this.prisma): Promise<void> {
    const attendances = await tx.eventAttendance.findMany({
      where: { eventId },
      select: { personId: true },
    });
    for (const attendance of attendances) {
      await this.refreshForAttendance(attendance.personId, eventId, tx);
    }
  }

  private async isPriceTierEligible(
    tx: PrismaExecutor,
    personId: string,
    event: AttendanceAssessmentSubject['event'],
  ): Promise<boolean> {
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
      majorEventId: string | null;
      majorEvent: { isPaymentRequired: boolean } | null;
    },
  ): Promise<AttendanceCurrentAssessment> {
    if (event.regularAttendancePriceTierIds?.length) {
      const eligible = await this.isPriceTierEligible(tx, personId, event);
      if (!eligible) return AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE;
    }

    if (event.majorEventId && event.majorEvent?.isPaymentRequired) {
      const majorEventSubscription = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId: event.majorEventId,
          personId,
          deletedAt: null,
        },
        select: {
          subscriptionStatus: true,
        },
      });

      if (majorEventSubscription?.subscriptionStatus !== 'CONFIRMED') {
        return this.resolveCurrentAssessment(event, majorEventSubscription?.subscriptionStatus, true);
      }
    }

    if (event.allowSubscription) {
      const eventSubscription = await tx.eventSubscription.findFirst({
        where: {
          eventId: event.id,
          personId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!eventSubscription) {
        return AttendanceCurrentAssessment.ACTIVITY_SUBSCRIPTION_MISSING;
      }
    }

    return AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET;
  }

  private resolveCurrentAssessment(
    event: AttendanceAssessmentSubject['event'],
    majorEventSubscriptionStatus: string | undefined,
    hasEventSubscription: boolean,
  ): AttendanceCurrentAssessment {
    if (event.majorEventId && event.majorEvent?.isPaymentRequired && majorEventSubscriptionStatus !== 'CONFIRMED') {
      if (majorEventSubscriptionStatus === 'WAITING_RECEIPT_UPLOAD') {
        return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT;
      }

      if (majorEventSubscriptionStatus === 'RECEIPT_UNDER_REVIEW') {
        return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_UNDER_REVIEW;
      }

      return AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_NOT_CONFIRMED;
    }

    if (event.allowSubscription && !hasEventSubscription) {
      return AttendanceCurrentAssessment.ACTIVITY_SUBSCRIPTION_MISSING;
    }

    return AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET;
  }
}
