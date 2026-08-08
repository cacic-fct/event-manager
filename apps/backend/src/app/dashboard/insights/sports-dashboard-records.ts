import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_SPORTS_MATCH_STATES = [
  'CHECK_IN',
  'LIVE',
  'PAUSED',
  'AWAITING_REVIEW',
] as const;

export async function loadSportsDashboardRecords(
  prisma: PrismaService,
  canReadSports: boolean,
) {
  const [tournaments, matches] = await Promise.all([
    canReadSports
      ? prisma.sportsTournament.findMany({
          where: {
            deletedAt: null,
            status: { notIn: ['FINISHED', 'CANCELED'] },
          },
          select: {
            id: true,
            majorEventId: true,
            status: true,
            majorEvent: {
              select: {
                name: true,
                emoji: true,
                startDate: true,
                endDate: true,
              },
            },
            _count: {
              select: {
                categories: { where: { deletedAt: null } },
                teams: { where: { deletedAt: null } },
                playerApplications: {
                  where: { deletedAt: null, status: 'PENDING' },
                },
              },
            },
            categories: {
              where: { deletedAt: null },
              select: {
                _count: {
                  select: {
                    matches: {
                      where: { deletedAt: null, reviewStatus: 'PENDING' },
                    },
                    registrations: {
                      where: {
                        deletedAt: null,
                        status: { in: ['PENDING', 'CHANGES_REQUESTED'] },
                      },
                    },
                  },
                },
              },
            },
            teams: {
              where: { deletedAt: null },
              select: {
                _count: {
                  select: {
                    changeRequests: {
                      where: {
                        status: { in: ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'] },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ majorEvent: { startDate: 'asc' } }, { id: 'asc' }],
          take: 10,
        })
      : Promise.resolve([]),
    canReadSports
      ? prisma.sportsMatch.findMany({
          where: {
            deletedAt: null,
            state: { in: [...ACTIVE_SPORTS_MATCH_STATES] },
            category: {
              deletedAt: null,
              tournament: { deletedAt: null },
            },
          },
          select: {
            id: true,
            state: true,
            scoreboard: true,
            event: { select: { name: true, startDate: true } },
            category: {
              select: {
                name: true,
                tournamentId: true,
              },
            },
            homeRegistration: { select: { team: { select: { name: true } } } },
            awayRegistration: { select: { team: { select: { name: true } } } },
          },
          orderBy: [{ event: { startDate: 'asc' } }, { id: 'asc' }],
          take: 100,
        })
      : Promise.resolve([]),
  ]);
  return { tournaments, matches };
}
