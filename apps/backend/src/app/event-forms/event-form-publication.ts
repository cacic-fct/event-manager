import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { PublicationState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eventFormInclude, EventFormRecord } from './event-form-records';
import { EventFormNotificationService } from './event-form-notification.service';
import { toEventFormModel } from './event-form-model.mapper';

export async function publishDueScheduledEventForms(
  prisma: PrismaService,
  formNotifications: EventFormNotificationService,
): Promise<number> {
  const dueForms = await prisma.eventForm.findMany({
    where: {
      deletedAt: null,
      publicationState: PublicationState.SCHEDULED,
      scheduledPublishAt: {
        lte: new Date(),
      },
    },
    select: {
      id: true,
    },
    take: 100,
    orderBy: {
      scheduledPublishAt: 'asc',
    },
  });

  for (const form of dueForms) {
    await publishEventFormNow(prisma, formNotifications, form.id, undefined);
  }

  return dueForms.length;
}

export async function notifyDueAvailableEventFormLinks(
  prisma: PrismaService,
  formNotifications: EventFormNotificationService,
): Promise<number> {
  const now = new Date();
  const forms = await prisma.eventForm.findMany({
    where: {
      deletedAt: null,
      publicationState: PublicationState.PUBLISHED,
      links: {
        some: {
          deletedAt: null,
          notifyOnPublish: true,
          lastNotifiedAt: null,
          AND: [
            { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
            { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
          ],
          OR: [
            { event: { endDate: { gte: now } } },
            { majorEvent: { endDate: { gte: now } } },
          ],
        },
      },
    },
    include: eventFormInclude,
    take: 100,
    orderBy: [{ publishedAt: 'asc' }, { updatedAt: 'asc' }],
  });

  let notifiedLinks = 0;
  for (const form of forms) {
    notifiedLinks += await notifyEligiblePeople(formNotifications, form);
  }

  return notifiedLinks;
}

export async function publishEventFormNow(
  prisma: PrismaService,
  formNotifications: EventFormNotificationService,
  formId: string,
  actorId: string | undefined,
): Promise<EventFormModel> {
  const published = await prisma.eventForm.update({
    where: { id: formId },
    data: {
      publicationState: PublicationState.PUBLISHED,
      scheduledPublishAt: null,
      publishedAt: new Date(),
      unpublishedAt: null,
      publicationUpdatedBy: actorId,
    },
    include: eventFormInclude,
  });

  await notifyEligiblePeople(formNotifications, published);
  return toEventFormModel(published);
}

function notifyEligiblePeople(
  formNotifications: EventFormNotificationService,
  form: EventFormRecord,
): Promise<number> {
  return formNotifications.notifyEligiblePeople(form);
}
