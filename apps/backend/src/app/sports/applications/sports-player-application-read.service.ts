import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SportsApplicationStatus, SportsParticipantStatus, SportsPaymentStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSportsPlayerApplicationRead,
  CurrentUserSportsPlayerApplicationRead,
  SportsPlayerApplicationCategorySummary,
  SportsPlayerApplicationTeamSummary,
} from './sports-player-application-read.models';

const APPLICATION_SELECT = {
  id: true,
  tournamentId: true,
  applicantPersonId: true,
  applicantPerson: {
    select: {
      name: true,
    },
  },
  requestedTeam: {
    select: {
      id: true,
      name: true,
      institution: true,
      logoSha256: true,
    },
  },
  status: true,
  paymentTier: true,
  noticeAcceptedAt: true,
  reviewedAt: true,
  reviewMessage: true,
  createdAt: true,
  updatedAt: true,
  categoryChoices: {
    where: {
      category: {
        deletedAt: null,
      },
    },
    select: {
      category: {
        select: {
          id: true,
          name: true,
          division: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.SportsPlayerApplicationSelect;

type ApplicationRecord = Prisma.SportsPlayerApplicationGetPayload<{
  select: typeof APPLICATION_SELECT;
}>;

type ParticipantState = {
  status: SportsParticipantStatus;
  paymentStatus: SportsPaymentStatus;
};

const DEFAULT_QUEUE_STATUSES = [SportsApplicationStatus.PENDING, SportsApplicationStatus.CHANGES_REQUESTED] as const;

@Injectable()
export class SportsPlayerApplicationReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AuthorizationPolicyService,
  ) {}

  async adminQueue(
    actor: AuthenticatedUser | undefined,
    tournamentId: string,
    statuses?: SportsApplicationStatus[],
    pagination: {
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<AdminSportsPlayerApplicationRead[]> {
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Read], {
      sportsTournamentId: tournamentId,
    });
    const normalizedStatuses = statuses && statuses.length > 0 ? [...new Set(statuses)] : [...DEFAULT_QUEUE_STATUSES];
    const limit = pagination.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('O limite deve ser um inteiro entre 1 e 200.');
    }
    const applications = await this.prisma.sportsPlayerApplication.findMany({
      where: {
        tournamentId,
        status: { in: normalizedStatuses },
        deletedAt: null,
        tournament: { deletedAt: null },
        OR: [{ requestedTeamId: null }, { requestedTeam: { deletedAt: null } }],
        applicantPerson: { deletedAt: null },
      },
      select: APPLICATION_SELECT,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      ...(pagination.cursor
        ? {
            cursor: { id: pagination.cursor },
            skip: 1,
          }
        : {}),
      take: limit,
    });
    const participants = await this.loadParticipantStates(
      tournamentId,
      applications.map((application) => application.applicantPersonId),
    );
    return applications.map((application) =>
      this.mapAdmin(application, participants.get(application.applicantPersonId)),
    );
  }

  async adminDetail(
    actor: AuthenticatedUser | undefined,
    applicationId: string,
  ): Promise<AdminSportsPlayerApplicationRead> {
    await this.policy.assertPermissions(actor, [Permission.SportsRegistration.Read], {
      sportsPlayerApplicationId: applicationId,
    });
    const application = await this.prisma.sportsPlayerApplication.findFirst({
      where: {
        id: applicationId,
        deletedAt: null,
        tournament: { deletedAt: null },
        OR: [{ requestedTeamId: null }, { requestedTeam: { deletedAt: null } }],
        applicantPerson: { deletedAt: null },
      },
      select: APPLICATION_SELECT,
    });
    if (!application) {
      throw new NotFoundException(`Sports player application ${applicationId} was not found.`);
    }
    const participants = await this.loadParticipantStates(application.tournamentId, [application.applicantPersonId]);
    return this.mapAdmin(application, participants.get(application.applicantPersonId));
  }

  async currentUserApplications(
    tournamentId: string,
    personId: string,
  ): Promise<CurrentUserSportsPlayerApplicationRead[]> {
    const applications = await this.prisma.sportsPlayerApplication.findMany({
      where: {
        tournamentId,
        applicantPersonId: personId,
        deletedAt: null,
        tournament: { deletedAt: null },
        OR: [{ requestedTeamId: null }, { requestedTeam: { deletedAt: null } }],
        applicantPerson: { deletedAt: null },
      },
      select: APPLICATION_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const participants = await this.loadParticipantStates(tournamentId, [personId]);
    return applications.map((application) => this.mapCurrentUser(application, participants.get(personId)));
  }

  private async loadParticipantStates(
    tournamentId: string,
    personIds: string[],
  ): Promise<Map<string, ParticipantState>> {
    const uniquePersonIds = [...new Set(personIds)];
    if (uniquePersonIds.length === 0) {
      return new Map();
    }
    const participants = await this.prisma.sportsTournamentParticipant.findMany({
      where: {
        tournamentId,
        personId: { in: uniquePersonIds },
        deletedAt: null,
      },
      select: {
        personId: true,
        status: true,
        paymentStatus: true,
      },
    });
    return new Map(
      participants.map((participant) => [
        participant.personId,
        {
          status: participant.status,
          paymentStatus: participant.paymentStatus,
        },
      ]),
    );
  }

  private mapAdmin(application: ApplicationRecord, participant?: ParticipantState): AdminSportsPlayerApplicationRead {
    return {
      ...this.mapCurrentUser(application, participant),
      applicant: {
        personId: application.applicantPersonId,
        name: application.applicantPerson.name,
      },
    };
  }

  private mapCurrentUser(
    application: ApplicationRecord,
    participant?: ParticipantState,
  ): CurrentUserSportsPlayerApplicationRead {
    return {
      id: application.id,
      tournamentId: application.tournamentId,
      requestedTeam: application.requestedTeam ? this.mapTeam(application.requestedTeam) : null,
      categories: application.categoryChoices.map(({ category }) => this.mapCategory(category)),
      status: application.status,
      participantStatus: participant?.status ?? null,
      paymentStatus: participant?.paymentStatus ?? null,
      paymentTier: application.paymentTier,
      noticeAcceptedAt: application.noticeAcceptedAt,
      reviewedAt: application.reviewedAt,
      reviewMessage: application.reviewMessage,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private mapTeam(team: {
    id: string;
    name: string;
    institution: string | null;
    logoSha256: string | null;
  }): SportsPlayerApplicationTeamSummary {
    return {
      id: team.id,
      name: team.name,
      institution: team.institution,
      logoUrl: team.logoSha256 ? `/api/sports/teams/${team.id}/logo/${team.logoSha256}` : null,
    };
  }

  private mapCategory(category: {
    id: string;
    name: string;
    division: string | null;
  }): SportsPlayerApplicationCategorySummary {
    return category;
  }
}
