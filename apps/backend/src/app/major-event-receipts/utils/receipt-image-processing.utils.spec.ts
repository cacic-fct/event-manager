import sharp from 'sharp';
import {
  MAX_RECEIPT_DECODED_IMAGE_PIXELS,
  MAX_RECEIPT_IMAGE_DIMENSION_PIXELS,
} from '../receipt.types';
import {
  ReceiptImageProcessingLimitError,
  assertReceiptBufferWithinProcessingLimits,
  assertReceiptImageMetadataWithinProcessingLimits,
} from './receipt-image-processing.utils';

describe('receipt-image-processing utils', () => {
  it('accepts processable receipt image buffers', async () => {
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    await expect(assertReceiptBufferWithinProcessingLimits(buffer)).resolves.toBeUndefined();
  });

  it('rejects images without safe decoded dimensions', () => {
    expect(() => assertReceiptImageMetadataWithinProcessingLimits({})).toThrow(ReceiptImageProcessingLimitError);
  });

  it('rejects animated or multi-page images', () => {
    expect(() =>
      assertReceiptImageMetadataWithinProcessingLimits({
        width: 100,
        height: 100,
        pages: 2,
      }),
    ).toThrow(ReceiptImageProcessingLimitError);
  });

  it('rejects images with oversized dimensions', () => {
    expect(() =>
      assertReceiptImageMetadataWithinProcessingLimits({
        width: MAX_RECEIPT_IMAGE_DIMENSION_PIXELS + 1,
        height: 100,
      }),
    ).toThrow(ReceiptImageProcessingLimitError);
  });

  it('rejects images with too many decoded pixels', () => {
    expect(() =>
      assertReceiptImageMetadataWithinProcessingLimits({
        width: MAX_RECEIPT_DECODED_IMAGE_PIXELS,
        height: 2,
      }),
    ).toThrow(ReceiptImageProcessingLimitError);
  });
});
