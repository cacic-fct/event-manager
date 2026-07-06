import { EventFormTargetType as ContractTargetType } from '@cacic-fct/shared-data-types';
import { EventFormTargetType, Prisma } from '@prisma/client';

export const eventFormInclude = {
  ownerEvent: {
    select: {
      id: true,
      name: true,
      emoji: true,
      majorEventId: true,
      eventGroupId: true,
    },
  },
  ownerMajorEvent: {
    select: {
      id: true,
      name: true,
      emoji: true,
    },
  },
  links: {
    where: {
      deletedAt: null,
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          emoji: true,
          majorEventId: true,
          eventGroupId: true,
          endDate: true,
        },
      },
      majorEvent: {
        select: {
          id: true,
          name: true,
          emoji: true,
          endDate: true,
        },
      },
      _count: {
        select: {
          responses: true,
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
  _count: {
    select: {
      responses: true,
    },
  },
} satisfies Prisma.EventFormInclude;

export const responseInclude = {
  person: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.EventFormResponseInclude;

export type EventFormRecord = Prisma.EventFormGetPayload<{ include: typeof eventFormInclude }>;
export type EventFormResponseRecord = Prisma.EventFormResponseGetPayload<{ include: typeof responseInclude }>;
export type EventFormLinkRecord = EventFormRecord['links'][number];

export type TargetInput = {
  targetType: EventFormTargetType | ContractTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
};

export type NormalizedTarget = {
  targetType: EventFormTargetType;
  eventId: string | null;
  majorEventId: string | null;
};

export type ResultViewer = 'admin' | 'lecturer' | 'public' | 'self';

export type SubscriptionFlowTargetScope = {
  majorEventId: string | null;
  selectedEventIds: Set<string>;
};
