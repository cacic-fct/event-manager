import {
  SportsPlayerApplicationRealtimeService,
} from './sports-player-application-realtime.service';

describe('SportsPlayerApplicationRealtimeService', () => {
  const prisma = {
    sportsPlayerApplication: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    majorEventSubscription: {
      findUnique: jest.fn(),
    },
  };
  const replay = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
  };
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const defaultRedirect = {
    invalidatePeople: jest.fn().mockResolvedValue(undefined),
  };
  let service: SportsPlayerApplicationRealtimeService;

  beforeEach(() => {
    jest.clearAllMocks();
    realtime.publish.mockResolvedValue(undefined);
    defaultRedirect.invalidatePeople.mockResolvedValue(undefined);
    service = new SportsPlayerApplicationRealtimeService(
      prisma as never,
      replay as never,
      realtime as never,
      defaultRedirect as never,
    );
  });

  it('publishes an opaque application invalidation only to its applicant', async () => {
    const updatedAt = new Date('2026-07-29T12:00:00.000Z');
    prisma.sportsPlayerApplication.findUnique.mockResolvedValue({
      id: 'application-1',
      tournamentId: 'tournament-1',
      applicantPersonId: 'person-1',
      status: 'PENDING',
      paymentTier: 'Estudante',
      updatedAt,
    });

    await service.publishApplicationChanged('application-1', 'SUBMITTED');

    expect(realtime.publish).toHaveBeenCalledWith(
      'sports-applications-person:person-1',
      {
        type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
        reason: 'SUBMITTED',
        applicationId: 'application-1',
        tournamentId: 'tournament-1',
        status: 'PENDING',
        paymentTier: 'Estudante',
        occurredAt: updatedAt.toISOString(),
      },
    );
  });

  it('publishes payment changes to the person and admin scopes and invalidates routing', async () => {
    prisma.majorEventSubscription.findUnique.mockResolvedValue({
      subscriptionStatus: 'CONFIRMED',
      sportsTournamentParticipant: {
        tournamentId: 'tournament-1',
        personId: 'person-1',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
      },
    });
    prisma.sportsPlayerApplication.findMany.mockResolvedValue([
      { id: 'application-1', status: 'ACTIVE' },
    ]);

    await service.publishPaymentChanged(
      'subscription-1',
      'PAYMENT_APPROVED',
    );

    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'sports-applications-person:person-1',
      expect.objectContaining({
        type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
        tournamentId: 'tournament-1',
        subscriptionId: 'subscription-1',
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      expect.objectContaining({
        type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
      }),
    );
    expect(defaultRedirect.invalidatePeople).toHaveBeenCalledWith([
      'person-1',
    ]);
  });

  it('does nothing for subscriptions unrelated to sports', async () => {
    prisma.majorEventSubscription.findUnique.mockResolvedValue({
      subscriptionStatus: 'CONFIRMED',
      sportsTournamentParticipant: null,
    });

    await service.publishPaymentChanged(
      'subscription-1',
      'PAYMENT_APPROVED',
    );

    expect(realtime.publish).not.toHaveBeenCalled();
    expect(defaultRedirect.invalidatePeople).not.toHaveBeenCalled();
  });

  it('does not make a committed mutation appear failed when publication infrastructure fails', async () => {
    prisma.sportsPlayerApplication.findUnique.mockRejectedValue(
      new Error('database temporarily unavailable'),
    );

    await expect(
      service.publishApplicationChanged('application-1', 'REVIEWED'),
    ).resolves.toBeUndefined();
  });
});
