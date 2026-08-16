import {
  EventManagerPermissionGrantScope,
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
              eventManagerPermissionGrants: {
                some: activeScopedManagerGrantWhere('user-1', EventManagerPermissionGrantScope.EVENT, now),
              },
            },
            {
              eventGroup: {
                eventManagerPermissionGrants: {
                  some: activeScopedManagerGrantWhere(
                    'user-1',
                    EventManagerPermissionGrantScope.EVENT_GROUP,
                    now,
                  ),
                },
              },
            },
            {
              majorEvent: {
                eventManagerPermissionGrants: {
                  some: activeScopedManagerGrantWhere(
                    'user-1',
                    EventManagerPermissionGrantScope.MAJOR_EVENT,
                    now,
                  ),
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
    EventManagerPermissionGrantScope.EVENT,
    EventManagerPermissionGrantScope.EVENT_GROUP,
    EventManagerPermissionGrantScope.MAJOR_EVENT,
  ])('requires active, non-deleted %s grants and excludes global scope', (scope) => {
    const now = new Date('2026-08-16T15:00:00.000Z');

    expect(activeScopedManagerGrantWhere('user-1', scope, now)).toEqual({
      userId: 'user-1',
      scope,
      deletedAt: null,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
    });
    expect(activeScopedManagerGrantWhere('user-1', scope, now)).not.toEqual(
      expect.objectContaining({ scope: EventManagerPermissionGrantScope.GLOBAL }),
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
      OR: [
        {
          representatives: {
            some: { personId, active: true, revokedAt: null },
          },
        },
        {
          members: {
            some: {
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
      ],
    },
  };
}

function activeOfficialWhere(personId: string) {
  return {
    personId,
    active: true,
    revokedAt: null,
  };
}
