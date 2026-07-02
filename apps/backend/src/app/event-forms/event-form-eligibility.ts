import { ForbiddenException } from '@nestjs/common';
import { EventFormAudience as ContractAudience, EventFormLink as EventFormLinkModel } from '@cacic-fct/shared-data-types';
import { EventFormAudience } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toLinkModel } from './event-form-model.mapper';
import { EventFormLinkRecord } from './event-form-records';

export async function canPersonAnswerLink(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'audience' | 'eventId' | 'majorEventId'>,
  options: { allowFutureSubscriber?: boolean } = {},
): Promise<boolean> {
  const [isSubscriber, isAttendee] = await Promise.all([
    isPersonSubscriber(prisma, personId, link, options),
    isPersonAttendee(prisma, personId, link),
  ]);

  switch (link.audience) {
    case ContractAudience.SUBSCRIBERS:
    case EventFormAudience.SUBSCRIBERS:
      return isSubscriber;
    case ContractAudience.ATTENDEES:
    case EventFormAudience.ATTENDEES:
      return isAttendee;
    default:
      return isSubscriber || isAttendee;
  }
}

export async function assertPersonCanAnswerLink(
  prisma: PrismaService,
  personId: string,
  link: EventFormLinkRecord,
  options: { allowFutureSubscriber?: boolean } = {},
): Promise<void> {
  if (!(await canPersonAnswerLink(prisma, personId, toLinkModel(link), options))) {
    throw new ForbiddenException('Você não pode responder este formulário.');
  }
}

export async function assertPersonCanViewPublicResults(
  prisma: PrismaService,
  personId: string,
  link: EventFormLinkRecord,
): Promise<void> {
  const linkModel = toLinkModel(link);
  const [isSubscriber, isAttendee, isLecturer] = await Promise.all([
    isPersonSubscriber(prisma, personId, linkModel, {}),
    isPersonAttendee(prisma, personId, linkModel),
    isPersonLecturerForLink(prisma, personId, linkModel),
  ]);

  if (!isSubscriber && !isAttendee && !isLecturer) {
    throw new ForbiddenException('Você não pode visualizar os resultados deste formulário.');
  }
}

export async function assertPersonIsEventLecturer(
  prisma: PrismaService,
  personId: string,
  eventId: string,
): Promise<void> {
  const lecturer = await prisma.eventLecturer.findUnique({
    where: {
      eventId_personId: {
        eventId,
        personId,
      },
    },
    select: {
      eventId: true,
    },
  });
  if (!lecturer) {
    throw new ForbiddenException('Você não é ministrante deste evento.');
  }
}

async function isPersonSubscriber(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
  options: { allowFutureSubscriber?: boolean },
): Promise<boolean> {
  if (options.allowFutureSubscriber) {
    return true;
  }

  if (link.eventId) {
    return Boolean(
      await prisma.eventSubscription.findFirst({
        where: {
          eventId: link.eventId,
          personId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    );
  }

  if (link.majorEventId) {
    return Boolean(
      await prisma.majorEventSubscription.findFirst({
        where: {
          majorEventId: link.majorEventId,
          personId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    );
  }

  return false;
}

async function isPersonAttendee(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
): Promise<boolean> {
  if (link.eventId) {
    return Boolean(
      await prisma.eventAttendance.findFirst({
        where: {
          eventId: link.eventId,
          personId,
        },
        select: { eventId: true },
      }),
    );
  }

  if (link.majorEventId) {
    return Boolean(
      await prisma.eventAttendance.findFirst({
        where: {
          personId,
          event: {
            majorEventId: link.majorEventId,
          },
        },
        select: { eventId: true },
      }),
    );
  }

  return false;
}

async function isPersonLecturerForLink(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
): Promise<boolean> {
  if (link.eventId) {
    return Boolean(
      await prisma.eventLecturer.findUnique({
        where: {
          eventId_personId: {
            eventId: link.eventId,
            personId,
          },
        },
        select: { eventId: true },
      }),
    );
  }

  if (link.majorEventId) {
    return Boolean(
      await prisma.eventLecturer.findFirst({
        where: {
          personId,
          event: {
            majorEventId: link.majorEventId,
          },
        },
        select: { eventId: true },
      }),
    );
  }

  return false;
}
