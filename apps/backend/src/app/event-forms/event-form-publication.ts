import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { PublicationState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eventFormInclude, EventFormRecord } from './event-form-records';
import { EventFormNotificationService } from './event-form-notification.service';
import { toEventFormModel } from './event-form-model.mapper';

export async function publishDueScheduledEventForms(
  prisma: PrismaService,
  formNotifications: EventFormNotificationService,
): Promise<number> {
  const now = new Date();
  const dueForms = await prisma.eventForm.findMany({
    where: {
      deletedAt: null,
      publicationState: PublicationState.SCHEDULED,
      scheduledPublishAt: {
        lte: now,
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

  let publishedCount = 0;
  for (const form of dueForms) {
    const published = await publishEventFormNowIfClaimed(prisma, formNotifications, form.id, undefined, {
      scheduledDueAt: now,
    });
    if (published) {
      publishedCount += 1;
    }
  }

  return publishedCount;
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
  const published = await publishEventFormNowIfClaimed(prisma, formNotifications, formId, actorId);
  if (!published) {
    throw new NotFoundException('Formulário não encontrado.');
  }

  return toEventFormModel(published);
}

async function publishEventFormNowIfClaimed(
  prisma: PrismaService,
  formNotifications: EventFormNotificationService,
  formId: string,
  actorId: string | undefined,
  options: { scheduledDueAt?: Date } = {},
): Promise<EventFormRecord | null> {
  const publishedAt = new Date();
  const claimed = await prisma.eventForm.updateMany({
    where: {
      id: formId,
      deletedAt: null,
      ...(options.scheduledDueAt
        ? {
            publicationState: PublicationState.SCHEDULED,
            scheduledPublishAt: {
              lte: options.scheduledDueAt,
            },
          }
        : {}),
    },
    data: {
      publicationState: PublicationState.PUBLISHED,
      scheduledPublishAt: null,
      publishedAt,
      unpublishedAt: null,
      publicationUpdatedBy: actorId,
    },
  });
  if (claimed.count !== 1) {
    return null;
  }

  const published = await prisma.eventForm.findUniqueOrThrow({
    where: { id: formId },
    include: eventFormInclude,
  });
  await notifyEligiblePeople(formNotifications, published);
  return published;
}

function notifyEligiblePeople(
  formNotifications: EventFormNotificationService,
  form: EventFormRecord,
): Promise<number> {
  return formNotifications.notifyEligiblePeople(form);
}
