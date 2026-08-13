import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SubscriptionCreationMethod,
  SubscriptionStatus,
} from '@prisma/client';
import {
  MajorEventPaymentSelection,
  resolveMajorEventSelfServicePayment,
} from '../current-user/major-events/major-event-payment-selection';

type ParticipantApprovalInput = {
  tournamentId: string;
  personId: string;
  source: SportsParticipantSource;
  actorId?: string;
  approved: boolean;
  imageLicenseAgreementAccepted?: boolean | null;
  paymentTier?: string | null;
};

const REJECTED_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.REJECTED_GENERIC,
  SubscriptionStatus.REJECTED_INVALID_RECEIPT,
  SubscriptionStatus.REJECTED_NO_SLOTS,
  SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT,
  SubscriptionStatus.CANCELED,
]);

@Injectable()
export class SportsPaymentService {
  async ensureParticipant(tx: Prisma.TransactionClient, input: ParticipantApprovalInput) {
    await this.lockParticipantIdentity(tx, input.tournamentId, input.personId);

    const tournament = await tx.sportsTournament.findFirst({
      where: {
        id: input.tournamentId,
        deletedAt: null,
      },
      select: {
        id: true,
        majorEventId: true,
        majorEvent: {
          select: {
            isPaymentRequired: true,
            requiresImageLicenseAgreement: true,
            deletedAt: true,
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
      },
    });
    if (!tournament || tournament.majorEvent.deletedAt) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    if (
      input.source === SportsParticipantSource.SELF_SUBSCRIPTION &&
      tournament.majorEvent.requiresImageLicenseAgreement &&
      input.imageLicenseAgreementAccepted !== true
    ) {
      throw new BadRequestException(
        'A autoinscrição esportiva exige a concordância com o contrato de licença de uso de imagem do CACiC.',
      );
    }

    const existingParticipant = await tx.sportsTournamentParticipant.findFirst({
      where: {
        tournamentId: input.tournamentId,
        personId: input.personId,
        deletedAt: null,
      },
    });
    const paymentSelection = this.resolvePaymentSelection(tournament.majorEvent, input);
    const subscription = await this.ensureMajorEventSubscription(tx, {
      majorEventId: tournament.majorEventId,
      personId: input.personId,
      paymentRequired: tournament.majorEvent.isPaymentRequired,
      source: input.source,
      actorId: input.actorId,
      preferredSubscriptionId: existingParticipant?.majorEventSubscriptionId ?? null,
      paymentSelection,
      imageLicenseAgreementAccepted: input.imageLicenseAgreementAccepted,
    });
    const approved = input.approved || existingParticipant?.approvedAt != null;
    const participantStatus = resolveParticipantStatus(subscription.subscriptionStatus, approved);
    const paymentStatus = resolvePaymentStatus(
      tournament.majorEvent.isPaymentRequired,
      subscription.subscriptionStatus,
      approved,
    );

    if (existingParticipant) {
      return tx.sportsTournamentParticipant.update({
        where: { id: existingParticipant.id },
        data: {
          source: resolveParticipantSource(existingParticipant.source, input.source),
          status: participantStatus,
          paymentStatus,
          majorEventSubscriptionId: subscription.id,
          approvedAt: approved ? (existingParticipant.approvedAt ?? new Date()) : null,
          approvedById: approved ? (existingParticipant.approvedById ?? input.actorId ?? null) : null,
          updatedById: input.actorId,
        },
      });
    }

    return tx.sportsTournamentParticipant.create({
      data: {
        tournamentId: input.tournamentId,
        personId: input.personId,
        source: input.source,
        status: participantStatus,
        paymentStatus,
        majorEventSubscriptionId: subscription.id,
        approvedAt: approved ? new Date() : null,
        approvedById: approved ? (input.actorId ?? null) : null,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }

  private async lockParticipantIdentity(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    personId: string,
  ): Promise<void> {
    const lockKey = `sports-participant:${tournamentId}:${personId}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  async refreshParticipantForSubscription(tx: Prisma.TransactionClient, subscriptionId: string): Promise<void> {
    await refreshSportsParticipantForSubscription(tx, subscriptionId);
  }

  private async ensureMajorEventSubscription(
    tx: Prisma.TransactionClient,
    input: {
      majorEventId: string;
      personId: string;
      paymentRequired: boolean;
      source: SportsParticipantSource;
      actorId?: string;
      preferredSubscriptionId: string | null;
      paymentSelection: MajorEventPaymentSelection;
      imageLicenseAgreementAccepted?: boolean | null;
    },
  ): Promise<{ id: string; subscriptionStatus: SubscriptionStatus }> {
    let existingSubscription = input.preferredSubscriptionId
      ? await tx.majorEventSubscription.findFirst({
          where: {
            id: input.preferredSubscriptionId,
            majorEventId: input.majorEventId,
            personId: input.personId,
            deletedAt: null,
          },
          select: {
            id: true,
            subscriptionStatus: true,
            imageLicenseAgreementAccepted: true,
            amountPaid: true,
            paymentTier: true,
          },
        })
      : null;
    existingSubscription ??= await tx.majorEventSubscription.findFirst({
      where: {
        majorEventId: input.majorEventId,
        personId: input.personId,
        deletedAt: null,
      },
      select: {
        id: true,
        subscriptionStatus: true,
        imageLicenseAgreementAccepted: true,
        amountPaid: true,
        paymentTier: true,
      },
    });
    if (existingSubscription) {
      const reopenedStatus = resolveReusableSubscriptionStatus(
        existingSubscription.subscriptionStatus,
        input.paymentRequired,
      );
      const wasReopened = reopenedStatus !== existingSubscription.subscriptionStatus;
      const shouldUpdatePayment =
        existingSubscription.subscriptionStatus !== SubscriptionStatus.CONFIRMED &&
        (existingSubscription.amountPaid !== input.paymentSelection.amountPaid ||
          existingSubscription.paymentTier !== input.paymentSelection.paymentTier);
      const shouldUpdateImageLicenseAgreement =
        input.imageLicenseAgreementAccepted === true && !existingSubscription.imageLicenseAgreementAccepted;
      if (
        reopenedStatus === existingSubscription.subscriptionStatus &&
        !shouldUpdatePayment &&
        !shouldUpdateImageLicenseAgreement
      ) {
        return existingSubscription;
      }
      return tx.majorEventSubscription.update({
        where: { id: existingSubscription.id },
        data: {
          subscriptionStatus: reopenedStatus,
          ...(wasReopened
            ? {
                receiptRejectionReason: null,
                receiptValidatedAt: null,
                receiptValidatedBy: null,
              }
            : {}),
          ...(shouldUpdatePayment
            ? {
                amountPaid: input.paymentSelection.amountPaid,
                paymentTier: input.paymentSelection.paymentTier,
              }
            : {}),
          ...(shouldUpdateImageLicenseAgreement ? { imageLicenseAgreementAccepted: true } : {}),
        },
        select: {
          id: true,
          subscriptionStatus: true,
          amountPaid: true,
          paymentTier: true,
        },
      });
    }

    return tx.majorEventSubscription.create({
      data: {
        majorEventId: input.majorEventId,
        personId: input.personId,
        subscriptionStatus: input.paymentRequired
          ? SubscriptionStatus.WAITING_RECEIPT_UPLOAD
          : SubscriptionStatus.CONFIRMED,
        createdById: input.actorId,
        amountPaid: input.paymentSelection.amountPaid,
        paymentTier: input.paymentSelection.paymentTier,
        ...(input.imageLicenseAgreementAccepted === true ? { imageLicenseAgreementAccepted: true } : {}),
        createdByMethod:
          input.source === SportsParticipantSource.SELF_SUBSCRIPTION
            ? SubscriptionCreationMethod.SELF_SUBSCRIPTION
            : SubscriptionCreationMethod.ADMIN_DASHBOARD,
      },
      select: {
        id: true,
        subscriptionStatus: true,
        amountPaid: true,
        paymentTier: true,
      },
    });
  }

  private resolvePaymentSelection(
    majorEvent: {
      isPaymentRequired: boolean;
      majorEventPrices: Array<{
        tiers: Array<{ name: string; value: number }>;
      }>;
    },
    input: ParticipantApprovalInput,
  ): MajorEventPaymentSelection {
    const tierCount = majorEvent.majorEventPrices.reduce((count, price) => count + price.tiers.length, 0);
    if (
      input.source === SportsParticipantSource.SELF_SUBSCRIPTION ||
      input.paymentTier !== undefined ||
      tierCount <= 1
    ) {
      return resolveMajorEventSelfServicePayment(majorEvent, input.paymentTier);
    }
    return {
      amountPaid: null,
      paymentTier: null,
    };
  }
}

export async function refreshSportsParticipantForSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
): Promise<void> {
  const subscription = await tx.majorEventSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      subscriptionStatus: true,
      majorEvent: {
        select: {
          isPaymentRequired: true,
        },
      },
      sportsTournamentParticipants: {
        select: {
          id: true,
          tournamentId: true,
          personId: true,
          approvedAt: true,
        },
      },
    },
  });
  const participants = subscription?.sportsTournamentParticipants ?? [];
  if (!subscription || participants.length === 0) {
    return;
  }

  for (const participant of participants) {
    const approved = participant.approvedAt !== null;
    const participantStatus = resolveParticipantStatus(subscription.subscriptionStatus, approved);
    const paymentStatus = resolvePaymentStatus(
      subscription.majorEvent.isPaymentRequired,
      subscription.subscriptionStatus,
      approved,
    );
    await tx.sportsTournamentParticipant.update({
      where: { id: participant.id },
      data: {
        status: participantStatus,
        paymentStatus,
      },
    });

    await tx.sportsRegistrationMember.updateMany({
      where: {
        teamMember: {
          participantId: participant.id,
          deletedAt: null,
        },
        deletedAt: null,
        eligibility:
          participantStatus === SportsParticipantStatus.ACTIVE
            ? SportsEligibilityStatus.PENDING
            : SportsEligibilityStatus.ELIGIBLE,
      },
      data: {
        eligibility:
          participantStatus === SportsParticipantStatus.ACTIVE
            ? SportsEligibilityStatus.ELIGIBLE
            : SportsEligibilityStatus.PENDING,
      },
    });

    await tx.sportsPlayerApplication.updateMany({
      where: {
        tournamentId: participant.tournamentId,
        applicantPersonId: participant.personId,
        deletedAt: null,
        status: {
          in: [
            SportsApplicationStatus.APPROVED,
            SportsApplicationStatus.WAITING_PAYMENT,
            SportsApplicationStatus.ACTIVE,
          ],
        },
      },
      data: {
        status:
          participantStatus === SportsParticipantStatus.ACTIVE
            ? SportsApplicationStatus.ACTIVE
            : SportsApplicationStatus.WAITING_PAYMENT,
      },
    });
  }
}

function resolveReusableSubscriptionStatus(status: SubscriptionStatus, paymentRequired: boolean): SubscriptionStatus {
  if (!paymentRequired) {
    return SubscriptionStatus.CONFIRMED;
  }
  if (status === SubscriptionStatus.CANCELED) {
    return SubscriptionStatus.WAITING_RECEIPT_UPLOAD;
  }
  return status;
}

function resolveParticipantStatus(subscriptionStatus: SubscriptionStatus, approved: boolean): SportsParticipantStatus {
  if (!approved) {
    return SportsParticipantStatus.PENDING;
  }
  if (subscriptionStatus === SubscriptionStatus.CONFIRMED) {
    return SportsParticipantStatus.ACTIVE;
  }
  if (REJECTED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return SportsParticipantStatus.REJECTED;
  }
  return SportsParticipantStatus.WAITING_PAYMENT;
}

function resolvePaymentStatus(
  paymentRequired: boolean,
  subscriptionStatus: SubscriptionStatus,
  approved: boolean,
): SportsPaymentStatus {
  if (!paymentRequired) {
    return SportsPaymentStatus.NOT_REQUIRED;
  }
  if (!approved) {
    return SportsPaymentStatus.WAITING_APPROVAL;
  }
  if (subscriptionStatus === SubscriptionStatus.CONFIRMED) {
    return SportsPaymentStatus.PAID;
  }
  if (subscriptionStatus === SubscriptionStatus.RECEIPT_UNDER_REVIEW) {
    return SportsPaymentStatus.UNDER_REVIEW;
  }
  if (REJECTED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return SportsPaymentStatus.REJECTED;
  }
  return SportsPaymentStatus.WAITING_PAYMENT;
}

function resolveParticipantSource(
  current: SportsParticipantSource,
  incoming: SportsParticipantSource,
): SportsParticipantSource {
  const priority: Record<SportsParticipantSource, number> = {
    [SportsParticipantSource.SELF_SUBSCRIPTION]: 0,
    [SportsParticipantSource.TEAM_ASSIGNMENT]: 1,
    [SportsParticipantSource.ADMIN]: 2,
  };
  return priority[incoming] > priority[current] ? incoming : current;
}
