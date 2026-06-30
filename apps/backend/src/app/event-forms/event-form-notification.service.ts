import { Injectable } from '@nestjs/common';
import { EventFormAudience, EventFormTargetType, Prisma } from '@prisma/client';
import { isPast } from 'date-fns';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type EventFormNotificationPerson = Parameters<NovuNotificationsService['mapPersonToRecipient']>[0];

type EventFormNotificationLink = {
  id: string;
  targetType: EventFormTargetType;
  eventId: string | null;
  majorEventId: string | null;
  audience: EventFormAudience;
  notifyOnPublish: boolean;
  lastNotifiedAt: Date | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  event: { name: string; endDate: Date | null } | null;
  majorEvent: { name: string; endDate: Date | null } | null;
};

type EventFormNotificationRecord = {
  id: string;
  name: string;
  links: readonly EventFormNotificationLink[];
};

@Injectable()
export class EventFormNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
  ) {}

  async notifyEligiblePeople(form: EventFormNotificationRecord): Promise<number> {
    let notifiedLinks = 0;
    for (const link of form.links) {
      if (!link.notifyOnPublish || link.lastNotifiedAt) {
        continue;
      }

      if (!this.isLinkAvailable(link)) {
        continue;
      }

      const targetEndDate = link.event?.endDate ?? link.majorEvent?.endDate;
      if (!targetEndDate || isPast(targetEndDate)) {
        continue;
      }

      const recipients = await this.findNotificationRecipients(link);
      if (recipients.length === 0) {
        continue;
      }

      const claimedAt = new Date();
      const claimed = await this.prisma.eventFormLink.updateMany({
        where: {
          id: link.id,
          deletedAt: null,
          lastNotifiedAt: null,
        },
        data: {
          lastNotifiedAt: claimedAt,
        },
      });
      if (claimed.count !== 1) {
        continue;
      }

      const notified = await this.notifications.notifyEventFormAvailable({
        formId: form.id,
        linkId: link.id,
        formName: form.name,
        targetType: link.targetType,
        targetId: link.eventId ?? link.majorEventId ?? '',
        targetName: link.event?.name ?? link.majorEvent?.name ?? form.name,
        recipients,
      });
      if (!notified) {
        await this.prisma.eventFormLink.updateMany({
          where: {
            id: link.id,
            lastNotifiedAt: claimedAt,
          },
          data: {
            lastNotifiedAt: null,
          },
        });
        continue;
      }
      notifiedLinks += 1;
    }
    return notifiedLinks;
  }

  private async findNotificationRecipients(link: EventFormNotificationLink) {
    const people = new Map<string, EventFormNotificationPerson>();

    if (link.eventId) {
      if (link.audience !== EventFormAudience.ATTENDEES) {
        const subscriptions = await this.prisma.eventSubscription.findMany({
          where: {
            eventId: link.eventId,
            deletedAt: null,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const subscription of subscriptions) {
          people.set(subscription.person.id, subscription.person);
        }
      }
      if (link.audience !== EventFormAudience.SUBSCRIBERS) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: {
            eventId: link.eventId,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const attendance of attendances) {
          people.set(attendance.person.id, attendance.person);
        }
      }
    }

    if (link.majorEventId) {
      if (link.audience !== EventFormAudience.ATTENDEES) {
        const subscriptions = await this.prisma.majorEventSubscription.findMany({
          where: {
            majorEventId: link.majorEventId,
            deletedAt: null,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const subscription of subscriptions) {
          people.set(subscription.person.id, subscription.person);
        }
      }
      if (link.audience !== EventFormAudience.SUBSCRIBERS) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: {
            event: {
              majorEventId: link.majorEventId,
            },
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const attendance of attendances) {
          people.set(attendance.person.id, attendance.person);
        }
      }
    }

    return [...people.values()].map((person) => this.notifications.mapPersonToRecipient(person));
  }

  private notificationPersonSelect() {
    return {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    } satisfies Prisma.PeopleDefaultArgs;
  }

  private isLinkAvailable(link: Pick<EventFormNotificationLink, 'availableFrom' | 'availableUntil'>): boolean {
    const now = new Date();
    return (!link.availableFrom || link.availableFrom <= now) && (!link.availableUntil || link.availableUntil > now);
  }
}
