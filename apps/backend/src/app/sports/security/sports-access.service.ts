import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { CurrentUserContextService } from '../../current-user/context.service';
import { GraphqlContext } from '../../current-user/selects';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SportsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly frozen: FrozenResourceService,
  ) {}

  async requireTeamRepresentative(context: GraphqlContext, teamId: string) {
    const result = await this.requireTeamRepresentativeReader(context, teamId);
    this.assertTournamentOpenForPublicEdits(result.team.tournament);
    await this.frozen.assertMajorEventMutable(result.team.tournament.majorEventId, undefined, 'edit');
    return result;
  }

  async requireTeamRepresentativeReader(context: GraphqlContext, teamId: string) {
    const actor = await this.currentUser.requireCurrentPerson(context);
    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: teamId,
        deletedAt: null,
      },
      select: {
        id: true,
        revision: true,
        fieldRevisions: true,
        tournamentId: true,
        tournament: {
          select: {
            status: true,
            finishedAt: true,
            deletedAt: true,
            majorEventId: true,
          },
        },
        representatives: {
          where: {
            personId: actor.id,
            active: true,
            revokedAt: null,
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!team || team.tournament.deletedAt || team.representatives.length === 0) {
      throw new ForbiddenException('Você não representa esta equipe.');
    }
    return { actor, team };
  }

  async requireLineupManager(context: GraphqlContext, registrationId: string) {
    const actor = await this.currentUser.requireCurrentPerson(context);
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: {
        id: registrationId,
        deletedAt: null,
        status: {
          in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
        },
      },
      select: {
        id: true,
        teamId: true,
        categoryId: true,
        category: {
          select: {
            status: true,
            finishedAt: true,
            tournament: {
              select: {
                status: true,
                finishedAt: true,
                deletedAt: true,
                majorEventId: true,
              },
            },
          },
        },
        members: {
          where: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            role: {
              in: [SportsRosterRole.CAPTAIN, SportsRosterRole.COACH],
            },
            teamMember: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              participant: {
                deletedAt: null,
                personId: actor.id,
                status: SportsParticipantStatus.ACTIVE,
              },
            },
          },
          select: { id: true, role: true },
          take: 1,
        },
      },
    });
    if (!registration || registration.members.length === 0) {
      throw new ForbiddenException('Você não é capitão ou técnico desta equipe nesta modalidade.');
    }
    this.assertCategoryOpenForPublicEdits(registration.category);
    await this.frozen.assertMajorEventMutable(registration.category.tournament.majorEventId, undefined, 'edit');
    return { actor, registration, assignment: registration.members[0] };
  }

  async requireRosterManager(context: GraphqlContext, registrationId: string) {
    const actor = await this.currentUser.requireCurrentPerson(context);
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: {
        id: registrationId,
        deletedAt: null,
        status: {
          in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
        },
      },
      select: {
        id: true,
        teamId: true,
        categoryId: true,
        category: {
          select: {
            status: true,
            finishedAt: true,
            tournament: {
              select: {
                status: true,
                finishedAt: true,
                deletedAt: true,
                majorEventId: true,
              },
            },
          },
        },
        members: {
          where: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            role: {
              in: [SportsRosterRole.CAPTAIN, SportsRosterRole.COACH],
            },
            teamMember: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              participant: {
                deletedAt: null,
                personId: actor.id,
                status: SportsParticipantStatus.ACTIVE,
              },
            },
          },
          select: { id: true, role: true },
          take: 1,
        },
        team: {
          select: {
            representatives: {
              where: {
                personId: actor.id,
                active: true,
                revokedAt: null,
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!registration || (registration.members.length === 0 && registration.team.representatives.length === 0)) {
      throw new ForbiddenException('Você não pode editar a escalação desta equipe nesta modalidade.');
    }
    this.assertCategoryOpenForPublicEdits(registration.category);
    await this.frozen.assertMajorEventMutable(registration.category.tournament.majorEventId, undefined, 'edit');
    return {
      actor,
      registration,
      assignment: registration.members[0] ?? null,
      representative: registration.team.representatives[0] ?? null,
    };
  }

  async requireLineupReader(context: GraphqlContext, registrationId: string) {
    const actor = await this.currentUser.requireCurrentPerson(context);
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: {
        id: registrationId,
        deletedAt: null,
        status: {
          in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
        },
      },
      select: {
        id: true,
        teamId: true,
        categoryId: true,
        members: {
          where: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            teamMember: {
              deletedAt: null,
              status: SportsTeamMemberStatus.APPROVED,
              participant: {
                deletedAt: null,
                personId: actor.id,
                status: SportsParticipantStatus.ACTIVE,
              },
            },
          },
          select: { id: true, role: true },
          take: 1,
        },
        team: {
          select: {
            representatives: {
              where: {
                personId: actor.id,
                active: true,
                revokedAt: null,
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!registration || (registration.members.length === 0 && registration.team.representatives.length === 0)) {
      throw new ForbiddenException('Você não participa desta equipe nesta modalidade.');
    }
    return {
      actor,
      registration,
      membership: registration.members[0] ?? null,
      representative: registration.team.representatives[0] ?? null,
    };
  }

  async requireMatchOfficial(context: GraphqlContext, matchId: string) {
    const actor = await this.currentUser.requireCurrentPerson(context);
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        id: matchId,
        deletedAt: null,
      },
      select: {
        id: true,
        categoryId: true,
        category: {
          select: {
            tournamentId: true,
            status: true,
            finishedAt: true,
            tournament: {
              select: {
                status: true,
                finishedAt: true,
                deletedAt: true,
                majorEventId: true,
              },
            },
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }

    const assignment = await this.prisma.sportsOfficialAssignment.findFirst({
      where: {
        personId: actor.id,
        active: true,
        revokedAt: null,
        tournamentId: match.category.tournamentId,
        OR: [{ matchId }, { matchId: null, categoryId: match.categoryId }, { matchId: null, categoryId: null }],
      },
      orderBy: [{ matchId: { sort: 'desc', nulls: 'last' } }, { categoryId: { sort: 'desc', nulls: 'last' } }],
    });
    if (!assignment) {
      throw new ForbiddenException('Você não está designado para operar esta partida.');
    }
    this.assertCategoryOpenForPublicEdits(match.category);
    await this.frozen.assertMajorEventMutable(match.category.tournament.majorEventId, undefined, 'edit');
    return { actor, match, assignment };
  }

  getAuthenticatedUser(context: GraphqlContext): AuthenticatedUser {
    return this.currentUser.getAuthenticatedUser(context);
  }

  private assertTournamentOpenForPublicEdits(tournament: {
    status: SportsTournamentStatus;
    finishedAt: Date | null;
  }): void {
    if (
      tournament.finishedAt ||
      tournament.status === SportsTournamentStatus.FINISHED ||
      tournament.status === SportsTournamentStatus.CANCELED
    ) {
      throw new ForbiddenException('Este torneio foi encerrado e não aceita alterações de representantes.');
    }
  }

  private assertCategoryOpenForPublicEdits(category: {
    status: SportsCategoryStatus;
    finishedAt: Date | null;
    tournament: {
      status: SportsTournamentStatus;
      finishedAt: Date | null;
    };
  }): void {
    this.assertTournamentOpenForPublicEdits(category.tournament);
    if (
      category.finishedAt ||
      category.status === SportsCategoryStatus.FINISHED ||
      category.status === SportsCategoryStatus.CANCELED
    ) {
      throw new ForbiddenException('Esta modalidade foi encerrada e não aceita alterações.');
    }
  }
}
