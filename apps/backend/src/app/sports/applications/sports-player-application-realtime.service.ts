import { SportsParticipantPaymentChangedPayload } from '@cacic-fct/shared-data-types';
import { Injectable, Logger } from '@nestjs/common';
import { CurrentUserDefaultRedirectService } from '../../current-user/default-redirect/current-user-default-redirect.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SseReplayService } from '../../realtime/sse-replay.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';

export type SportsApplicationRealtimeReason =
  | 'SUBMITTED'
  | 'REVIEWED'
  | 'RECEIPT_UPLOADED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_REVIEW_UNDONE';

@Injectable()
export class SportsPlayerApplicationRealtimeService {
  private readonly logger = new Logger(SportsPlayerApplicationRealtimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replay: SseReplayService,
    private readonly realtime: SportsRealtimeService,
    private readonly defaultRedirect: CurrentUserDefaultRedirectService,
  ) {}

  scope(personId: string): string {
    return this.replay.scope('sports-applications-person', personId);
  }

  async publishApplicationChanged(applicationId: string, reason: SportsApplicationRealtimeReason): Promise<void> {
    try {
      await this.publishApplicationChangedUnsafe(applicationId, reason);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not publish sports application change ${applicationId}; the committed change remains authoritative.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async publishApplicationChangedUnsafe(
    applicationId: string,
    reason: SportsApplicationRealtimeReason,
  ): Promise<void> {
    const application = await this.prisma.sportsPlayerApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        tournamentId: true,
        applicantPersonId: true,
        status: true,
        paymentTier: true,
        updatedAt: true,
      },
    });
    if (!application) {
      return;
    }
    await this.realtime.publish(this.scope(application.applicantPersonId), {
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      reason,
      applicationId: application.id,
      tournamentId: application.tournamentId,
      status: application.status,
      paymentTier: application.paymentTier,
      occurredAt: application.updatedAt.toISOString(),
    });
  }

  async publishPaymentChanged(subscriptionId: string, reason: SportsApplicationRealtimeReason): Promise<void> {
    try {
      await this.publishPaymentChangedUnsafe(subscriptionId, reason);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not publish sports payment change ${subscriptionId}; the committed change remains authoritative.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async publishPaymentChangedUnsafe(
    subscriptionId: string,
    reason: SportsApplicationRealtimeReason,
  ): Promise<void> {
    const subscription = await this.prisma.majorEventSubscription.findUnique({
      where: { id: subscriptionId },
      select: {
        subscriptionStatus: true,
        sportsTournamentParticipants: {
          select: {
            tournamentId: true,
            personId: true,
            status: true,
            paymentStatus: true,
          },
        },
      },
    });
    const participants = subscription?.sportsTournamentParticipants ?? [];
    if (!subscription || participants.length === 0) {
      return;
    }
    await Promise.all(
      participants.map(async (participant) => {
        const applications = await this.prisma.sportsPlayerApplication.findMany({
          where: {
            tournamentId: participant.tournamentId,
            applicantPersonId: participant.personId,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
          },
        });
        const payload: SportsParticipantPaymentChangedPayload = {
          type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
          reason,
          tournamentId: participant.tournamentId,
          subscriptionId,
          subscriptionStatus: subscription.subscriptionStatus,
          participantStatus: participant.status,
          paymentStatus: participant.paymentStatus,
          applications,
          occurredAt: new Date().toISOString(),
        };
        await Promise.all([
          this.realtime.publish(this.scope(participant.personId), payload),
          this.realtime.publish(this.realtime.scope('admin-tournament', participant.tournamentId), payload),
          this.defaultRedirect.invalidatePeople([participant.personId]),
        ]);
      }),
    );
  }
}
