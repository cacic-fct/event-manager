import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAJOR_EVENT_BASE_SELECT,
  MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT,
} from './selects';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PUBLIC_EVENT_SELECT,
  PUBLIC_MAJOR_EVENT_SELECT,
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
  mapPublicMajorEvent,
} from '../public-events/models';

@Injectable()
export class CurrentUserPublicEventService {
  private paymentInfoTableExistsPromise?: Promise<boolean>;

  constructor(private readonly prisma: PrismaService) {}

  async requirePublicEvent(eventId: string): Promise<PublicEvent> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: PUBLIC_EVENT_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    return event;
  }

  async requirePublicEventGroup(
    eventGroupId: string,
  ): Promise<PublicEventGroup> {
    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id: eventGroupId,
        deletedAt: null,
      },
      select: PUBLIC_EVENT_GROUP_SELECT,
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${eventGroupId} was not found.`);
    }

    return eventGroup;
  }

  async requirePublicMajorEvent(
    majorEventId: string,
  ): Promise<PublicMajorEvent> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
      },
      select: PUBLIC_MAJOR_EVENT_SELECT,
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    return mapPublicMajorEvent(majorEvent);
  }

  getMajorEventSelect(
    paymentInfoTableExists: boolean,
  ): Prisma.MajorEventSelect {
    if (paymentInfoTableExists) {
      return MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT;
    }

    return MAJOR_EVENT_BASE_SELECT;
  }

  getMajorEventSubscriptionSelect(paymentInfoTableExists: boolean) {
    return {
      id: true,
      majorEventId: true,
      personId: true,
      subscriptionStatus: true,
      amountPaid: true,
      paymentDate: true,
      paymentTier: true,
      majorEvent: {
        select: this.getMajorEventSelect(paymentInfoTableExists),
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }

  async hasPaymentInfoTable(): Promise<boolean> {
    if (!this.paymentInfoTableExistsPromise) {
      this.paymentInfoTableExistsPromise = this.prisma.$queryRaw<
        Array<{ exists: boolean }>
      >`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'payment_info'
          ) AS "exists"
        `.then((result) => Boolean(result[0]?.exists));
    }

    return this.paymentInfoTableExistsPromise;
  }
}
