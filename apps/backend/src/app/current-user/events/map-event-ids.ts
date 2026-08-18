import {
  EventManagerPermissionScope,
  Prisma,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { publicMapEventWhere } from '../../public-events/models';

export function currentUserMapEventWhere(
  personId: string,
  userId: string | undefined,
  now: Date,
): Prisma.EventWhereInput {
  return {
    AND: [publicMapEventWhere(now), currentUserAssociatedEventWhere(personId, userId, now)],
  };
}

export function currentUserAssociatedEventWhere(
  personId: string,
  userId: string | undefined,
  now: Date,
): Prisma.EventWhereInput {
  return {
    OR: [
      {
        subscriptions: {
          some: {
            personId,
            deletedAt: null,
          },
        },
      },
      {
        majorEventSelections: {
          some: {
            deletedAt: null,
            subscription: {
              personId,
              deletedAt: null,
              subscriptionStatus: {
                not: SubscriptionStatus.CANCELED,
              },
            },
          },
        },
      },
      {
        lecturers: {
          some: {
            personId,
          },
        },
      },
      {
        attendanceCollectors: {
          some: {
            personId,
          },
        },
      },
      ...currentUserManagerEventWhere(userId, now),
      {
        sportsMatch: {
          is: currentUserSportsMatchWhere(personId),
        },
      },
    ],
  };
}

function currentUserManagerEventWhere(userId: string | undefined, now: Date): Prisma.EventWhereInput[] {
  if (!userId) {
    return [];
  }

  return [
    {
      eventManagerRoleAssignmentScopes: {
        some: activeScopedManagerGrantWhere(userId, EventManagerPermissionScope.EVENT, now),
      },
    },
    {
      eventGroup: {
        eventManagerRoleAssignmentScopes: {
          some: activeScopedManagerGrantWhere(userId, EventManagerPermissionScope.EVENT_GROUP, now),
        },
      },
    },
    {
      majorEvent: {
        eventManagerRoleAssignmentScopes: {
          some: activeScopedManagerGrantWhere(userId, EventManagerPermissionScope.MAJOR_EVENT, now),
        },
      },
    },
  ];
}

export function activeScopedManagerGrantWhere(
  userId: string,
  scope: Exclude<EventManagerPermissionScope, 'GLOBAL'>,
  now: Date,
): Prisma.EventManagerRoleAssignmentScopeWhereInput {
  return {
    scope,
    archivedAt: null,
    OR: [{ validFrom: null }, { validFrom: { lte: now } }],
    AND: [
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      {
        assignment: {
          archivedAt: null,
          role: { archivedAt: null },
          OR: [
            { person: { userId, deletedAt: null } },
            {
              group: {
                archivedAt: null,
                members: {
                  some: {
                    archivedAt: null,
                    person: { userId, deletedAt: null },
                    OR: [{ validFrom: null }, { validFrom: { lte: now } }],
                    AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
                  },
                },
              },
            },
          ],
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          ],
        },
      },
    ],
  };
}

function currentUserSportsMatchWhere(personId: string): Prisma.SportsMatchWhereInput {
  return {
    deletedAt: null,
    category: {
      deletedAt: null,
      tournament: {
        deletedAt: null,
      },
    },
    OR: [
      {
        homeRegistration: {
          is: currentUserSportsRegistrationWhere(personId),
        },
      },
      {
        awayRegistration: {
          is: currentUserSportsRegistrationWhere(personId),
        },
      },
      {
        officialAssignments: {
          some: activeOfficialAssignmentWhere(personId),
        },
      },
      {
        category: {
          officialAssignments: {
            some: {
              ...activeOfficialAssignmentWhere(personId),
              matchId: null,
            },
          },
        },
      },
      {
        category: {
          tournament: {
            officials: {
              some: {
                ...activeOfficialAssignmentWhere(personId),
                categoryId: null,
                matchId: null,
              },
            },
          },
        },
      },
    ],
  };
}

function currentUserSportsRegistrationWhere(personId: string): Prisma.SportsRegistrationWhereInput {
  return {
    deletedAt: null,
    status: {
      in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
    },
    team: {
      deletedAt: null,
      status: SportsTeamStatus.ACTIVE,
    },
    OR: [
      {
        team: {
          representatives: {
            some: {
              personId,
              active: true,
              revokedAt: null,
            },
          },
        },
      },
      {
        members: {
          some: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            teamMember: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              participant: {
                personId,
                deletedAt: null,
                status: SportsParticipantStatus.ACTIVE,
              },
            },
          },
        },
      },
    ],
  };
}

function activeOfficialAssignmentWhere(personId: string): Prisma.SportsOfficialAssignmentWhereInput {
  return {
    personId,
    active: true,
    revokedAt: null,
  };
}
