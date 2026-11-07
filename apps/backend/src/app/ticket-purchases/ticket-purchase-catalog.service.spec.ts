import {
  hasValidatedSubscriptionReceipt,
  selectTicketPrice,
  TicketPurchaseCatalogService,
} from './ticket-purchase-catalog.service';
const { jest } = import.meta;

describe('ticket purchase availability', () => {
  it('requires a validated receipt before showing purchase offers', () => {
    const now = new Date();
    expect(hasValidatedSubscriptionReceipt(null)).toBe(false);
    expect(hasValidatedSubscriptionReceipt({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null })).toBe(false);
    expect(
      hasValidatedSubscriptionReceipt({ subscriptionStatus: 'RECEIPT_UNDER_REVIEW', receiptValidatedAt: now }),
    ).toBe(false);
    expect(
      hasValidatedSubscriptionReceipt({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: now, deletedAt: now }),
    ).toBe(false);
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
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ subscriptionStatus: 'CONFIRMED', receiptValidatedAt: null }),
      },
      ticketConfig: { findMany: jest.fn() },
    };
    const service = new TicketPurchaseCatalogService(eligibility as never);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toEqual([]);
    expect(tx.ticketConfig.findMany).not.toHaveBeenCalled();
    expect(eligibility.evaluatePurchaseEligibility).not.toHaveBeenCalled();
  });
});

describe('ticket purchase stock', () => {
  function setup(
    limit: number | null,
    reserved: number,
    location: {
      locationName?: string | null;
      locationDescription?: string | null;
      isVirtual?: boolean;
    } = {},
  ) {
    const future = new Date(Date.now() + 86_400_000);
    const tx = {
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'subscription',
          subscriptionStatus: 'CONFIRMED',
          receiptValidatedAt: new Date(),
          paymentTier: 'Básico',
        }),
      },
      priceTier: { findMany: jest.fn().mockResolvedValue([]) },
      ticketConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'config',
            eventId: 'event',
            purchaseLimit: limit,
            expirationMode: 'EVENT_END',
            priceOptions: [{ id: 'price', priceTierId: null, amountCents: 1000 }],
            event: {
              id: 'event',
              name: 'Festa',
              emoji: '🎉',
              endDate: future,
              startDate: future,
              isPubliclyListed: true,
              publicationState: 'PUBLISHED',
              audience: 'PUBLIC',
              ...location,
            },
          },
        ]),
      },
      eventTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketPurchase: {
        groupBy: jest.fn().mockResolvedValue([{ ticketConfigId: 'config', _count: { _all: reserved } }]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const eligibility = {
      prepareIdentitySnapshot: jest.fn(),
      evaluatePurchaseEligibility: jest.fn().mockResolvedValue({ eligible: true }),
    };
    return { tx, service: new TicketPurchaseCatalogService(eligibility as never) };
  }

  it.each([1, 2])('hides sold-out offers with %i reservations for one ticket', async (reserved) => {
    const { tx, service } = setup(1, reserved);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toEqual([]);
    expect(tx.ticketPurchase.groupBy).toHaveBeenCalledWith({
      by: ['ticketConfigId'],
      where: { ticketConfigId: { in: ['config'] }, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
      _count: { _all: true },
    });
  });

  it('offers the last available ticket', async () => {
    const { tx, service } = setup(2, 1);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toHaveLength(1);
  });

  it('keeps unlimited sales available without counting reservations', async () => {
    const { tx, service } = setup(null, 1000);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toHaveLength(1);
    expect(tx.ticketPurchase.groupBy).not.toHaveBeenCalled();
  });

  it('batches mixed offers while preserving stock, ownership, pending purchases, and expiration', async () => {
    const { tx, service } = setup(2, 0);
    const base = (await tx.ticketConfig.findMany())[0];
    const configs = ['available', 'sold-out', 'owned', 'pending', 'unlimited', 'expired', 'free'].map((id) => ({
      ...base,
      id,
      eventId: id,
      purchaseLimit: id === 'unlimited' ? null : 2,
      event: { ...base.event, id, endDate: new Date(Date.now() + (id === 'expired' ? -1 : 1) * 86_400_000) },
      priceOptions: [{ ...base.priceOptions[0], amountCents: id === 'free' ? 0 : 1000 }],
    }));
    tx.ticketConfig.findMany.mockResolvedValue(configs);
    tx.ticketPurchase.groupBy.mockResolvedValue([
      { ticketConfigId: 'sold-out', _count: { _all: 2 } },
      { ticketConfigId: 'available', _count: { _all: 1 } },
    ]);
    tx.eventTicket.findMany.mockResolvedValue([{ eventId: 'owned' }] as never);
    tx.ticketPurchase.findMany.mockResolvedValue([{ ticketConfigId: 'pending' }] as never);

    const offers = await service.listOffers(tx as never, 'person', 'major');

    expect(offers.map((offer) => offer.eventId)).toEqual(['available', 'unlimited']);
    expect(tx.ticketPurchase.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.ticketPurchase.groupBy).toHaveBeenCalledWith({
      by: ['ticketConfigId'],
      where: {
        ticketConfigId: { in: ['available', 'sold-out', 'owned', 'pending'] },
        status: { in: ['UNDER_REVIEW', 'APPROVED'] },
      },
      _count: { _all: true },
    });
    expect(tx.eventTicket.findMany).toHaveBeenCalledTimes(1);
    expect(tx.ticketPurchase.findMany).toHaveBeenCalledTimes(1);
    expect(tx.ticketConfig.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ enabled: true, purchaseEnabled: true }),
      }),
    );
  });

  it('does not query reservations or ownership when all offers have expired', async () => {
    const { tx, service } = setup(1, 0);
    const configs = await tx.ticketConfig.findMany();
    configs[0].event.endDate = new Date(Date.now() - 86_400_000);
    await expect(service.listOffers(tx as never, 'person', 'major')).resolves.toEqual([]);
    expect(tx.ticketPurchase.groupBy).not.toHaveBeenCalled();
    expect(tx.ticketPurchase.findMany).not.toHaveBeenCalled();
    expect(tx.eventTicket.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { locationName: 'Auditório', locationDescription: null, expected: 'Auditório' },
    { locationName: 'Auditório', locationDescription: 'Bloco 5', expected: 'Auditório - Bloco 5' },
    { locationName: null, locationDescription: null, isVirtual: true, expected: 'Evento on-line' },
  ])('returns the complete purchase location: $expected', async ({ expected, ...location }) => {
    const { tx, service } = setup(null, 0, location);
    const offers = await service.listOffers(tx as never, 'person', 'major');
    expect(offers[0].event.locationDescription).toBe(expected);
  });
});
