import { MajorEventReceiptsProcessor } from './major-event-receipts.processor';
import { UnrecoverableError } from 'bullmq';
import { Readable } from 'stream';
import { MAX_RECEIPT_FILE_SIZE_BYTES } from './receipt.types';
import { ReceiptImageProcessingLimitError } from './utils/receipt-image-processing.utils';

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

  it('fails stored receipt streams that exceed the upload size limit', async () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const streamToBuffer = processor['streamToBuffer'].bind(processor);

    await expect(streamToBuffer(Readable.from([Buffer.alloc(MAX_RECEIPT_FILE_SIZE_BYTES + 1)]), MAX_RECEIPT_FILE_SIZE_BYTES)).rejects.toThrow(
      ReceiptImageProcessingLimitError,
    );
  });

  it('marks image processing limit failures as unrecoverable for BullMQ', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const toBullProcessingError = processor['toBullProcessingError'].bind(processor);

    expect(toBullProcessingError(new ReceiptImageProcessingLimitError('too large'), 'too large')).toBeInstanceOf(
      UnrecoverableError,
    );
  });
});
