import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, SportsApplicationStatus } from '@prisma/client';
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

export interface SubmitSportsPlayerApplicationInput {
  tournamentId: string;
  requestedTeamId?: string | null;
  categoryIds: string[];
  noticeAccepted: boolean;
  imageLicenseAgreementAccepted?: boolean | null;
  paymentTier?: string | null;
}
export type SportsPlayerApplicationReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
import { SportsPlayerApplicationApprovalService } from './sports-player-application-approval.service';

@Injectable()
export class SportsPlayerApplicationService extends SportsPlayerApplicationApprovalService {
  constructor(
    prisma: PrismaService,
    payments: SportsPaymentService,
    auditLog: AuditLogService,
    @Inject(SportsPlayerApplicationRealtimeService)
    realtime: Pick<SportsPlayerApplicationRealtimeService, 'publishApplicationChanged'> = {
      publishApplicationChanged: async () => undefined,
    },
  ) {
    super(prisma, payments, auditLog, realtime);
  }

  async submitSelfApplication(
    input: SubmitSportsPlayerApplicationInput,
    applicantPersonId: string,
    actor: AuthenticatedUser,
  ) {
    if (!input.noticeAccepted) {
      throw new BadRequestException('Confirme que a inscrição não garante sua escalação antes de continuar.');
    }
    const requestedTeamId = input.requestedTeamId?.trim() || null;
    const categoryIds = this.normalizeCategoryIds(input.categoryIds);
    const pendingKey = this.applicationPendingKey(input.tournamentId, applicantPersonId, requestedTeamId);

    const application = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const target = await this.loadApplicationTarget(tx, input.tournamentId, requestedTeamId, categoryIds);
      this.assertSelfApplicationOpen(target);
      this.ensureImageLicenseAgreementAccepted(
        target.majorEvent.requiresImageLicenseAgreement,
        input.imageLicenseAgreementAccepted,
        `o torneio ${input.tournamentId}`,
      );
      const paymentSelection = resolveMajorEventSelfServicePayment(target.majorEvent, input.paymentTier);
      if (!target.allowPlayerMultipleTeams) {
        const pendingOtherTeam = await tx.sportsPlayerApplication.findFirst({
          where: {
            tournamentId: input.tournamentId,
            applicantPersonId,
            ...(requestedTeamId
              ? {
                  OR: [{ requestedTeamId: null }, { requestedTeamId: { not: requestedTeamId } }],
                }
              : { requestedTeamId: { not: null } }),
            status: { in: [...REVIEWABLE_APPLICATION_STATUSES] },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (pendingOtherTeam) {
          throw new ConflictException('Já existe uma solicitação pendente para outra equipe neste torneio.');
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
          imageLicenseAgreementAccepted: input.imageLicenseAgreementAccepted === true,
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
      const existingCategoryIds = application.categoryChoices.map((choice) => choice.categoryId).sort();
      const normalizedCategoryIds = [...categoryIds].sort();
      const imageLicenseAgreementAccepted = input.imageLicenseAgreementAccepted === true;
      const isImageLicenseAgreementUpdate = imageLicenseAgreementAccepted && !application.imageLicenseAgreementAccepted;
      const isIdenticalPendingSubmission =
        application.requestedTeamId === requestedTeamId &&
        application.paymentTier === paymentSelection.paymentTier &&
        existingCategoryIds.length === normalizedCategoryIds.length &&
        existingCategoryIds.every((categoryId, index) => categoryId === normalizedCategoryIds[index]) &&
        !isImageLicenseAgreementUpdate;

      if (!(REVIEWABLE_APPLICATION_STATUSES as readonly SportsApplicationStatus[]).includes(application.status)) {
        if (
          (IDEMPOTENT_APPROVAL_STATUSES as readonly SportsApplicationStatus[]).includes(application.status) &&
          isIdenticalPendingSubmission
        ) {
          return this.getApplication(tx, application.id);
        }
        throw new ConflictException('Esta solicitação já foi analisada e não pode ser substituída.');
      }
      if (application.status === SportsApplicationStatus.PENDING && isIdenticalPendingSubmission) {
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
          imageLicenseAgreementAccepted: application.imageLicenseAgreementAccepted || imageLicenseAgreementAccepted,
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
            imageLicenseAgreementAccepted: application.imageLicenseAgreementAccepted,
          },
          after: {
            status: SportsApplicationStatus.PENDING,
            requestedTeamId,
            categoryIds,
            noticeAccepted: true,
            imageLicenseAgreementAccepted: application.imageLicenseAgreementAccepted || imageLicenseAgreementAccepted,
            paymentTier: paymentSelection.paymentTier,
          },
          summary: 'Solicitação individual enviada para análise.',
          scope: { majorEventId: target.majorEventId },
        },
        tx,
      );
      return this.getApplication(tx, application.id);
    });
    await this.realtime.publishApplicationChanged(application.id, 'SUBMITTED');
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

    const application = await runSerializableSportsTransaction(this.prisma, async (tx) => {
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
        if ((IDEMPOTENT_APPROVAL_STATUSES as readonly SportsApplicationStatus[]).includes(application.status)) {
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
            throw new ConflictException('A solicitação mudou durante a aprovação.');
          }
          await this.recordReviewAudit(tx, application, actor, SportsApplicationStatus.APPROVED, {
            awaitingTeamRepresentative: true,
          });
          return this.getApplication(tx, application.id);
        }
        return this.approveApplication(tx, application, actor, actorId, reviewMessage);
      }

      this.assertReviewable(application.status);
      const nextStatus =
        decision === 'REJECT' ? SportsApplicationStatus.REJECTED : SportsApplicationStatus.CHANGES_REQUESTED;
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
    });
    await this.realtime.publishApplicationChanged(application.id, 'REVIEWED');
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
    const application = await runSerializableSportsTransaction(this.prisma, async (tx) => {
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
        throw new NotFoundException('Solicitação aprovada para esta equipe não encontrada.');
      }
      if (approved) {
        return this.approveApplication(tx, application, actor, actorId, reviewMessage);
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
        throw new ConflictException('A solicitação mudou durante a análise da equipe.');
      }
      await this.recordReviewAudit(tx, application, actor, SportsApplicationStatus.REJECTED, {
        representativeDecision: 'REJECTED',
      });
      return this.getApplication(tx, application.id);
    });
    await this.realtime.publishApplicationChanged(application.id, 'REVIEWED');
    return application;
  }
}
