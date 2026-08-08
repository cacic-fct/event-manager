import { BadRequestException } from '@nestjs/common';
import {
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { EventSubscriptionSyncService } from '../../events/event-subscription-sync.service';
import { ReceiptSubscriptionSyncService } from './receipt-subscription-sync.service';

describe('EventSubscriptionSyncService', () => {
  let service: EventSubscriptionSyncService;

  beforeEach(() => {
    service = new EventSubscriptionSyncService();
  });

  it('archives unselected active event subscriptions and creates missing confirmed ones', async () => {
    const tx = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: 'event-1' }, { eventId: 'event-2' }]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn(),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-3', slots: null }]),
      },
    };

    await service.syncMajorEventConfirmedSubscriptions(
      tx as never,
      'major-1',
      'person-1',
      ['event-2', 'event-3'],
      SubscriptionStatus.CONFIRMED,
      'admin-1',
    );

    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-1'],
          },
        }),
      }),
    );
    expect(tx.eventSubscription.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: 'event-3',
          personId: 'person-1',
          createdById: 'admin-1',
          createdByMethod: 'ADMIN_DASHBOARD',
        },
      ],
    });
  });

  it('archives all active event subscriptions for non-confirmed statuses', async () => {
    const tx = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: 'event-1' }]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await service.syncMajorEventConfirmedSubscriptions(
      tx as never,
      'major-1',
      'person-1',
      ['event-1'],
      SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      'admin-1',
    );

    expect(tx.eventSubscription.updateMany).toHaveBeenCalled();
    expect(tx.eventSubscription.createMany).not.toHaveBeenCalled();
  });

  it('blocks creation when a target event has no available slots', async () => {
    const tx = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1', slots: 1 }]),
      },
    };

    await expect(
      service.syncMajorEventConfirmedSubscriptions(
        tx as never,
        'major-1',
        'person-1',
        ['event-1'],
        SubscriptionStatus.CONFIRMED,
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.eventSubscription.createMany).not.toHaveBeenCalled();
  });
});

describe('ReceiptSubscriptionSyncService', () => {
  it('delegates confirmed subscription sync to the shared event subscription service', async () => {
    const counters = {
      refresh: jest.fn(),
    };
    const eventSubscriptions = {
      syncMajorEventConfirmedSubscriptions: jest.fn(),
    };
    const service = new ReceiptSubscriptionSyncService(counters as never, eventSubscriptions as never);
    const tx = {};

    await service.syncConfirmedEventSubscriptions(
      tx as never,
      'major-1',
      'person-1',
      ['event-1'],
      SubscriptionStatus.CONFIRMED,
      'admin-1',
    );

    expect(eventSubscriptions.syncMajorEventConfirmedSubscriptions).toHaveBeenCalledWith(
      tx,
      'major-1',
      'person-1',
      ['event-1'],
      SubscriptionStatus.CONFIRMED,
      'admin-1',
    );
  });

  it('delegates counter refresh to the shared counter service', async () => {
    const counters = {
      refresh: jest.fn(),
    };
    const eventSubscriptions = {
      syncMajorEventConfirmedSubscriptions: jest.fn(),
    };
    const service = new ReceiptSubscriptionSyncService(counters as never, eventSubscriptions as never);
    const tx = {};

    await service.refreshEventSubscriptionCounters(tx as never, ['event-1', 'event-1', 'event-2']);

    expect(counters.refresh).toHaveBeenCalledWith(tx, ['event-1', 'event-1', 'event-2']);
  });

  it('refreshes sports payment effectiveness through the shared subscription state', async () => {
    const counters = {
      refresh: jest.fn(),
    };
    const eventSubscriptions = {
      syncMajorEventConfirmedSubscriptions: jest.fn(),
    };
    const service = new ReceiptSubscriptionSyncService(counters as never, eventSubscriptions as never);
    const tx = {
      majorEventSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          subscriptionStatus: SubscriptionStatus.CONFIRMED,
          majorEvent: { isPaymentRequired: true },
          sportsTournamentParticipant: {
            id: 'participant-1',
            tournamentId: 'tournament-1',
            personId: 'person-1',
            approvedAt: new Date(),
          },
        }),
      },
      sportsTournamentParticipant: {
        update: jest.fn(),
      },
      sportsRegistrationMember: {
        updateMany: jest.fn(),
      },
      sportsPlayerApplication: {
        updateMany: jest.fn(),
      },
    };

    await service.refreshSportsParticipantPayment(tx as never, 'subscription-1');

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
        data: {
          status: SportsApplicationStatus.ACTIVE,
        },
      }),
    );
  });
});
