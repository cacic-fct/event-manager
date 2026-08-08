import { ForbiddenException } from '@nestjs/common';
import { SportsReadAdminService } from './sports-read-admin.service';
import { SportsReadService } from './sports-read.service';

describe('SportsReadService admin tournament list', () => {
  const authorizationPolicy = {
    accessibleEventTargets: jest.fn(),
  };
  const prisma = {
    sportsTournament: {
      findMany: jest.fn(),
    },
    sportsMatch: {
      findFirst: jest.fn(),
    },
    sportsRegistrationMember: {
      findMany: jest.fn(),
    },
    sportsMatchRoster: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not enumerate tournaments when the actor has no readable sports scope', async () => {
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    await expect(service.adminTournamentList(undefined, {})).resolves.toEqual([]);
    expect(prisma.sportsTournament.findMany).not.toHaveBeenCalled();
  });

  it('returns queue counts while preserving a scoped tournament filter', async () => {
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(['group-1']),
      majorEventIds: new Set(['major-1']),
    });
    prisma.sportsTournament.findMany.mockResolvedValue([
      {
        id: 'tournament-1',
        majorEventId: 'major-1',
        status: 'ACTIVE',
        scoringMode: 'BOTH',
        selfSubscriptionEnabled: true,
        allowPlayerMultipleTeams: false,
        revision: 3,
        finishedAt: null,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        createdById: 'admin-1',
        updatedAt: new Date('2026-08-01T11:00:00.000Z'),
        updatedById: 'admin-1',
        deletedAt: null,
        majorEvent: {
          id: 'major-1',
          name: 'Jogos Universitários',
          emoji: '🏆',
          startDate: new Date('2026-09-01T10:00:00.000Z'),
          endDate: new Date('2026-09-08T22:00:00.000Z'),
          isPaymentRequired: true,
        },
        _count: {
          categories: 4,
          teams: 12,
          playerApplications: 5,
        },
        categories: [{ _count: { matches: 2, registrations: 3 } }, { _count: { matches: 1, registrations: 0 } }],
        teams: [{ _count: { changeRequests: 4 } }],
      },
    ]);
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.adminTournamentList(undefined, {
      query: ' universitários ',
      skip: 5,
      take: 10,
    });

    expect(prisma.sportsTournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 10,
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ majorEventId: { in: ['major-1'] } }]),
          majorEvent: {
            deletedAt: null,
            name: { contains: 'universitários', mode: 'insensitive' },
          },
        }),
      }),
    );
    expect(result[0]).toMatchObject({
      categoryCount: 4,
      teamCount: 12,
      pendingApplicationCount: 5,
      pendingReviewCount: 10,
      majorEvent: { id: 'major-1', name: 'Jogos Universitários' },
      tournament: { id: 'tournament-1', revision: 3 },
    });
  });

  it('returns only approved operational roster entries with redacted player names', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 7,
      state: 'CHECK_IN',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          id: 'roster-home',
          registrationId: 'registration-home',
          revision: 3,
          status: 'APPROVED',
          registration: {
            team: {
              id: 'team-home',
              name: 'Atlética A',
              institution: 'Universidade A',
              logoSha256: null,
            },
          },
          entries: [
            {
              id: 'entry-safe-1',
              role: 'PLAYER',
              status: 'APPROVED',
              checkedInAt: new Date('2026-08-01T12:00:00.000Z'),
              registrationMember: {
                teamMember: {
                  participant: {
                    person: { name: 'Ana Maria de Souza' },
                  },
                },
              },
            },
          ],
        },
      ],
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.currentUserMatchOperations('match-1');

    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'match-1', deletedAt: null },
        select: expect.objectContaining({
          rosters: expect.objectContaining({
            where: expect.objectContaining({ status: 'APPROVED' }),
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      matchId: 'match-1',
      revision: 7,
      homeRegistrationId: 'registration-home',
      rosters: [
        {
          id: 'roster-home',
          registrationId: 'registration-home',
          entries: [
            {
              id: 'entry-safe-1',
              name: 'Ana Souza',
              role: 'PLAYER',
              status: 'APPROVED',
            },
          ],
        },
      ],
    });
  });

  it('limits lineup reads to eligible members in the selected match registration', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      revision: 9,
      categoryId: 'category-1',
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
    });
    prisma.sportsRegistrationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        role: 'CAPTAIN',
        teamMember: {
          participant: {
            person: { name: 'João Pedro dos Santos' },
          },
        },
      },
    ]);
    prisma.sportsMatchRoster.findFirst.mockResolvedValue({
      id: 'roster-1',
      revision: 4,
      status: 'SUBMITTED',
      entries: [
        {
          id: 'entry-1',
          registrationMemberId: 'member-1',
          role: 'CAPTAIN',
          status: 'SUBMITTED',
          checkedInAt: null,
        },
      ],
    });
    const service = new SportsReadService(prisma as never, authorizationPolicy as never);

    const result = await service.currentUserLineup('match-1', 'registration-home');

    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'match-1',
          OR: [{ homeRegistrationId: 'registration-home' }, { awayRegistrationId: 'registration-home' }],
        }),
      }),
    );
    expect(prisma.sportsRegistrationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registrationId: 'registration-home',
          categoryId: 'category-1',
          eligibility: 'ELIGIBLE',
        }),
      }),
    );
    expect(result).toMatchObject({
      matchId: 'match-1',
      matchRevision: 9,
      registrationId: 'registration-home',
      eligibleMembers: [
        {
          registrationMemberId: 'member-1',
          name: 'João Santos',
          role: 'CAPTAIN',
        },
      ],
      roster: {
        id: 'roster-1',
        revision: 4,
      },
    });
  });
});

describe('SportsReadAdminService team privacy', () => {
  it('does not return team representatives to a category-scoped reader', async () => {
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockImplementation(
        async (
          _user: unknown,
          _permissions: unknown,
          context: { sportsTournamentId?: string; sportsCategoryId?: string; sportsTeamId?: string },
        ) => {
          if (context.sportsTournamentId) {
            throw new ForbiddenException();
          }
          if (!context.sportsTeamId && !context.sportsCategoryId) {
            throw new ForbiddenException();
          }
        },
      ),
    };
    const prisma = {
      sportsTeam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-1',
          tournamentId: 'tournament-1',
          name: 'Equipe',
          institution: null,
          status: 'ACTIVE',
          logoObjectKey: null,
          logoSha256: null,
          logoMimeType: null,
          logoSizeBytes: null,
          revision: 1,
          fieldRevisions: {},
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          createdById: 'admin-1',
          updatedAt: new Date('2026-08-01T10:00:00.000Z'),
          updatedById: 'admin-1',
          deletedAt: null,
        }),
      },
      sportsTeamRepresentative: {
        findMany: jest.fn(),
      },
      sportsRegistration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'registration-1',
            teamId: 'team-1',
            categoryId: 'category-1',
            status: 'ACTIVE',
            seed: null,
            formAnswers: null,
            formSchemaSnapshot: null,
            revision: 1,
            createdAt: new Date('2026-08-01T10:00:00.000Z'),
            createdById: 'admin-1',
            updatedAt: new Date('2026-08-01T10:00:00.000Z'),
            updatedById: 'admin-1',
            deletedAt: null,
          },
        ]),
      },
      sportsTeamMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsTeamChangeRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SportsReadAdminService(prisma as never, authorizationPolicy as never);

    const result = await service.adminTeam({} as never, 'team-1');

    expect(result.representatives).toEqual([]);
    expect(prisma.sportsTeamRepresentative.findMany).not.toHaveBeenCalled();
    expect(result.registrations).toHaveLength(1);
  });
});
