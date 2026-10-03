import { TicketEligibilityService } from './ticket-eligibility.service';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from '../events/attendance-eligibility';

describe('ticket eligibility', () => {
  it('counts only active major-event registration statuses for transfer policy', async () => {
    const f = eligibilityFixture({
      subscription: { subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null, paymentTier: null },
    });

    const result = await f.service.evaluateRecipientEligibility(f.tx as never, 'event-1', 'person-1');

    expect(result.eligible).toBe(true);
    expect(f.tx.majorEventSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
      }),
    }));
    expect(f.accountManager.lookupUsersByEmail).not.toHaveBeenCalled();
  });

  it('does not count rejected registration toward subscription eligibility', async () => {
    const f = eligibilityFixture({ subscription: null });

    const result = await f.service.evaluateRecipientEligibility(f.tx as never, 'event-1', 'person-1');

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('SUBSCRIPTION_REQUIRED');
    expect(f.tx.majorEventSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
      }),
    }));
  });

  it('requires a validated receipt for purchase even when registration permits transfer', async () => {
    const f = eligibilityFixture({
      subscription: { subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null, paymentTier: null },
    });

    const result = await f.service.evaluatePurchaseEligibility(f.tx as never, 'event-1', 'person-1');

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('SUBSCRIPTION_REQUIRED');
  });

  it('propagates Account Manager transport failures so queued recipient resolution can retry', async () => {
    const f = eligibilityFixture({ subscription: null, requiresVerification: true });
    f.accountManager.lookupUsersByEmail.mockRejectedValue(new Error('Account Manager unavailable'));

    await expect(f.service.prepareIdentitySnapshot('event-1', 'person-1', 'recipient'))
      .rejects.toThrow('Account Manager unavailable');
  });
});

function eligibilityFixture(input: {
  subscription: { subscriptionStatus: string; receiptValidatedAt: Date | null; paymentTier: string | null } | null;
  requiresVerification?: boolean;
}) {
  const event = {
    id: 'event-1',
    majorEventId: 'major-1',
    eventGroup: null,
    ticketConfig: {
      enabled: true,
      purchaseEnabled: true,
      recipientSubscriptionRequirement: 'REQUIRED',
      recipientRequiresUnesp: false,
      recipientAcademicIdPrefixes: [],
      recipientCourseCodes: [],
      recipientRequiresAccountManagerVerification: Boolean(input.requiresVerification),
      recipientAllowedPriceTierIds: [],
      purchaseRequiresUnesp: false,
      purchaseAcademicIdPrefixes: [],
      purchaseCourseCodes: [],
      purchaseRequiresAccountManagerVerification: false,
      purchaseVisiblePriceTierIds: [],
    },
  };
  const tx = {
    event: { findFirst: jest.fn().mockResolvedValue(event) },
    majorEventSubscription: { findFirst: jest.fn().mockResolvedValue(input.subscription) },
    eventSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    people: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'person-1',
        email: 'person@example.org',
        secondaryEmails: [],
        academicId: null,
        userId: 'user-1',
        user: { id: 'user-1', email: 'person@example.org', academicId: null },
      }),
    },
    priceTier: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue({ ticketConfig: event.ticketConfig }) },
    people: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'person-1',
        userId: 'user-1',
        email: 'person@example.org',
        user: { id: 'user-1', email: 'person@example.org' },
      }),
    },
  };
  const accountManager = { lookupUsersByEmail: jest.fn().mockResolvedValue([]) };
  const service = new TicketEligibilityService(prisma as never, accountManager as never);
  return { service, tx, accountManager };
}
