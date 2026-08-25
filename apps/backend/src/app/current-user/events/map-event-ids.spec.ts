import {
  EventManagerPermissionScope,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { publicMapEventWhere } from '../../public-events/models';
import { activeScopedManagerGrantWhere, currentUserMapEventWhere } from './map-event-ids';

describe('currentUserMapEventWhere', () => {
  it('combines the public map boundary with every supported current-person association', () => {
    const now = new Date('2026-08-16T15:00:00.000Z');

    expect(currentUserMapEventWhere('person-1', 'user-1', now)).toEqual({
      AND: [
        publicMapEventWhere(now),
        {
          OR: [
            {
              subscriptions: {
                some: { personId: 'person-1', deletedAt: null },
              },
            },
            {
              majorEventSelections: {
                some: {
                  deletedAt: null,
                  subscription: {
                    personId: 'person-1',
                    deletedAt: null,
                    subscriptionStatus: { not: SubscriptionStatus.CANCELED },
                  },
                },
              },
            },
            {
              lecturers: {
                some: { personId: 'person-1' },
              },
            },
            {
              attendanceCollectors: {
                some: { personId: 'person-1' },
              },
            },
            {
              eventManagerRoleAssignmentScopes: {
                some: activeScopedManagerGrantWhere('user-1', EventManagerPermissionScope.EVENT, now),
              },
            },
            {
              eventGroup: {
                eventManagerRoleAssignmentScopes: {
                  some: activeScopedManagerGrantWhere('user-1', EventManagerPermissionScope.EVENT_GROUP, now),
                },
              },
            },
            {
              majorEvent: {
                eventManagerRoleAssignmentScopes: {
                  some: activeScopedManagerGrantWhere('user-1', EventManagerPermissionScope.MAJOR_EVENT, now),
                },
              },
            },
            {
              sportsMatch: {
                is: {
                  deletedAt: null,
                  category: {
                    deletedAt: null,
                    tournament: { deletedAt: null },
                  },
                  OR: [
                    { homeRegistration: { is: sportsRegistrationWhere('person-1') } },
                    { awayRegistration: { is: sportsRegistrationWhere('person-1') } },
                    {
                      officialAssignments: {
                        some: activeOfficialWhere('person-1'),
                      },
                    },
                    {
                      category: {
                        officialAssignments: {
                          some: { ...activeOfficialWhere('person-1'), matchId: null },
                        },
                      },
                    },
                    {
                      category: {
                        tournament: {
                          officials: {
                            some: {
                              ...activeOfficialWhere('person-1'),
                              categoryId: null,
                              matchId: null,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
  });

  it.each([
    EventManagerPermissionScope.EVENT,
    EventManagerPermissionScope.EVENT_GROUP,
    EventManagerPermissionScope.MAJOR_EVENT,
  ])('requires active, non-deleted %s grants and excludes global scope', (scope) => {
    const now = new Date('2026-08-16T15:00:00.000Z');

    expect(activeScopedManagerGrantWhere('user-1', scope, now)).toEqual(
      expect.objectContaining({
        scope,
        archivedAt: null,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: expect.arrayContaining([
          expect.objectContaining({
            assignment: expect.objectContaining({
              archivedAt: null,
              role: { archivedAt: null },
              OR: expect.arrayContaining([{ person: { userId: 'user-1', deletedAt: null } }]),
            }),
          }),
        ]),
      }),
    );
    expect(activeScopedManagerGrantWhere('user-1', scope, now)).not.toEqual(
      expect.objectContaining({ scope: EventManagerPermissionScope.GLOBAL }),
    );
  });
});

function sportsRegistrationWhere(personId: string) {
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
            some: { personId, active: true, revokedAt: null },
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

function activeOfficialWhere(personId: string) {
  return {
    personId,
    active: true,
    revokedAt: null,
  };
}
