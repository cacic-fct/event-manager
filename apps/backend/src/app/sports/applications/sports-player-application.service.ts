import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { resolveMajorEventSelfServicePayment } from '../../current-user/major-events/major-event-payment-selection';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsPaymentService } from '../sports-payment.service';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsPlayerApplicationRealtimeService } from './sports-player-application-realtime.service';

const REVIEWABLE_APPLICATION_STATUSES = [
  SportsApplicationStatus.PENDING,
  SportsApplicationStatus.CHANGES_REQUESTED,
] as const;

const IDEMPOTENT_APPROVAL_STATUSES = [
  SportsApplicationStatus.APPROVED,
  SportsApplicationStatus.WAITING_PAYMENT,
  SportsApplicationStatus.ACTIVE,
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

export type SportsPlayerApplicationReviewDecision =
  | 'APPROVE'
  | 'REQUEST_CHANGES'
  | 'REJECT';

@Injectable()
export class SportsPlayerApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: SportsPaymentService,
    private readonly auditLog: AuditLogService,
    @Inject(SportsPlayerApplicationRealtimeService)
    private readonly realtime: Pick<
      SportsPlayerApplicationRealtimeService,
      'publishApplicationChanged'
    > = {
      publishApplicationChanged: async () => undefined,
    },
  ) {}

  async submitSelfApplication(
    input: SubmitSportsPlayerApplicationInput,
    applicantPersonId: string,
    actor: AuthenticatedUser,
  ) {
    if (!input.noticeAccepted) {
      throw new BadRequestException(
        'Confirme que a inscrição não garante sua escalação antes de continuar.',
      );
    }
    const requestedTeamId = input.requestedTeamId?.trim() || null;
    const categoryIds = this.normalizeCategoryIds(input.categoryIds);
    const pendingKey = this.applicationPendingKey(
      input.tournamentId,
      applicantPersonId,
      requestedTeamId,
    );

    const application = await runSerializableSportsTransaction(
      this.prisma,
      async (tx) => {
      const target = await this.loadApplicationTarget(
        tx,
        input.tournamentId,
        requestedTeamId,
        categoryIds,
      );
      this.assertSelfApplicationOpen(target);
      const paymentSelection = resolveMajorEventSelfServicePayment(
        target.majorEvent,
        input.paymentTier,
      );
      if (!target.allowPlayerMultipleTeams) {
        const pendingOtherTeam =
          await tx.sportsPlayerApplication.findFirst({
            where: {
              tournamentId: input.tournamentId,
              applicantPersonId,
              ...(requestedTeamId
                ? {
                    OR: [
                      { requestedTeamId: null },
                      { requestedTeamId: { not: requestedTeamId } },
                    ],
                  }
                : { requestedTeamId: { not: null } }),
              status: { in: [...REVIEWABLE_APPLICATION_STATUSES] },
              deletedAt: null,
            },
            select: { id: true },
          });
        if (pendingOtherTeam) {
          throw new ConflictException(
            'Já existe uma solicitação pendente para outra equipe neste torneio.',
          );
        }
      }

      const application = await tx.sportsPlayerApplication.upsert({
        where: { pendingKey },
        create: {
          tournamentId: input.tournamentId,
          applicantPersonId,
          requestedTeamId,
          status: SportsApplicationStatus.PENDING,
          noticeAcceptedAt: new Date(),
          pendingKey,
          paymentTier: paymentSelection.paymentTier,
        },
        update: {},
        include: {
          categoryChoices: {
            select: { categoryId: true },
          },
        },
      });
      const existingCategoryIds = application.categoryChoices
        .map((choice) => choice.categoryId)
        .sort();
      const normalizedCategoryIds = [...categoryIds].sort();
      const isIdenticalPendingSubmission =
        application.requestedTeamId === requestedTeamId &&
        application.paymentTier === paymentSelection.paymentTier &&
        existingCategoryIds.length === normalizedCategoryIds.length &&
        existingCategoryIds.every((categoryId, index) => categoryId === normalizedCategoryIds[index]);

      if (
        !(
          REVIEWABLE_APPLICATION_STATUSES as readonly SportsApplicationStatus[]
        ).includes(application.status)
      ) {
        if (
          (
            IDEMPOTENT_APPROVAL_STATUSES as readonly SportsApplicationStatus[]
          ).includes(application.status) &&
          isIdenticalPendingSubmission
        ) {
          return this.getApplication(tx, application.id);
        }
        throw new ConflictException('Esta solicitação já foi analisada e não pode ser substituída.');
      }
      if (
        application.status === SportsApplicationStatus.PENDING &&
        isIdenticalPendingSubmission
      ) {
        return this.getApplication(tx, application.id);
      }

      await tx.sportsPlayerApplication.update({
        where: { id: application.id },
        data: {
          requestedTeamId,
          status: SportsApplicationStatus.PENDING,
          noticeAcceptedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          reviewMessage: null,
          paymentTier: paymentSelection.paymentTier,
        },
      });
      await tx.sportsPlayerApplicationCategory.deleteMany({
        where: { applicationId: application.id },
      });
      await tx.sportsPlayerApplicationCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          applicationId: application.id,
          categoryId,
        })),
      });

      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_PLAYER_APPLICATION,
          entityId: application.id,
          entityLabel: 'Solicitação individual para equipe',
          operation: AuditLogOperation.SUBMIT,
          actor,
          before: {
            status: application.status,
            requestedTeamId: application.requestedTeamId,
            categoryIds: existingCategoryIds,
          },
          after: {
            status: SportsApplicationStatus.PENDING,
            requestedTeamId,
            categoryIds,
            noticeAccepted: true,
            paymentTier: paymentSelection.paymentTier,
          },
          summary: 'Solicitação individual enviada para análise.',
          scope: { majorEventId: target.majorEventId },
        },
        tx,
      );
      return this.getApplication(tx, application.id);
      },
    );
    await this.realtime.publishApplicationChanged(
      application.id,
      'SUBMITTED',
    );
    return application;
  }

  async review(
    applicationId: string,
    decision: SportsPlayerApplicationReviewDecision,
    actor: AuthenticatedUser,
    message?: string,
  ) {
    const actorId = this.requireActorId(actor);
    const reviewMessage = message?.trim() || null;

    const application = await runSerializableSportsTransaction(
      this.prisma,
      async (tx) => {
      const application = await tx.sportsPlayerApplication.findUnique({
        where: { id: applicationId },
        include: {
          categoryChoices: {
            select: { categoryId: true },
          },
          tournament: {
            select: {
              id: true,
              allowPlayerMultipleTeams: true,
              deletedAt: true,
              majorEventId: true,
            },
          },
          requestedTeam: {
            select: {
              id: true,
              name: true,
              tournamentId: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      });
      if (!application || application.deletedAt || application.tournament.deletedAt) {
        throw new NotFoundException(`Sports player application ${applicationId} was not found.`);
      }

      if (decision === 'APPROVE') {
        if (
          (
            IDEMPOTENT_APPROVAL_STATUSES as readonly SportsApplicationStatus[]
          ).includes(application.status)
        ) {
          return this.getApplication(tx, application.id);
        }
        this.assertReviewable(application.status);
        if (application.requestedTeamId) {
          const staged = await tx.sportsPlayerApplication.updateMany({
            where: {
              id: application.id,
              status: {
                in: [...REVIEWABLE_APPLICATION_STATUSES],
              },
            },
            data: {
              status: SportsApplicationStatus.APPROVED,
              reviewedAt: new Date(),
              reviewedById: actorId,
              reviewMessage,
            },
          });
          if (staged.count !== 1) {
            throw new ConflictException(
              'A solicitação mudou durante a aprovação.',
            );
          }
          await this.recordReviewAudit(
            tx,
            application,
            actor,
            SportsApplicationStatus.APPROVED,
            { awaitingTeamRepresentative: true },
          );
          return this.getApplication(tx, application.id);
        }
        return this.approveApplication(tx, application, actor, actorId, reviewMessage);
      }

      this.assertReviewable(application.status);
      const nextStatus =
        decision === 'REJECT'
          ? SportsApplicationStatus.REJECTED
          : SportsApplicationStatus.CHANGES_REQUESTED;
      const reviewed = await tx.sportsPlayerApplication.update({
        where: { id: application.id },
        data: {
          status: nextStatus,
          pendingKey: decision === 'REJECT' ? null : application.pendingKey,
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewMessage,
        },
      });
      await this.recordReviewAudit(tx, application, actor, nextStatus);
      return reviewed;
      },
    );
    await this.realtime.publishApplicationChanged(
      application.id,
      'REVIEWED',
    );
    return application;
  }

  async reviewByRepresentative(
    applicationId: string,
    teamId: string,
    approved: boolean,
    actor: AuthenticatedUser,
    message?: string | null,
  ) {
    const actorId = this.requireActorId(actor);
    const reviewMessage = message?.trim() || null;
    const application = await runSerializableSportsTransaction(
      this.prisma,
      async (tx) => {
        const application = await tx.sportsPlayerApplication.findUnique({
          where: { id: applicationId },
          include: {
            categoryChoices: {
              select: { categoryId: true },
            },
            tournament: {
              select: {
                id: true,
                allowPlayerMultipleTeams: true,
                deletedAt: true,
                majorEventId: true,
              },
            },
            requestedTeam: {
              select: {
                id: true,
                name: true,
                tournamentId: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        });
        if (
          !application ||
          application.deletedAt ||
          application.tournament.deletedAt ||
          application.requestedTeamId !== teamId ||
          application.status !== SportsApplicationStatus.APPROVED
        ) {
          throw new NotFoundException(
            'Solicitação aprovada para esta equipe não encontrada.',
          );
        }
        if (approved) {
          return this.approveApplication(
            tx,
            application,
            actor,
            actorId,
            reviewMessage,
          );
        }
        const rejected = await tx.sportsPlayerApplication.updateMany({
          where: {
            id: application.id,
            requestedTeamId: teamId,
            status: SportsApplicationStatus.APPROVED,
          },
          data: {
            status: SportsApplicationStatus.REJECTED,
            pendingKey: null,
            reviewedAt: new Date(),
            reviewedById: actorId,
            reviewMessage,
          },
        });
        if (rejected.count !== 1) {
          throw new ConflictException(
            'A solicitação mudou durante a análise da equipe.',
          );
        }
        await this.recordReviewAudit(
          tx,
          application,
          actor,
          SportsApplicationStatus.REJECTED,
          { representativeDecision: 'REJECTED' },
        );
        return this.getApplication(tx, application.id);
      },
    );
    await this.realtime.publishApplicationChanged(
      application.id,
      'REVIEWED',
    );
    return application;
  }

  private async approveApplication(
    tx: Prisma.TransactionClient,
    application: {
      id: string;
      applicantPersonId: string;
      requestedTeamId: string | null;
      status: SportsApplicationStatus;
      categoryChoices: Array<{ categoryId: string }>;
      tournament: {
        id: string;
        majorEventId: string;
        allowPlayerMultipleTeams: boolean;
      };
      paymentTier: string | null;
      requestedTeam: {
        id: string;
        name: string;
        tournamentId: string;
        status: SportsTeamStatus;
        deletedAt: Date | null;
      } | null;
    },
    actor: AuthenticatedUser,
    actorId: string,
    reviewMessage: string | null,
  ) {
    if (
      application.requestedTeamId &&
      (!application.requestedTeam ||
        application.requestedTeam.deletedAt ||
        application.requestedTeam.tournamentId !== application.tournament.id ||
        application.requestedTeam.status !== SportsTeamStatus.ACTIVE)
    ) {
      throw new ConflictException('A equipe solicitada não está mais disponível.');
    }
    const categoryIds = application.categoryChoices.map((choice) => choice.categoryId);
    const registrations = application.requestedTeamId
      ? await this.loadApprovedTeamRegistrations(
          tx,
          application.tournament.id,
          application.requestedTeamId,
          categoryIds,
        )
      : [];

    if (
      application.requestedTeamId &&
      !application.tournament.allowPlayerMultipleTeams
    ) {
      const otherMembership = await tx.sportsTeamMember.findFirst({
        where: {
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
          teamId: { not: application.requestedTeamId },
          team: {
            tournamentId: application.tournament.id,
            deletedAt: null,
          },
          participant: {
            personId: application.applicantPersonId,
            deletedAt: null,
          },
        },
        select: { id: true },
      });
      if (otherMembership) {
        throw new ConflictException('A pessoa já integra outra equipe neste torneio.');
      }
    }

    const participant = await this.payments.ensureParticipant(tx, {
      tournamentId: application.tournament.id,
      personId: application.applicantPersonId,
      source: SportsParticipantSource.SELF_SUBSCRIPTION,
      actorId,
      approved: true,
      paymentTier: application.paymentTier,
    });
    let teamMember = application.requestedTeamId
      ? await tx.sportsTeamMember.findFirst({
      where: {
        teamId: application.requestedTeamId,
        participantId: participant.id,
        deletedAt: null,
      },
      })
      : null;
    if (teamMember) {
      teamMember = await tx.sportsTeamMember.update({
        where: { id: teamMember.id },
        data: {
          status: SportsTeamMemberStatus.APPROVED,
          approvedAt: teamMember.approvedAt ?? new Date(),
          approvedById: teamMember.approvedById ?? actorId,
          rejectedAt: null,
          rejectedById: null,
          rejectionReason: null,
          updatedById: actorId,
        },
      });
    } else if (application.requestedTeamId) {
      teamMember = await tx.sportsTeamMember.create({
        data: {
          teamId: application.requestedTeamId,
          participantId: participant.id,
          status: SportsTeamMemberStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: actorId,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    }

    const eligibility =
      participant.status === SportsParticipantStatus.ACTIVE
        ? SportsEligibilityStatus.ELIGIBLE
        : SportsEligibilityStatus.PENDING;
    for (const registration of registrations) {
      if (!teamMember) {
        throw new ConflictException(
          'Não foi possível criar o vínculo com a equipe.',
        );
      }
      const existingAssignment = await tx.sportsRegistrationMember.findFirst({
        where: {
          registrationId: registration.id,
          teamMemberId: teamMember.id,
          role: SportsRosterRole.PLAYER,
          deletedAt: null,
        },
      });
      if (!existingAssignment) {
        await tx.sportsRegistrationMember.create({
          data: {
            registrationId: registration.id,
            categoryId: registration.categoryId,
            teamMemberId: teamMember.id,
            role: SportsRosterRole.PLAYER,
            eligibility,
            approvedAt: new Date(),
            approvedById: actorId,
            createdById: actorId,
            updatedById: actorId,
          },
        });
      } else if (
        (
          [
            SportsEligibilityStatus.PENDING,
            SportsEligibilityStatus.ELIGIBLE,
          ] as SportsEligibilityStatus[]
        ).includes(existingAssignment.eligibility) &&
        existingAssignment.eligibility !== eligibility
      ) {
        await tx.sportsRegistrationMember.update({
          where: { id: existingAssignment.id },
          data: {
            eligibility,
            approvedAt: existingAssignment.approvedAt ?? new Date(),
            approvedById: existingAssignment.approvedById ?? actorId,
            updatedById: actorId,
          },
        });
      }
    }

    const nextStatus =
      participant.status === SportsParticipantStatus.ACTIVE
        ? SportsApplicationStatus.ACTIVE
        : SportsApplicationStatus.WAITING_PAYMENT;
    const updated = await tx.sportsPlayerApplication.updateMany({
      where: {
        id: application.id,
        status: {
          in: [
            ...REVIEWABLE_APPLICATION_STATUSES,
            SportsApplicationStatus.APPROVED,
          ],
        },
      },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedById: actorId,
        reviewMessage,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('A solicitação mudou durante a aprovação. Tente novamente.');
    }

    const result = await this.getApplication(tx, application.id);
    await this.recordReviewAudit(tx, application, actor, nextStatus, {
      participantId: participant.id,
      teamMemberId: teamMember?.id ?? null,
      paymentEffective: participant.status === SportsParticipantStatus.ACTIVE,
    });
    return result;
  }

  private async loadApplicationTarget(
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
              in: [
                SportsCategoryStatus.REGISTRATION_OPEN,
                SportsCategoryStatus.ACTIVE,
              ],
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
    if (
      !tournament ||
      tournament.majorEvent.deletedAt
    ) {
      throw new BadRequestException(
        'O torneio selecionado não está disponível.',
      );
    }
    if (
      (!requestedTeamId && !tournament.selfSubscriptionAllowNoTeam) ||
      (requestedTeamId && tournament.teams.length !== 1)
    ) {
      throw new BadRequestException(
        'Selecione uma equipe disponível para este torneio.',
      );
    }
    if (
      (categoryIds.length === 0 &&
        !tournament.selfSubscriptionAllowNoCategory) ||
      tournament.categories.length !== categoryIds.length
    ) {
      throw new BadRequestException(
        'Selecione ao menos uma modalidade disponível para este torneio.',
      );
    }
    return tournament;
  }

  private assertSelfApplicationOpen(target: {
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
      (target.majorEvent.subscriptionStartDate &&
        now < target.majorEvent.subscriptionStartDate) ||
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

  private async loadApprovedTeamRegistrations(
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

  private assertReviewable(status: SportsApplicationStatus): void {
    if (
      !(
        REVIEWABLE_APPLICATION_STATUSES as readonly SportsApplicationStatus[]
      ).includes(status)
    ) {
      throw new ConflictException('Esta solicitação já foi analisada.');
    }
  }

  private normalizeCategoryIds(categoryIds: string[]): string[] {
    return [
      ...new Set(
        categoryIds.map((categoryId) => categoryId.trim()).filter(Boolean),
      ),
    ];
  }

  private applicationPendingKey(
    tournamentId: string,
    applicantPersonId: string,
    requestedTeamId: string | null,
  ): string {
    return `self:${tournamentId}:${applicantPersonId}:${requestedTeamId ?? 'no-team'}`;
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O usuário administrador não possui identificador.');
    }
    return actor.sub;
  }

  private getApplication(tx: Prisma.TransactionClient, applicationId: string) {
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

  private async recordReviewAudit(
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
