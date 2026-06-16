import { MajorEventReceiptsProcessor } from './major-event-receipts.processor';

describe('MajorEventReceiptsProcessor expected amount resolution', () => {
  it('falls back to stored self-service amount when no configured tier matches legacy data', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const resolveExpectedAmountCents = processor['resolveExpectedAmountCents'].bind(processor);

    expect(
      resolveExpectedAmountCents({
        amountPaid: 2500,
        paymentTier: null,
        createdByMethod: 'SELF_SUBSCRIPTION',
        majorEvent: {
          majorEventPrices: [
            {
              tiers: [
                { name: 'Aluno', value: 2500 },
                { name: 'Comunidade externa', value: 5000 },
              ],
            },
          ],
        },
      }),
    ).toBe(2500);
  });

  it('prefers configured tier amounts for current self-service subscriptions', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const resolveExpectedAmountCents = processor['resolveExpectedAmountCents'].bind(processor);

    expect(
      resolveExpectedAmountCents({
        amountPaid: 9999,
        paymentTier: 'Aluno',
        createdByMethod: 'SELF_SUBSCRIPTION',
        majorEvent: {
          majorEventPrices: [
            {
              tiers: [{ name: 'Aluno', value: 2500 }],
            },
          ],
        },
      }),
    ).toBe(2500);
  });
});
