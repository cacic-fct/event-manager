import { ReceiptProcessingStatus } from '@prisma/client';
import { MajorEventReceiptsProcessor } from './major-event-receipts.processor';
import { UnrecoverableError } from 'bullmq';
import { Readable } from 'stream';
import { MAX_RECEIPT_FILE_SIZE_BYTES } from './receipt.types';
import * as receiptImageProcessing from './utils/receipt-image-processing.utils';
import {
  ReceiptImageProcessingLimitError,
  ReceiptImageProcessingTimeoutError,
} from './utils/receipt-image-processing.utils';

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

  it('uses manual payment amounts before tier fallback for admin-created subscriptions', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const resolveExpectedAmountCents = processor['resolveExpectedAmountCents'].bind(processor);

    expect(
      resolveExpectedAmountCents({
        amountPaid: 1250,
        paymentTier: 'Aluno',
        createdByMethod: 'ADMIN_CREATED',
        majorEvent: {
          majorEventPrices: [
            {
              tiers: [{ name: 'Aluno', value: 2500 }],
            },
          ],
        },
      }),
    ).toBe(1250);
  });

  it('infers the only configured price tier when no tier was stored', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const resolveExpectedAmountCents = processor['resolveExpectedAmountCents'].bind(processor);

    expect(
      resolveExpectedAmountCents({
        amountPaid: null,
        paymentTier: null,
        createdByMethod: 'ADMIN_CREATED',
        majorEvent: {
          majorEventPrices: [
            {
              tiers: [{ name: 'Lote unico', value: 4200 }],
            },
          ],
        },
      }),
    ).toBe(4200);
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

  it('reads non-buffer receipt stream chunks into a single buffer', async () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const streamToBuffer = processor['streamToBuffer'].bind(processor);

    await expect(streamToBuffer(Readable.from(['pix ', 'receipt']), MAX_RECEIPT_FILE_SIZE_BYTES)).resolves.toEqual(
      Buffer.from('pix receipt'),
    );
  });

  it('normalizes receipt image operation failures by sharp error category', async () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const runReceiptImageOperation = processor['runReceiptImageOperation'].bind(processor);

    await expect(runReceiptImageOperation(Promise.reject(new Error('timeout reached')), 'Receipt conversion')).rejects.toThrow(
      ReceiptImageProcessingTimeoutError,
    );
    await expect(runReceiptImageOperation(Promise.reject(new Error('pixel limit exceeded')), 'Receipt conversion')).rejects.toThrow(
      ReceiptImageProcessingLimitError,
    );
    await expect(runReceiptImageOperation(Promise.reject(new Error('decode failed')), 'Receipt conversion')).rejects.toThrow(
      'Receipt conversion failed.',
    );
    await expect(runReceiptImageOperation(Promise.resolve('ok'), 'Receipt conversion')).resolves.toBe('ok');
  });

  it('times out long-running OCR operations and invokes the timeout cleanup', async () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const withTimeout = processor['withTimeout'].bind(processor);
    const onTimeout = jest.fn();

    await expect(withTimeout(new Promise(() => undefined), 1, 'Receipt OCR', onTimeout)).rejects.toThrow(
      'Receipt OCR timed out after 1 ms.',
    );

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('accepts absent object sizes and formats non-error values for warnings', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const assertStoredObjectSizeWithinLimit = processor['assertStoredObjectSizeWithinLimit'].bind(processor);
    const formatErrorMessage = processor['formatErrorMessage'].bind(processor);

    expect(() => assertStoredObjectSizeWithinLimit(undefined)).not.toThrow();
    expect(() => assertStoredObjectSizeWithinLimit(MAX_RECEIPT_FILE_SIZE_BYTES)).not.toThrow();
    expect(formatErrorMessage('plain failure')).toBe('plain failure');
    expect(formatErrorMessage(new Error('structured failure'))).toBe('structured failure');
  });

  it('marks image processing limit failures as unrecoverable for BullMQ', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const toBullProcessingError = processor['toBullProcessingError'].bind(processor);

    expect(toBullProcessingError(new ReceiptImageProcessingLimitError('too large'), 'too large')).toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('preserves ordinary processing errors for BullMQ retries', () => {
    const processor = new MajorEventReceiptsProcessor({} as never, {} as never, {} as never);
    const toBullProcessingError = processor['toBullProcessingError'].bind(processor);
    const error = new Error('temporary S3 failure');

    expect(toBullProcessingError(error, error.message)).toBe(error);
    expect(toBullProcessingError('unknown failure', 'unknown failure')).toEqual(new Error('unknown failure'));
  });

  it('ignores missing and expired receipts before downloading files', async () => {
    const { prisma, processor, s3 } = createProcessor();

    prisma.majorEventReceipt.findUnique.mockResolvedValueOnce(null);
    await expect(processor.process({ data: { receiptId: 'missing-receipt' } } as never)).resolves.toBeUndefined();

    prisma.majorEventReceipt.findUnique.mockResolvedValueOnce(receiptFixture({ expiresAt: new Date('2026-01-01') }));
    await expect(processor.process({ data: { receiptId: 'expired-receipt' } } as never)).resolves.toBeUndefined();

    expect(s3.downloadFile).not.toHaveBeenCalled();
    expect(prisma.majorEventReceipt.update).not.toHaveBeenCalled();
  });

  it('processes a receipt through OCR analysis and conversion', async () => {
    const { analysis, prisma, processor, s3 } = createProcessor();
    const receipt = receiptFixture();
    jest.spyOn(receiptImageProcessing, 'readProcessableReceiptImageMetadata').mockResolvedValue(undefined);
    processor['prepareForOcr'] = jest.fn().mockResolvedValue(Buffer.from('prepared'));
    processor['recognizeReceiptText'] = jest.fn().mockResolvedValue('PIX Maria 42,00');
    processor['convertReceiptToAvif'] = jest.fn().mockResolvedValue(undefined);
    prisma.majorEventReceipt.findUnique.mockResolvedValue(receipt);
    s3.downloadFile.mockResolvedValue({
      contentLength: 12,
      stream: Readable.from([Buffer.from('receipt')]),
    });
    analysis.analyze.mockReturnValue({
      expectedAmountCents: 4200,
      matchedAmountCents: 4200,
      amountMatched: true,
      matchedAmountText: '42,00',
      nameMatched: true,
      matchedNameText: 'Maria',
    });

    await expect(processor.process({ data: { receiptId: receipt.id } } as never)).resolves.toBeUndefined();

    expect(analysis.analyze).toHaveBeenCalledWith('PIX Maria 42,00', 'Maria Silva', 4200);
    expect(prisma.majorEventReceipt.update).toHaveBeenCalledWith({
      where: {
        id: receipt.id,
      },
      data: expect.objectContaining({
        processingStatus: ReceiptProcessingStatus.OCR_DONE,
        processingError: null,
        ocrText: 'PIX Maria 42,00',
        expectedAmountCents: 4200,
        matchedAmountCents: 4200,
        amountMatched: true,
        nameMatched: true,
      }),
    });
    expect(processor['convertReceiptToAvif']).toHaveBeenCalledWith(
      receipt.id,
      receipt.objectKey,
      Buffer.from('receipt'),
      receipt.expiresAt,
    );
  });

  it('marks retryable receipt processing failures before rethrowing them', async () => {
    const { prisma, processor, s3 } = createProcessor();
    const receipt = receiptFixture();
    const error = new Error('S3 unavailable');
    prisma.majorEventReceipt.findUnique.mockResolvedValue(receipt);
    s3.downloadFile.mockRejectedValue(error);

    await expect(processor.process({ data: { receiptId: receipt.id } } as never)).rejects.toBe(error);

    expect(prisma.majorEventReceipt.update).toHaveBeenCalledWith({
      where: {
        id: receipt.id,
      },
      data: expect.objectContaining({
        processingStatus: ReceiptProcessingStatus.FAILED,
        processingError: 'S3 unavailable',
      }),
    });
  });

  it('marks image-processing failures as unrecoverable after saving the failure state', async () => {
    const { prisma, processor, s3 } = createProcessor();
    const receipt = receiptFixture();
    jest.spyOn(receiptImageProcessing, 'readProcessableReceiptImageMetadata').mockResolvedValue(undefined);
    processor['prepareForOcr'] = jest
      .fn()
      .mockRejectedValue(new ReceiptImageProcessingLimitError('Receipt image exceeds processing limits.'));
    prisma.majorEventReceipt.findUnique.mockResolvedValue(receipt);
    s3.downloadFile.mockResolvedValue({
      contentLength: 12,
      stream: Readable.from([Buffer.from('receipt')]),
    });

    await expect(processor.process({ data: { receiptId: receipt.id } } as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(prisma.majorEventReceipt.update).toHaveBeenCalledWith({
      where: {
        id: receipt.id,
      },
      data: expect.objectContaining({
        processingStatus: ReceiptProcessingStatus.FAILED,
        processingError: 'Receipt image exceeds processing limits.',
      }),
    });
  });
});

function createProcessor() {
  const prisma = {
    majorEventReceipt: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const s3 = {
    downloadFile: jest.fn(),
  };
  const analysis = {
    analyze: jest.fn(),
  };
  const processor = new MajorEventReceiptsProcessor(prisma as never, s3 as never, analysis as never);
  processor['logger'].error = jest.fn();

  return {
    analysis,
    prisma,
    processor,
    s3,
  };
}

function receiptFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receipt-1',
    objectKey: 'receipts/receipt-1.png',
    expiresAt: new Date('2026-12-31T23:59:59.000Z'),
    subscription: {
      amountPaid: null,
      paymentTier: 'Aluno',
      createdByMethod: 'SELF_SUBSCRIPTION',
      person: {
        name: 'Maria Silva',
      },
      majorEvent: {
        majorEventPrices: [
          {
            tiers: [{ name: 'Aluno', value: 4200 }],
          },
        ],
      },
    },
    ...overrides,
  };
}
