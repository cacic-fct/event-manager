import { ForbiddenException } from '@nestjs/common';
import {
  EventFormLink as EventFormLinkModel,
} from '@cacic-fct/shared-data-types';
import { matchesEventFormAudience } from '@cacic-fct/shared-event-participation';
import { SubscriptionStatus } from '@prisma/client';
import {
  ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES,
  isActiveMajorEventRegistration,
} from '../events/attendance-eligibility';
import { PrismaService } from '../prisma/prisma.service';
import { toLinkModel } from './event-form-model.mapper';
import { EventFormLinkRecord } from './event-form-records';

export async function canPersonAnswerLink(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'audiences' | 'eventId' | 'majorEventId'> & { priceTierIds?: readonly string[] },
  options: { allowFutureSubscriber?: boolean } = {},
): Promise<boolean> {
  const audiences = link.audiences;
  if (!options.allowFutureSubscriber && !(await canPersonAccessLinkPriceTier(prisma, personId, link))) {
    return false;
  }

  const [isSubscriber, isAttendee, isInterested] = await Promise.all([
    isPersonSubscriber(prisma, personId, link, options),
    isPersonAttendee(prisma, personId, link),
    audiences.includes('INTERESTED') ? isPersonInterested(prisma, personId, link) : Promise.resolve(false),
  ]);

  return matchesEventFormAudience(audiences, {
    interested: isInterested,
    subscribed: isSubscriber,
    attended: isAttendee,
  });
}

export async function canPersonAccessLinkPriceTier(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'majorEventId'> & { priceTierIds?: readonly string[] },
): Promise<boolean> {
  if (!link.priceTierIds?.length) {
    return true;
  }
  if (!link.majorEventId) {
    return false;
  }

  const [priceTiers, subscription] = await Promise.all([
    prisma.priceTier.findMany({
      where: { id: { in: [...link.priceTierIds] } },
      select: { name: true },
    }),
    prisma.majorEventSubscription.findFirst({
      where: {
        majorEventId: link.majorEventId,
        personId,
        deletedAt: null,
        subscriptionStatus: { notIn: inactiveMajorSubscriptionStatuses() },
      },
      select: { paymentTier: true },
    }),
  ]);
  const paymentTier = normalizePriceTierName(subscription?.paymentTier);
  return Boolean(paymentTier && priceTiers.some(({ name }) => normalizePriceTierName(name) === paymentTier));
}

function normalizePriceTierName(name: string | null | undefined): string | null {
  return name?.trim().toLocaleLowerCase('pt-BR') || null;
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
  if (await canPersonViewPublicResults(prisma, personId, toLinkModel(link))) {
    return;
  }

  throw new ForbiddenException('Você não pode visualizar os resultados deste formulário.');
}

export async function canPersonViewPublicResults(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId' | 'audiences'> & { priceTierIds?: readonly string[] },
): Promise<boolean> {
  const [isSubscriber, isAttendee, isLecturer, isInterested, hasPriceTierAccess] = await Promise.all([
    isPersonSubscriber(prisma, personId, link, {}),
    isPersonAttendee(prisma, personId, link),
    isPersonLecturerForLink(prisma, personId, link),
    isPersonInterested(prisma, personId, link),
    canPersonAccessLinkPriceTier(prisma, personId, link),
  ]);

  const interestedAudience = link.audiences?.includes('INTERESTED') === true;
  return isSubscriber || isAttendee || isLecturer || (interestedAudience && isInterested && hasPriceTierAccess);
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
    const [eventSubscription, event] = await Promise.all([
      prisma.eventSubscription.findFirst({
        where: { eventId: link.eventId, personId, deletedAt: null },
        select: { id: true },
      }),
      prisma.event.findUnique({ where: { id: link.eventId }, select: { majorEventId: true, autoSubscribe: true } }),
    ]);
    if (eventSubscription) {
      return true;
    }
    if (!event?.majorEventId) {
      return false;
    }
    const [selection, majorSubscription] = await Promise.all([
      prisma.majorEventSubscriptionEventSelection.findFirst({
        where: {
          eventId: link.eventId,
          deletedAt: null,
          subscription: {
            majorEventId: event.majorEventId,
            personId,
            deletedAt: null,
            subscriptionStatus: { notIn: inactiveMajorSubscriptionStatuses() },
          },
        },
        select: { id: true },
      }),
      event.autoSubscribe
        ? prisma.majorEventSubscription.findFirst({
            where: {
              majorEventId: event.majorEventId,
              personId,
              deletedAt: null,
              subscriptionStatus: { notIn: inactiveMajorSubscriptionStatuses() },
            },
            select: { subscriptionStatus: true },
          })
        : Promise.resolve(null),
    ]);
    return Boolean(selection || (majorSubscription && isActiveMajorEventRegistration(majorSubscription.subscriptionStatus)));
  }

  if (link.majorEventId) {
    return Boolean(
      await prisma.majorEventSubscription.findFirst({
        where: {
          majorEventId: link.majorEventId,
          personId,
          deletedAt: null,
          subscriptionStatus: { notIn: inactiveMajorSubscriptionStatuses() },
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
          status: 'PRESENT',
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
          status: 'PRESENT',
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

async function isPersonInterested(
  prisma: PrismaService,
  personId: string,
  link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
): Promise<boolean> {
  if (link.eventId) {
    const event = await prisma.event.findUnique({ where: { id: link.eventId }, select: { eventGroupId: true } });
    return Boolean(
      await prisma.eventInterest.findFirst({
        where: {
          personId,
          deletedAt: null,
          OR: [
            { eventId: link.eventId },
            ...(event?.eventGroupId ? [{ eventGroupId: event.eventGroupId }] : []),
          ],
        },
        select: { id: true },
      }),
    );
  }

  if (link.majorEventId) {
    return Boolean(
      await prisma.eventInterest.findFirst({
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

function inactiveMajorSubscriptionStatuses(): SubscriptionStatus[] {
  return Object.values(SubscriptionStatus).filter(
    (status) =>
      !ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES.includes(
        status as (typeof ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES)[number],
      ),
  );
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
