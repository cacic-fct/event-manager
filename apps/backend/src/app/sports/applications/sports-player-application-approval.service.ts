import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsRosterRole,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

const REVIEWABLE_APPLICATION_STATUSES = [
  SportsApplicationStatus.PENDING,
  SportsApplicationStatus.CHANGES_REQUESTED,
] as const;

export interface SubmitSportsPlayerApplicationInput {
  tournamentId: string;
  requestedTeamId?: string | null;
  categoryIds: string[];
  noticeAccepted: boolean;
  paymentTier?: string | null;
}

export type SportsPlayerApplicationReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
import { SportsPlayerApplicationSupportService } from './sports-player-application-support.service';

export abstract class SportsPlayerApplicationApprovalService extends SportsPlayerApplicationSupportService {
  protected async approveApplication(
    tx: Prisma.TransactionClient,
    application: {
      id: string;
      applicantPersonId: string;
      requestedTeamId: string | null;
      status: SportsApplicationStatus;
      categoryChoices: Array<{ categoryId: string }>;
      imageLicenseAgreementAccepted?: boolean;
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

    if (application.requestedTeamId && !application.tournament.allowPlayerMultipleTeams) {
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
      ...(application.imageLicenseAgreementAccepted ? { imageLicenseAgreementAccepted: true } : {}),
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
        throw new ConflictException('Não foi possível criar o vínculo com a equipe.');
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
        ([SportsEligibilityStatus.PENDING, SportsEligibilityStatus.ELIGIBLE] as SportsEligibilityStatus[]).includes(
          existingAssignment.eligibility,
        ) &&
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
          in: [...REVIEWABLE_APPLICATION_STATUSES, SportsApplicationStatus.APPROVED],
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
}
