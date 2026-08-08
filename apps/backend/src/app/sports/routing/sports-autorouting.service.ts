import { Injectable } from '@nestjs/common';
import { SportsMatchState } from '@prisma/client';
import { addHours, subHours } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';

export type SportsAutorouteMode =
  | 'CHECK_IN'
  | 'OPERATE'
  | 'FINALIZE'
  | 'MATCH_DETAIL'
  | 'WALLET'
  | 'TEAM';

export interface SportsAutoroute {
  matchId?: string;
  teamId?: string;
  mode: SportsAutorouteMode;
}

@Injectable()
export class SportsAutoroutingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCurrentUserRoute(
    personId: string,
    now = new Date(),
  ): Promise<SportsAutoroute | null> {
    return (
      (await this.resolveOfficialRoute(personId, now)) ??
      (await this.resolvePlayerRoute(personId, now)) ??
      this.resolveRepresentativeRoute(personId)
    );
  }

  async resolveOfficialRoute(
    personId: string,
    now = new Date(),
  ): Promise<SportsAutoroute | null> {
    const matches = await this.prisma.sportsMatch.findMany({
      where: {
        deletedAt: null,
        event: {
          deletedAt: null,
          startDate: { lte: addHours(now, 2) },
          endDate: { gte: subHours(now, 6) },
        },
        category: {
          deletedAt: null,
          tournament: { deletedAt: null },
        },
        OR: [
          {
            officialAssignments: {
              some: {
                personId,
                active: true,
                revokedAt: null,
              },
            },
          },
          {
            category: {
              officialAssignments: {
                some: {
                  personId,
                  active: true,
                  revokedAt: null,
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
                    personId,
                    active: true,
                    revokedAt: null,
                    categoryId: null,
                    matchId: null,
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        state: true,
        event: { select: { startDate: true, endDate: true } },
      },
      orderBy: { event: { startDate: 'asc' } },
    });
    const selected = [...matches].sort(
      (left, right) =>
        this.statePriority(left.state) - this.statePriority(right.state) ||
        Math.abs(left.event.startDate.getTime() - now.getTime()) -
          Math.abs(right.event.startDate.getTime() - now.getTime()),
    )[0];
    if (!selected) {
      return null;
    }
    return {
      matchId: selected.id,
      mode: this.modeForState(selected.state),
    };
  }

  async affectedPeopleForMatch(matchId: string): Promise<string[]> {
    const match = await this.prisma.sportsMatch.findUnique({
      where: { id: matchId },
      select: {
        rosters: {
          where: { deletedAt: null },
          select: {
            entries: {
              where: { deletedAt: null },
              select: {
                registrationMember: {
                  select: {
                    teamMember: {
                      select: {
                        participant: { select: { personId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        officialAssignments: {
          where: { active: true, revokedAt: null },
          select: { personId: true },
        },
        category: {
          select: {
            officialAssignments: {
              where: { active: true, revokedAt: null, matchId: null },
              select: { personId: true },
            },
            tournament: {
              select: {
                officials: {
                  where: {
                    active: true,
                    revokedAt: null,
                    categoryId: null,
                    matchId: null,
                  },
                  select: { personId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!match) {
      return [];
    }
    return [
      ...new Set([
        ...match.rosters.flatMap((roster) =>
          roster.entries.map(
            (entry) =>
              entry.registrationMember.teamMember.participant.personId,
          ),
        ),
        ...match.officialAssignments.map((assignment) => assignment.personId),
        ...match.category.officialAssignments.map(
          (assignment) => assignment.personId,
        ),
        ...match.category.tournament.officials.map(
          (assignment) => assignment.personId,
        ),
      ]),
    ];
  }

  private async resolvePlayerRoute(
    personId: string,
    now: Date,
  ): Promise<SportsAutoroute | null> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        deletedAt: null,
        state: {
          in: [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ],
        },
        event: {
          deletedAt: null,
          startDate: { lte: addHours(now, 2) },
          endDate: { gte: subHours(now, 1) },
        },
        rosters: {
          some: {
            deletedAt: null,
            status: 'APPROVED',
            entries: {
              some: {
                deletedAt: null,
                status: 'APPROVED',
                registrationMember: {
                  deletedAt: null,
                  eligibility: 'ELIGIBLE',
                  teamMember: {
                    deletedAt: null,
                    status: 'APPROVED',
                    participant: {
                      personId,
                      deletedAt: null,
                      status: 'ACTIVE',
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        event: { startDate: 'asc' },
      },
    });
    return match ? { matchId: match.id, mode: 'WALLET' } : null;
  }

  private async resolveRepresentativeRoute(
    personId: string,
  ): Promise<SportsAutoroute | null> {
    const representative = await this.prisma.sportsTeamRepresentative.findFirst({
      where: {
        personId,
        active: true,
        revokedAt: null,
        team: {
          deletedAt: null,
          tournament: {
            deletedAt: null,
            finishedAt: null,
            status: {
              notIn: ['FINISHED', 'CANCELED'],
            },
          },
        },
      },
      select: { teamId: true },
      orderBy: { assignedAt: 'desc' },
    });
    return representative
      ? { teamId: representative.teamId, mode: 'TEAM' }
      : null;
  }

  private modeForState(state: SportsMatchState): SportsAutorouteMode {
    switch (state) {
      case SportsMatchState.SCHEDULED:
      case SportsMatchState.CHECK_IN:
        return 'CHECK_IN';
      case SportsMatchState.LIVE:
      case SportsMatchState.PAUSED:
        return 'OPERATE';
      case SportsMatchState.AWAITING_REVIEW:
        return 'FINALIZE';
      default:
        return 'MATCH_DETAIL';
    }
  }

  private statePriority(state: SportsMatchState): number {
    switch (state) {
      case SportsMatchState.LIVE:
      case SportsMatchState.PAUSED:
        return 0;
      case SportsMatchState.CHECK_IN:
        return 1;
      case SportsMatchState.SCHEDULED:
        return 2;
      case SportsMatchState.AWAITING_REVIEW:
        return 3;
      default:
        return 4;
    }
  }
}
