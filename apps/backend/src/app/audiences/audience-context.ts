import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';

export type EventAudiencePrincipal = {
  userId?: string;
  personIds: string[];
  isUnesp: boolean;
  verifiedCourseCode: string | null;
  bypass: boolean;
  // Set only for personal history/detail reads, never catalog queries or mutations.
  pastParticipationBefore?: Date;
};

export const ANONYMOUS_AUDIENCE: EventAudiencePrincipal = {
  personIds: [], isUnesp: false, verifiedCourseCode: null, bypass: false,
};

// Request-local; background workers must explicitly select a recipient when sending private content.
export const audienceContext = new AsyncLocalStorage<EventAudiencePrincipal>();

function ownAudienceWhere(principal: EventAudiencePrincipal): Prisma.EventWhereInput {
  if (principal.bypass) return {};
  return {
    OR: [
      { audience: 'PUBLIC' },
      ...(principal.isUnesp ? [{ audience: 'UNESP_ONLY' as const }] : []),
      ...(principal.verifiedCourseCode === '12' ? [{
        audience: 'COURSE_ONLY' as const,
        audienceCourseCodes: { has: principal.verifiedCourseCode },
      }] : []),
      {
        audience: 'INVITATION_ONLY',
        audienceInvitations: { some: { personId: { in: principal.personIds } } },
      },
    ],
  };
}

export function majorEventAudienceWhere(principal = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE): Prisma.MajorEventWhereInput {
  const current = ownAudienceWhere(principal) as Prisma.MajorEventWhereInput;
  if (!principal.pastParticipationBefore || principal.bypass) return current;
  return { OR: [current, {
    OR: [
      { events: { some: pastEventParticipationWhere(principal) } },
      { eventGroups: { some: pastGroupParticipationWhere(principal) } },
      {
        endDate: { lte: principal.pastParticipationBefore },
        OR: [
          { subscriptions: { some: { personId: { in: principal.personIds }, deletedAt: null } } },
          { certificateConfigs: { some: { certificates: { some: { personId: { in: principal.personIds }, deletedAt: null } } } } },
          { sportsTournament: { is: { participants: { some: { personId: { in: principal.personIds }, deletedAt: null } } } } },
          { sportsTournament: { is: { officials: { some: { personId: { in: principal.personIds }, active: true } } } } },
          { sportsTournament: { is: { teams: { some: { deletedAt: null, representatives: { some: { personId: { in: principal.personIds }, active: true } } } } } } },
        ],
      },
    ],
  }] };
}

export function groupAudienceWhere(principal = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE): Prisma.EventGroupWhereInput {
  if (principal.bypass) return {};
  const currentPrincipal = { ...principal, pastParticipationBefore: undefined };
  const current: Prisma.EventGroupWhereInput = {
    AND: [
      { OR: [{ majorEventId: null }, { majorEvent: { is: majorEventAudienceWhere(currentPrincipal) } }] },
      ownAudienceWhere(principal) as Prisma.EventGroupWhereInput,
    ],
  };
  return principal.pastParticipationBefore ? { OR: [current, pastGroupParticipationWhere(principal)] } : current;
}

export function eventAudienceWhere(principal = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE): Prisma.EventWhereInput {
  if (principal.bypass) return {};
  const currentPrincipal = { ...principal, pastParticipationBefore: undefined };
  const current: Prisma.EventWhereInput = {
    AND: [
      ownAudienceWhere(principal),
      { OR: [{ majorEventId: null }, { majorEvent: { is: majorEventAudienceWhere(currentPrincipal) } }] },
      { OR: [{ eventGroupId: null }, { eventGroup: { is: groupAudienceWhere(currentPrincipal) } }] },
    ],
  };
  return principal.pastParticipationBefore ? { OR: [current, pastEventParticipationWhere(principal)] } : current;
}

export function pastEventParticipationWhere(principal: EventAudiencePrincipal): Prisma.EventWhereInput {
  const personId = { in: principal.personIds };
  return {
    endDate: { lte: principal.pastParticipationBefore ?? new Date() },
    OR: [
      { attendances: { some: { personId, status: 'PRESENT' } } },
      { subscriptions: { some: { personId, deletedAt: null } } },
      { lecturers: { some: { personId } } },
      { certificateConfigs: { some: { certificates: { some: { personId, deletedAt: null } } } } },
    ],
  };
}

function pastGroupParticipationWhere(principal: EventAudiencePrincipal): Prisma.EventGroupWhereInput {
  const personId = { in: principal.personIds };
  return { OR: [
    { events: { some: pastEventParticipationWhere(principal) } },
    {
      events: { some: { endDate: { lte: principal.pastParticipationBefore } } },
      OR: [
        { subscriptions: { some: { personId, deletedAt: null } } },
        { certificateConfigs: { some: { certificates: { some: { personId, deletedAt: null } } } } },
      ],
    },
  ] };
}
