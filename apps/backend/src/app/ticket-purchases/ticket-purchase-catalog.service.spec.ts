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
