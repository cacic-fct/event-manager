import { Injectable } from '@nestjs/common';
import { AttendanceCategory, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;

@Injectable()
export class AttendanceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

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
}
