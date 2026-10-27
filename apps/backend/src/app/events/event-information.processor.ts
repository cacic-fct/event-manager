import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { ANONYMOUS_AUDIENCE, audienceContext, eventAudienceWhere } from '../audiences/audience-context';
import { EventAudienceService } from '../audiences/event-audience.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import {
  EVENT_INFORMATION_QUEUE,
  eventSubscriberWhere,
  type EventInformationJob,
} from './event-subscriber-information';

@Processor(EVENT_INFORMATION_QUEUE)
export class EventInformationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
    private readonly audiences: EventAudienceService,
  ) {
    super();
  }

  async process(job: Job<EventInformationJob>): Promise<void> {
    const { eventId, revision } = job.data;
    const publishedAt = new Date(revision);
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, AND: [PUBLIC_EVENT_WHERE], subscriberInformationUpdatedAt: publishedAt },
        select: {
          name: true,
          majorEventId: true,
          eventGroupId: true,
          autoSubscribe: true,
          subscriberInformation: true,
        },
      });
      if (!event?.subscriberInformation) return;
      let cursor: string | undefined;
      do {
        const people = await this.prisma.people.findMany({
          where: {
            deletedAt: null,
            mergedIntoId: null,
            userId: { not: null },
            OR: [
              { eventSubscriptions: { some: { eventId, deletedAt: null, createdAt: { lte: publishedAt } } } },
              ...(event.majorEventId
                ? [
                    {
                      majorEventSubscriptions: {
                        some: {
                          majorEventId: event.majorEventId,
                          deletedAt: null,
                          createdAt: { lte: publishedAt },
                          ...(event.autoSubscribe
                            ? {}
                            : {
                                selectedEvents: {
                                  some: {
                                    eventId,
                                    deletedAt: null,
                                    createdAt: { lte: publishedAt },
                                  },
                                },
                              }),
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          select: { id: true, name: true, userId: true, email: true },
          orderBy: { id: 'asc' },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const person of people) {
          if (!person.userId) continue;
          const principal = await this.audiences.principalForStoredUser(person.userId);
          const visible = await this.prisma.event.findFirst({
            where: {
              id: eventId,
              AND: [PUBLIC_EVENT_WHERE, eventAudienceWhere(principal), eventSubscriberWhere(person.id, publishedAt)],
              subscriberInformationUpdatedAt: publishedAt,
              subscriberInformation: { not: null },
            },
            select: { id: true },
          });
          if (!visible) continue;
          const sent = await this.notifications.notifyEventSubscriberInformation({
            eventId,
            eventName: event.name,
            revision,
            targetType: event.majorEventId ? 'major-event' : event.eventGroupId ? 'event-group' : 'event',
            targetId: event.majorEventId ?? event.eventGroupId ?? eventId,
            recipient: this.notifications.mapPersonToRecipient(person),
          });
          if (!sent) throw new Error('Subscriber information notification was not acknowledged.');
        }
        cursor = people.length === 100 ? people[people.length - 1].id : undefined;
      } while (cursor);
    });
  }
}
