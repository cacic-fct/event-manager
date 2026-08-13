import { BadRequestException } from '@nestjs/common';
import {
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SubscriptionCreationMethod,
  SubscriptionStatus,
} from '@prisma/client';
import { refreshSportsParticipantForSubscription, SportsPaymentService } from './sports-payment.service';

describe('SportsPaymentService', () => {
  let service: SportsPaymentService;
  let tx: ReturnType<typeof createTx>;

  beforeEach(() => {
    service = new SportsPaymentService();
    tx = createTx();
  });

  it('serializes participant creation by tournament and person', async () => {
    await service.ensureParticipant(tx as never, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.TEAM_ASSIGNMENT,
      actorId: 'admin-1',
      approved: true,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([expect.stringContaining('pg_advisory_xact_lock')]),
    );
    expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe('sports-participant:tournament-1:person-1');
  });

  it('enables receipt upload for an approved team-assigned participant in a paid tournament', async () => {
    await service.ensureParticipant(tx as never, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.TEAM_ASSIGNMENT,
      actorId: 'admin-1',
      approved: true,
    });

    expect(tx.majorEventSubscription.create).toHaveBeenCalledWith({
      data: {
        majorEventId: 'major-1',
        personId: 'person-1',
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
        createdById: 'admin-1',
        createdByMethod: SubscriptionCreationMethod.ADMIN_DASHBOARD,
        amountPaid: null,
        paymentTier: null,
      },
      select: {
        id: true,
        subscriptionStatus: true,
        amountPaid: true,
        paymentTier: true,
      },
    });
    expect(tx.sportsTournamentParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SportsParticipantStatus.WAITING_PAYMENT,
          paymentStatus: SportsPaymentStatus.WAITING_PAYMENT,
          majorEventSubscriptionId: 'subscription-1',
        }),
      }),
    );
  });

  it('requires and carries image-license acceptance for self-subscription participants', async () => {
    tx.sportsTournament.findFirst.mockResolvedValue({
      id: 'tournament-1',
      majorEventId: 'major-1',
      majorEvent: {
        isPaymentRequired: false,
        requiresImageLicenseAgreement: true,
        deletedAt: null,
        majorEventPrices: [],
      },
    });

    await expect(
      service.ensureParticipant(tx as never, {
        tournamentId: 'tournament-1',
        personId: 'person-1',
        source: SportsParticipantSource.SELF_SUBSCRIPTION,
        approved: true,
        imageLicenseAgreementAccepted: false,
      }),
    ).rejects.toThrow(BadRequestException);

    await service.ensureParticipant(tx as never, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.SELF_SUBSCRIPTION,
      approved: true,
      imageLicenseAgreementAccepted: true,
    });

    expect(tx.majorEventSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageLicenseAgreementAccepted: true,
        }),
      }),
    );
  });

  it('reuses an existing subscription and upgrades a self-application source without duplicates', async () => {
    tx.sportsTournamentParticipant.findFirst.mockResolvedValue({
      id: 'participant-1',
      source: SportsParticipantSource.SELF_SUBSCRIPTION,
      approvedAt: null,
      approvedById: null,
      majorEventSubscriptionId: null,
    });
    tx.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-existing',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      amountPaid: null,
      paymentTier: null,
    });

    await service.ensureParticipant(tx as never, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.TEAM_ASSIGNMENT,
      actorId: 'admin-1',
      approved: true,
    });

    expect(tx.majorEventSubscription.create).not.toHaveBeenCalled();
    expect(tx.sportsTournamentParticipant.create).not.toHaveBeenCalled();
    expect(tx.sportsTournamentParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          source: SportsParticipantSource.TEAM_ASSIGNMENT,
          majorEventSubscriptionId: 'subscription-existing',
          status: SportsParticipantStatus.WAITING_PAYMENT,
        }),
      }),
    );
  });

  it('reopens a canceled paid subscription so a team-assigned player can upload a receipt', async () => {
    tx.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-existing',
      subscriptionStatus: SubscriptionStatus.CANCELED,
      amountPaid: null,
      paymentTier: null,
    });
    tx.majorEventSubscription.update.mockResolvedValue({
      id: 'subscription-existing',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
    });

    await service.ensureParticipant(tx as never, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.TEAM_ASSIGNMENT,
      actorId: 'admin-1',
      approved: true,
    });

    expect(tx.majorEventSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'subscription-existing' },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
          receiptRejectionReason: null,
        }),
      }),
    );
  });

  it('activates paid participation, category eligibility, and its approved application together', async () => {
    tx.majorEventSubscription.findUnique.mockResolvedValue({
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      majorEvent: { isPaymentRequired: true },
      sportsTournamentParticipants: [
        {
          id: 'participant-1',
          tournamentId: 'tournament-1',
          personId: 'person-1',
          approvedAt: new Date(),
        },
      ],
    });

    await refreshSportsParticipantForSubscription(tx as never, 'subscription-1');

    expect(tx.sportsTournamentParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: {
        status: SportsParticipantStatus.ACTIVE,
        paymentStatus: SportsPaymentStatus.PAID,
      },
    });
    expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eligibility: SportsEligibilityStatus.PENDING,
        }),
        data: {
          eligibility: SportsEligibilityStatus.ELIGIBLE,
        },
      }),
    );
    expect(tx.sportsPlayerApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              SportsApplicationStatus.APPROVED,
              SportsApplicationStatus.WAITING_PAYMENT,
              SportsApplicationStatus.ACTIVE,
            ],
          },
        }),
        data: {
          status: SportsApplicationStatus.ACTIVE,
        },
      }),
    );
  });

  it('is a no-op for subscriptions unrelated to sports', async () => {
    tx.majorEventSubscription.findUnique.mockResolvedValue({
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      majorEvent: { isPaymentRequired: true },
      sportsTournamentParticipant: null,
    });

    await refreshSportsParticipantForSubscription(tx as never, 'subscription-1');

    expect(tx.sportsTournamentParticipant.update).not.toHaveBeenCalled();
    expect(tx.sportsRegistrationMember.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsPlayerApplication.updateMany).not.toHaveBeenCalled();
  });
});

function createTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    sportsTournament: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        majorEventId: 'major-1',
        majorEvent: {
          isPaymentRequired: true,
          deletedAt: null,
          majorEventPrices: [],
        },
      }),
    },
    sportsTournamentParticipant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'participant-1',
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }) => ({
        id: 'participant-1',
        ...data,
      })),
    },
    majorEventSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({
        id: 'subscription-1',
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      }),
      update: jest.fn(),
    },
    sportsRegistrationMember: {
      updateMany: jest.fn(),
    },
    sportsPlayerApplication: {
      updateMany: jest.fn(),
    },
  };
}
