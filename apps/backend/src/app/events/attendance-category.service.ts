import { Injectable } from '@nestjs/common';
import { AttendanceCategory, Prisma, PrismaClient } from '@prisma/client';
import { AttendanceCurrentAssessment } from '@cacic-fct/shared-data-types';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;

type AttendanceAssessmentSubject = {
  personId: string;
  eventId: string;
  category: AttendanceCategory;
  event: {
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

    return new Map(
      undefinedAttendances.map((attendance) => [
        attendanceAssessmentKey(attendance.personId, attendance.eventId),
        this.resolveCurrentAssessment(
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

    const category = await this.resolveCategory(tx, attendance.personId, attendance.event);

    await tx.eventAttendance.update({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      data: {
        category,
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

  private async resolveCategory(
    tx: PrismaExecutor,
    personId: string,
    event: {
      id: string;
      allowSubscription: boolean;
      majorEventId: string | null;
      majorEvent: { isPaymentRequired: boolean } | null;
    },
  ): Promise<AttendanceCategory> {
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
        return AttendanceCategory.NON_PAYING;
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
        return AttendanceCategory.NON_SUBSCRIBED;
      }
    }

    return AttendanceCategory.REGULAR;
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
