import { type Prisma } from '@prisma/client';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from './attendance-eligibility';

export const EVENT_INFORMATION_QUEUE = 'event-subscriber-information';
export interface EventInformationJob {
  eventId: string;
  revision: string;
}

/** Direct/group registrations and selected/automatic major-event registrations share this access rule. */
export function eventSubscriberWhere(personId: string, before?: Date): Prisma.EventWhereInput {
  const subscription = { personId, deletedAt: null, ...(before ? { createdAt: { lte: before } } : {}) };
  const majorSubscription = {
    ...subscription,
    subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
  };
  return {
    OR: [
      { subscriptions: { some: subscription } },
      { autoSubscribe: true, majorEvent: { subscriptions: { some: majorSubscription } } },
      {
        majorEventSelections: {
          some: {
            deletedAt: null,
            ...(before ? { createdAt: { lte: before } } : {}),
            subscription: majorSubscription,
          },
        },
      },
    ],
  };
}
