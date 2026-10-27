import { eventInformationPath } from '@cacic-fct/shared-utils';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { Job } from 'bullmq';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventAudienceService } from '../audiences/event-audience.service';
import { eventAudienceWhere } from '../audiences/audience-context';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import { eventSubscriberWhere } from './event-subscriber-information';
import { EVENT_MANUAL_NOTIFICATION_QUEUE, type EventManualNotificationJob } from './event-manual-notification';

@Processor(EVENT_MANUAL_NOTIFICATION_QUEUE)
export class EventManualNotificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
    private readonly audit: AuditLogService,
    private readonly audiences: EventAudienceService,
  ) {
    super();
  }

  async process(job: Job<EventManualNotificationJob>): Promise<void> {
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const { audience, eventId, requestId, message, personIds, actor } = job.data;
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { name: true, majorEventId: true, eventGroupId: true },
      });
      const record = (status: string, personId?: string) =>
        this.audit.record({
          entityType: AuditLogEntityType.EVENT,
          entityId: eventId,
          entityLabel: event?.name,
          operation: AuditLogOperation.SUBMIT,
          actor,
          force: true,
          squashWindowMs: 0,
          summary:
            status === 'ACKNOWLEDGED'
              ? 'Novu aceitou o aviso manual.'
              : status === 'FAILED'
                ? 'Falha no envio de aviso manual.'
                : 'Aviso manual não enviado: vínculo ou evento indisponível.',
          scope: { eventId },
          metadata: {
            category: 'manual-event-notification',
            audience,
            requestId,
            message,
            personId,
            status,
            attempt: job.attemptsMade + 1,
          },
        });
      if (!event) {
        await record('SKIPPED');
        return;
      }
      let failed = false;
      for (const personId of personIds) {
        // Recheck current membership before sending, including retries.
        const person = await this.prisma.people.findFirst({
          where: {
            id: personId,
            deletedAt: null,
            mergedIntoId: null,
            userId: { not: null },
            ...(audience === 'LECTURERS' ? { lectures: { some: { eventId } } } : {}),
          },
          select: { id: true, name: true, userId: true, email: true },
        });
        if (!person?.userId) {
          await record('SKIPPED', personId);
          continue;
        }
        if (audience === 'SUBSCRIBERS') {
          const principal = await this.audiences.principalForStoredUser(person.userId);
          const eligible = await this.prisma.event.findFirst({
            where: {
              id: eventId,
              AND: [PUBLIC_EVENT_WHERE, eventAudienceWhere(principal), eventSubscriberWhere(personId)],
            },
            select: { id: true },
          });
          if (!eligible) {
            await record('SKIPPED', personId);
            continue;
          }
        }
        const targetType = event.majorEventId ? 'major-event' : event.eventGroupId ? 'event-group' : 'event';
        const targetId = event.majorEventId ?? event.eventGroupId ?? eventId;
        const accepted = await this.notifications.notifyEventParticipant({
          audience,
          eventId,
          eventName: event.name,
          message,
          requestId,
          actionUrl:
            audience === 'LECTURERS'
              ? `/profile/attendances/${targetType}/${encodeURIComponent(targetId)}/organizer`
              : eventInformationPath(targetType, targetId),
          recipient: this.notifications.mapPersonToRecipient(person),
        });
        await record(accepted ? 'ACKNOWLEDGED' : 'FAILED', personId);
        failed ||= !accepted;
      }
      if (failed) throw new Error('Novu did not acknowledge every manual event notification.');
    });
  }
}
