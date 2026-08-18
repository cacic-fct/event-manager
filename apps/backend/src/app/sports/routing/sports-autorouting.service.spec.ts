import { SportsAutoroutingService } from './sports-autorouting.service';
import { SportsMatchState } from '@prisma/client';
import { sportsTestDate } from '../testing/sports-backend.fixtures';

describe('SportsAutoroutingService', () => {
  it('only routes active approved players to a match wallet', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SportsAutoroutingService({
      sportsMatch: { findFirst, findMany: jest.fn().mockResolvedValue([]) },
      sportsTeamRepresentative: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.resolveCurrentUserRoute('person-1')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rosters: {
            some: expect.objectContaining({
              status: 'APPROVED',
              entries: {
                some: expect.objectContaining({
                  status: 'APPROVED',
                  registrationMember: expect.objectContaining({
                    eligibility: 'ELIGIBLE',
                    teamMember: expect.objectContaining({
                      status: 'APPROVED',
                      participant: expect.objectContaining({
                        personId: 'person-1',
                        status: 'ACTIVE',
                      }),
                    }),
                  }),
                }),
              },
            }),
          },
        }),
      }),
    );
  });

  it('does not route representatives to closed tournaments', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SportsAutoroutingService({
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsTeamRepresentative: { findFirst },
    } as never);

    await expect(service.resolveCurrentUserRoute('person-1')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: {
            deletedAt: null,
            tournament: {
              deletedAt: null,
              finishedAt: null,
              status: { notIn: ['FINISHED', 'CANCELED'] },
            },
          },
        }),
      }),
    );
  });

  it.each([
    [SportsMatchState.SCHEDULED, 'CHECK_IN'],
    [SportsMatchState.CHECK_IN, 'CHECK_IN'],
    [SportsMatchState.LIVE, 'OPERATE'],
    [SportsMatchState.PAUSED, 'OPERATE'],
    [SportsMatchState.AWAITING_REVIEW, 'FINALIZE'],
    [SportsMatchState.FINISHED, 'MATCH_DETAIL'],
  ] as const)('routes an official in %s state to %s', async (state, mode) => {
    const prisma = autoroutingPrisma();
    prisma.sportsMatch.findMany.mockResolvedValue([
      { id: 'match-1', state, event: { startDate: sportsTestDate(1), endDate: sportsTestDate(1) } },
    ]);
    const service = new SportsAutoroutingService(prisma as never);

    await expect(service.resolveOfficialRoute('person-1', sportsTestDate())).resolves.toEqual({
      matchId: 'match-1',
      mode,
    });
  });

  it('prioritizes live state and then the closest start time', async () => {
    const prisma = autoroutingPrisma();
    prisma.sportsMatch.findMany.mockResolvedValue([
      {
        id: 'scheduled',
        state: SportsMatchState.SCHEDULED,
        event: { startDate: sportsTestDate(), endDate: sportsTestDate(3_600_000) },
      },
      {
        id: 'live-later',
        state: SportsMatchState.LIVE,
        event: { startDate: sportsTestDate(7_200_000), endDate: sportsTestDate(10_800_000) },
      },
      {
        id: 'live-closest',
        state: SportsMatchState.LIVE,
        event: { startDate: sportsTestDate(3_600_000), endDate: sportsTestDate(7_200_000) },
      },
    ]);
    const service = new SportsAutoroutingService(prisma as never);

    await expect(service.resolveOfficialRoute('person-1', sportsTestDate())).resolves.toEqual({
      matchId: 'live-closest',
      mode: 'OPERATE',
    });
  });

  it('orders check-in, scheduled, review, and completed states by operational urgency', async () => {
    const prisma = autoroutingPrisma();
    const event = { startDate: sportsTestDate(3_600_000), endDate: sportsTestDate(7_200_000) };
    prisma.sportsMatch.findMany.mockResolvedValue([
      { id: 'finished', state: SportsMatchState.FINISHED, event },
      { id: 'review', state: SportsMatchState.AWAITING_REVIEW, event },
      { id: 'scheduled', state: SportsMatchState.SCHEDULED, event },
      { id: 'check-in', state: SportsMatchState.CHECK_IN, event },
    ]);
    const service = new SportsAutoroutingService(prisma as never);

    await expect(service.resolveOfficialRoute('person-1', sportsTestDate())).resolves.toEqual({
      matchId: 'check-in',
      mode: 'CHECK_IN',
    });
  });

  it('returns the player wallet before the representative team route', async () => {
    const prisma = autoroutingPrisma();
    prisma.sportsMatch.findFirst.mockResolvedValue({ id: 'match-1' });
    prisma.sportsTeamRepresentative.findFirst.mockResolvedValue({ teamId: 'team-1' });
    const service = new SportsAutoroutingService(prisma as never);

    await expect(service.resolveCurrentUserRoute('person-1', sportsTestDate())).resolves.toEqual({
      matchId: 'match-1',
      mode: 'WALLET',
    });
    expect(prisma.sportsTeamRepresentative.findFirst).not.toHaveBeenCalled();
  });

  it('deduplicates everyone affected by a match and handles a missing match', async () => {
    const prisma = autoroutingPrisma();
    const service = new SportsAutoroutingService(prisma as never);
    prisma.sportsMatch.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      rosters: [{ entries: [{ registrationMember: { teamMember: { participant: { personId: 'player-1' } } } }] }],
      officialAssignments: [{ personId: 'official-1' }],
      category: {
        officialAssignments: [{ personId: 'official-1' }],
        tournament: { officials: [{ personId: 'tournament-official' }] },
      },
    });

    await expect(service.affectedPeopleForMatch('missing')).resolves.toEqual([]);
    await expect(service.affectedPeopleForMatch('match-1')).resolves.toEqual([
      'player-1',
      'official-1',
      'tournament-official',
    ]);
  });
});

function autoroutingPrisma() {
  return {
    sportsMatch: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
    },
    sportsTeamRepresentative: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}
