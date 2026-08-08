import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedGrantTarget } from './authorization-policy.service';

export abstract class SportsAuthorizationTargetService {
  protected constructor(protected readonly prisma: PrismaService) {}

  protected abstract addEventTarget(target: ResolvedGrantTarget, eventId: string): Promise<void>;

  protected async addSportsTournamentTarget(target: ResolvedGrantTarget, tournamentId: string): Promise<void> {
    const tournament = await this.prisma.sportsTournament.findUnique({
      where: { id: tournamentId },
      select: {
        majorEventId: true,
      },
    });
    if (tournament) {
      target.majorEventIds.add(tournament.majorEventId);
    }
  }

  protected async addSportsCategoryTarget(target: ResolvedGrantTarget, categoryId: string): Promise<void> {
    const category = await this.prisma.sportsCategory.findUnique({
      where: { id: categoryId },
      select: {
        eventGroupId: true,
        tournament: {
          select: { majorEventId: true },
        },
      },
    });
    if (category) {
      target.eventGroupIds.add(category.eventGroupId);
      target.majorEventIds.add(category.tournament.majorEventId);
    }
  }

  protected async addSportsTeamTarget(target: ResolvedGrantTarget, teamId: string): Promise<void> {
    const team = await this.prisma.sportsTeam.findUnique({
      where: { id: teamId },
      select: {
        tournament: {
          select: { majorEventId: true },
        },
        registrations: {
          where: { deletedAt: null },
          select: {
            category: {
              select: { eventGroupId: true },
            },
          },
        },
      },
    });
    if (team) {
      target.majorEventIds.add(team.tournament.majorEventId);
      for (const registration of team.registrations) {
        target.eventGroupIds.add(registration.category.eventGroupId);
      }
    }
  }

  protected async addSportsRegistrationTarget(target: ResolvedGrantTarget, registrationId: string): Promise<void> {
    const registration = await this.prisma.sportsRegistration.findUnique({
      where: { id: registrationId },
      select: {
        category: {
          select: {
            eventGroupId: true,
            tournament: {
              select: { majorEventId: true },
            },
          },
        },
      },
    });
    if (registration) {
      target.eventGroupIds.add(registration.category.eventGroupId);
      target.majorEventIds.add(registration.category.tournament.majorEventId);
    }
  }

  protected async addSportsMatchTarget(target: ResolvedGrantTarget, matchId: string): Promise<void> {
    const match = await this.prisma.sportsMatch.findUnique({
      where: { id: matchId },
      select: { eventId: true },
    });
    if (match) {
      await this.addEventTarget(target, match.eventId);
    }
  }

  protected async addSportsOfficialTarget(target: ResolvedGrantTarget, assignmentId: string): Promise<void> {
    const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        matchId: true,
        categoryId: true,
        tournamentId: true,
      },
    });
    if (!assignment) {
      return;
    }
    if (assignment.matchId) {
      await this.addSportsMatchTarget(target, assignment.matchId);
      return;
    }
    if (assignment.categoryId) {
      await this.addSportsCategoryTarget(target, assignment.categoryId);
      return;
    }
    await this.addSportsTournamentTarget(target, assignment.tournamentId);
  }

  protected async addSportsTeamChangeRequestTarget(target: ResolvedGrantTarget, requestId: string): Promise<void> {
    const request = await this.prisma.sportsTeamChangeRequest.findUnique({
      where: { id: requestId },
      select: { teamId: true },
    });
    if (request) {
      await this.addSportsTeamTarget(target, request.teamId);
    }
  }

  protected async addSportsTeamRepresentativeTarget(
    target: ResolvedGrantTarget,
    representativeId: string,
  ): Promise<void> {
    const representative = await this.prisma.sportsTeamRepresentative.findUnique({
      where: { id: representativeId },
      select: { teamId: true },
    });
    if (representative) {
      await this.addSportsTeamTarget(target, representative.teamId);
    }
  }

  protected async addSportsPlayerApplicationTarget(target: ResolvedGrantTarget, applicationId: string): Promise<void> {
    const application = await this.prisma.sportsPlayerApplication.findUnique({
      where: { id: applicationId },
      select: {
        tournamentId: true,
        categoryChoices: {
          select: {
            category: {
              select: { eventGroupId: true },
            },
          },
        },
      },
    });
    if (application) {
      await this.addSportsTournamentTarget(target, application.tournamentId);
      for (const choice of application.categoryChoices) {
        target.eventGroupIds.add(choice.category.eventGroupId);
      }
    }
  }

  protected async addSportsMatchActionTarget(target: ResolvedGrantTarget, actionId: string): Promise<void> {
    const action = await this.prisma.sportsMatchAction.findUnique({
      where: { id: actionId },
      select: { matchId: true },
    });
    if (action) {
      await this.addSportsMatchTarget(target, action.matchId);
    }
  }

  protected async addSportsMatchRosterTarget(target: ResolvedGrantTarget, rosterId: string): Promise<void> {
    const roster = await this.prisma.sportsMatchRoster.findUnique({
      where: { id: rosterId },
      select: { matchId: true },
    });
    if (roster) {
      await this.addSportsMatchTarget(target, roster.matchId);
    }
  }
}
