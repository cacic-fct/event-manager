import {
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { SportsAccessService } from './sports-access.service';

describe('SportsAccessService', () => {
  const actor = { id: 'person-1', name: 'Pessoa Um' };
  const currentUser = {
    requireCurrentPerson: jest.fn().mockResolvedValue(actor),
  };
  const frozen = {
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires an effective captain or coach assignment', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'registration-1',
      teamId: 'team-1',
      categoryId: 'category-1',
      category: openCategory(),
      members: [{ id: 'assignment-1', role: 'CAPTAIN' }],
    });
    const service = new SportsAccessService(
      {
        sportsRegistration: { findFirst },
      } as never,
      currentUser as never,
      frozen as never,
    );

    await service.requireLineupManager({} as never, 'registration-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'registration-1',
          status: {
            in: [
              SportsRegistrationStatus.APPROVED,
              SportsRegistrationStatus.ACTIVE,
            ],
          },
        }),
        select: expect.objectContaining({
          members: expect.objectContaining({
            where: expect.objectContaining({
              eligibility: SportsEligibilityStatus.ELIGIBLE,
              teamMember: expect.objectContaining({
                status: SportsTeamMemberStatus.APPROVED,
                participant: expect.objectContaining({
                  personId: actor.id,
                  status: SportsParticipantStatus.ACTIVE,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('allows an active representative to submit a roster without granting forfeit authority', async () => {
    const service = new SportsAccessService(
      {
        sportsRegistration: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'registration-1',
            teamId: 'team-1',
            categoryId: 'category-1',
            category: openCategory(),
            members: [],
            team: {
              representatives: [{ id: 'representative-1' }],
            },
          }),
        },
      } as never,
      currentUser as never,
      frozen as never,
    );

    const result = await service.requireRosterManager(
      {} as never,
      'registration-1',
    );

    expect(result.actor).toBe(actor);
    expect(result.assignment).toBeNull();
    expect(result.representative).toEqual({ id: 'representative-1' });
  });

  it('selects the most specific official assignment deterministically', async () => {
    const officialFindFirst = jest.fn().mockResolvedValue({
      id: 'official-1',
      role: 'REFEREE',
    });
    const service = new SportsAccessService(
      {
        sportsMatch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'match-1',
            categoryId: 'category-1',
            category: {
              tournamentId: 'tournament-1',
              ...openCategory(),
            },
          }),
        },
        sportsOfficialAssignment: { findFirst: officialFindFirst },
      } as never,
      currentUser as never,
      frozen as never,
    );

    await service.requireMatchOfficial({} as never, 'match-1');

    expect(officialFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { matchId: { sort: 'desc', nulls: 'last' } },
          { categoryId: { sort: 'desc', nulls: 'last' } },
        ],
      }),
    );
  });
});

function openCategory() {
  return {
    status: 'ACTIVE',
    finishedAt: null,
    tournament: {
      status: 'LIVE',
      finishedAt: null,
      deletedAt: null,
      majorEventId: 'major-event-1',
    },
  };
}
