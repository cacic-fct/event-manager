import { BadRequestException, ConflictException, Inject } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsPaymentService } from '../sports-payment.service';
import { SportsPlayerApplicationRealtimeService } from './sports-player-application-realtime.service';

const REVIEWABLE_APPLICATION_STATUSES = [
  SportsApplicationStatus.PENDING,
  SportsApplicationStatus.CHANGES_REQUESTED,
] as const;

const ELIGIBLE_TEAM_REGISTRATION_STATUSES = [
  SportsRegistrationStatus.APPROVED,
  SportsRegistrationStatus.WAITING_PAYMENT,
  SportsRegistrationStatus.ACTIVE,
] as const;

export interface SubmitSportsPlayerApplicationInput {
  tournamentId: string;
  requestedTeamId?: string | null;
  categoryIds: string[];
  noticeAccepted: boolean;
  paymentTier?: string | null;
}

export type SportsPlayerApplicationReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export abstract class SportsPlayerApplicationSupportService {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly payments: SportsPaymentService,
    protected readonly auditLog: AuditLogService,
    @Inject(SportsPlayerApplicationRealtimeService)
    protected readonly realtime: Pick<SportsPlayerApplicationRealtimeService, 'publishApplicationChanged'> = {
      publishApplicationChanged: async () => undefined,
    },
  ) {}

  protected async loadApplicationTarget(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    requestedTeamId: string | null,
    categoryIds: string[],
  ) {
    const tournament = await tx.sportsTournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: {
        id: true,
        majorEventId: true,
        status: true,
        selfSubscriptionEnabled: true,
        selfSubscriptionAllowNoTeam: true,
        selfSubscriptionAllowNoCategory: true,
        allowPlayerMultipleTeams: true,
        finishedAt: true,
        majorEvent: {
          select: {
            deletedAt: true,
            isPaymentRequired: true,
            subscriptionStartDate: true,
            subscriptionEndDate: true,
            majorEventPrices: {
              select: {
                tiers: {
                  select: {
                    name: true,
                    value: true,
                  },
                },
              },
            },
          },
        },
        teams: {
          where: {
            id: requestedTeamId ?? '__no_requested_team__',
            deletedAt: null,
            status: SportsTeamStatus.ACTIVE,
          },
          select: { id: true },
          take: 1,
        },
        categories: {
          where: {
            id: { in: categoryIds },
            deletedAt: null,
            status: {
              in: [SportsCategoryStatus.REGISTRATION_OPEN, SportsCategoryStatus.ACTIVE],
            },
            ...(requestedTeamId
              ? {
                  registrations: {
                    some: {
                      teamId: requestedTeamId,
                      deletedAt: null,
                      status: {
                        in: [...ELIGIBLE_TEAM_REGISTRATION_STATUSES],
                      },
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            registrationStartDate: true,
            registrationEndDate: true,
          },
        },
      },
    });
    if (!tournament || tournament.majorEvent.deletedAt) {
      throw new BadRequestException('O torneio selecionado não está disponível.');
    }
    if (
      (!requestedTeamId && !tournament.selfSubscriptionAllowNoTeam) ||
      (requestedTeamId && tournament.teams.length !== 1)
    ) {
      throw new BadRequestException('Selecione uma equipe disponível para este torneio.');
    }
    if (
      (categoryIds.length === 0 && !tournament.selfSubscriptionAllowNoCategory) ||
      tournament.categories.length !== categoryIds.length
    ) {
      throw new BadRequestException('Selecione ao menos uma modalidade disponível para este torneio.');
    }
    return tournament;
  }

  protected assertSelfApplicationOpen(target: {
    status: SportsTournamentStatus;
    selfSubscriptionEnabled: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    allowPlayerMultipleTeams: boolean;
    finishedAt: Date | null;
    majorEvent: {
      subscriptionStartDate: Date | null;
      subscriptionEndDate: Date | null;
      isPaymentRequired: boolean;
      majorEventPrices: Array<{
        tiers: Array<{ name: string; value: number }>;
      }>;
    };
    categories: Array<{
      registrationStartDate: Date | null;
      registrationEndDate: Date | null;
    }>;
  }): void {
    if (
      !target.selfSubscriptionEnabled ||
      target.finishedAt ||
      target.status !== SportsTournamentStatus.REGISTRATION_OPEN
    ) {
      throw new BadRequestException('As solicitações individuais não estão abertas para este torneio.');
    }
    const now = new Date();
    if (
      (target.majorEvent.subscriptionStartDate && now < target.majorEvent.subscriptionStartDate) ||
      (target.majorEvent.subscriptionEndDate && now > target.majorEvent.subscriptionEndDate) ||
      target.categories.some(
        (category) =>
          (category.registrationStartDate && now < category.registrationStartDate) ||
          (category.registrationEndDate && now > category.registrationEndDate),
      )
    ) {
      throw new BadRequestException('As solicitações individuais estão fora do período de inscrição.');
    }
  }

  protected async loadApprovedTeamRegistrations(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    teamId: string,
    categoryIds: string[],
  ): Promise<Array<{ id: string; categoryId: string }>> {
    const registrations = await tx.sportsRegistration.findMany({
      where: {
        teamId,
        categoryId: { in: categoryIds },
        deletedAt: null,
        status: {
          in: [...ELIGIBLE_TEAM_REGISTRATION_STATUSES],
        },
        category: {
          tournamentId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        categoryId: true,
      },
    });
    if (registrations.length !== categoryIds.length) {
      throw new ConflictException('A equipe não está mais inscrita em todas as modalidades solicitadas.');
    }
    return registrations;
  }

  protected assertReviewable(status: SportsApplicationStatus): void {
    if (!(REVIEWABLE_APPLICATION_STATUSES as readonly SportsApplicationStatus[]).includes(status)) {
      throw new ConflictException('Esta solicitação já foi analisada.');
    }
  }

  protected normalizeCategoryIds(categoryIds: string[]): string[] {
    return [...new Set(categoryIds.map((categoryId) => categoryId.trim()).filter(Boolean))];
  }

  protected applicationPendingKey(
    tournamentId: string,
    applicantPersonId: string,
    requestedTeamId: string | null,
  ): string {
    return `self:${tournamentId}:${applicantPersonId}:${requestedTeamId ?? 'no-team'}`;
  }

  protected requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O usuário administrador não possui identificador.');
    }
    return actor.sub;
  }

  protected getApplication(tx: Prisma.TransactionClient, applicationId: string) {
    return tx.sportsPlayerApplication.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        requestedTeam: {
          select: {
            id: true,
            name: true,
            logoObjectKey: true,
          },
        },
        categoryChoices: {
          select: {
            categoryId: true,
            category: {
              select: {
                name: true,
                division: true,
              },
            },
          },
        },
      },
    });
  }

  protected async recordReviewAudit(
    tx: Prisma.TransactionClient,
    application: {
      id: string;
      status: SportsApplicationStatus;
      requestedTeamId: string | null;
      categoryChoices: Array<{ categoryId: string }>;
      tournament: {
        majorEventId: string;
      };
    },
    actor: AuthenticatedUser,
    status: SportsApplicationStatus,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const operation =
      status === SportsApplicationStatus.REJECTED
        ? AuditLogOperation.REJECT
        : status === SportsApplicationStatus.CHANGES_REQUESTED
          ? AuditLogOperation.REQUEST_CHANGES
          : AuditLogOperation.APPROVE;
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.SPORTS_PLAYER_APPLICATION,
        entityId: application.id,
        entityLabel: 'Solicitação individual para equipe',
        operation,
        actor,
        before: {
          status: application.status,
        },
        after: {
          status,
          requestedTeamId: application.requestedTeamId,
          categoryIds: application.categoryChoices.map((choice) => choice.categoryId),
          ...metadata,
        },
        summary:
          status === SportsApplicationStatus.REJECTED
            ? 'Solicitação individual recusada.'
            : status === SportsApplicationStatus.CHANGES_REQUESTED
              ? 'Ajustes solicitados na solicitação individual.'
              : 'Solicitação individual aprovada.',
        scope: { majorEventId: application.tournament.majorEventId },
      },
      tx,
    );
  }
}
