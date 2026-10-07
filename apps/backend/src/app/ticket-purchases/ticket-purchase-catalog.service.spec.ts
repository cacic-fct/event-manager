import { hasValidatedSubscriptionReceipt, selectTicketPrice, TicketPurchaseCatalogService } from './ticket-purchase-catalog.service';

describe('ticket purchase availability', () => {
  it('requires a validated receipt before showing purchase offers', () => {
    const now = new Date();
    expect(hasValidatedSubscriptionReceipt(null)).toBe(false);
    expect(hasValidatedSubscriptionReceipt({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null })).toBe(false);
    expect(hasValidatedSubscriptionReceipt({ subscriptionStatus: 'RECEIPT_UNDER_REVIEW', receiptValidatedAt: now })).toBe(false);
    expect(hasValidatedSubscriptionReceipt({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: now, deletedAt: now })).toBe(false);
    expect(hasValidatedSubscriptionReceipt({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: now })).toBe(true);
  });

  it('prefers the subscription tier, falling back to configured fixed pricing', () => {
    const prices = [
      { priceTierId: null, amountCents: 3000 },
      { priceTierId: 'premium', amountCents: 1000 },
    ];
    expect(selectTicketPrice(prices, 'premium')?.amountCents).toBe(1000);
    expect(selectTicketPrice(prices, 'standard')?.amountCents).toBe(3000);
    expect(selectTicketPrice(prices.slice(1), 'standard')).toBeUndefined();
    expect(selectTicketPrice(prices.slice(1), null)).toBeUndefined();
  });

  it('does not read hidden offers or evaluate recipients when payment is unvalidated', async () => {
    const eligibility = { evaluatePurchaseEligibility: jest.fn() };
    const tx = {
      majorEventSubscription: { findFirst: jest.fn().mockResolvedValue({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null }) },
      ticketConfig: { findMany: jest.fn() },
    };
    const service = new TicketPurchaseCatalogService(eligibility as never);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toEqual([]);
    expect(tx.ticketConfig.findMany).not.toHaveBeenCalled();
    expect(eligibility.evaluatePurchaseEligibility).not.toHaveBeenCalled();
  });
});


describe('ticket purchase stock', () => {
  function setup(limit: number | null, reserved: number) {
    const future = new Date(Date.now() + 86_400_000);
    const tx = {
      majorEventSubscription: { findFirst: jest.fn().mockResolvedValue({ id: 'subscription', subscriptionStatus: 'CONFIRMED', receiptValidatedAt: new Date(), paymentTier: 'Básico' }) },
      priceTier: { findMany: jest.fn().mockResolvedValue([]) },
      ticketConfig: { findMany: jest.fn().mockResolvedValue([{
        id: 'config', eventId: 'event', purchaseLimit: limit, expirationMode: 'EVENT_END',
        priceOptions: [{ id: 'price', priceTierId: null, amountCents: 1000 }],
        event: { id: 'event', name: 'Festa', emoji: '🎉', endDate: future, startDate: future, isPubliclyListed: true, publicationState: 'PUBLISHED', audience: 'PUBLIC' },
      }]) },
      eventTicket: { findFirst: jest.fn().mockResolvedValue(null) },
      ticketPurchase: { count: jest.fn().mockResolvedValue(reserved), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const eligibility = { prepareIdentitySnapshot: jest.fn(), evaluatePurchaseEligibility: jest.fn().mockResolvedValue({ eligible: true }) };
    return { tx, service: new TicketPurchaseCatalogService(eligibility as never) };
  }

  it.each([1, 2])('hides sold-out offers with %i reservations for one ticket', async (reserved) => {
    const { tx, service } = setup(1, reserved);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toEqual([]);
    expect(tx.ticketPurchase.count).toHaveBeenCalledWith({ where: { ticketConfigId: 'config', status: { in: ['UNDER_REVIEW', 'APPROVED'] } } });
  });

  it('offers the last available ticket', async () => {
    const { tx, service } = setup(2, 1);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toHaveLength(1);
  });

  it('keeps unlimited sales available without counting reservations', async () => {
    const { tx, service } = setup(null, 1000);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toHaveLength(1);
    expect(tx.ticketPurchase.count).not.toHaveBeenCalled();
  });
});
