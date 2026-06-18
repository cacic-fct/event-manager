import sharp from 'sharp';
import {
  MAX_RECEIPT_DECODED_IMAGE_PIXELS,
  MAX_RECEIPT_IMAGE_DIMENSION_PIXELS,
  RECEIPT_IMAGE_METADATA_TIMEOUT_SECONDS,
} from '../receipt.types';

const RECEIPT_SHARP_INPUT_OPTIONS = {
  animated: false,
  failOn: 'warning',
  limitInputPixels: MAX_RECEIPT_DECODED_IMAGE_PIXELS,
  pages: 1,
  sequentialRead: true,
  unlimited: false,
} as const;

export class ReceiptImageProcessingLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptImageProcessingLimitError';
  }
}

export class ReceiptImageProcessingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptImageProcessingTimeoutError';
  }
}

export function createReceiptSharp(buffer: Buffer): ReturnType<typeof sharp> {
  return sharp(buffer, RECEIPT_SHARP_INPUT_OPTIONS);
}

export async function readProcessableReceiptImageMetadata(buffer: Buffer): Promise<{
  width: number;
  height: number;
  pages?: number;
}> {
  try {
    const metadata = await createReceiptSharp(buffer).timeout({ seconds: RECEIPT_IMAGE_METADATA_TIMEOUT_SECONDS }).metadata();
    assertReceiptImageMetadataWithinProcessingLimits(metadata);

    return {
      width: metadata.width,
      height: metadata.height,
      pages: metadata.pages,
    };
  } catch (error: unknown) {
    throw normalizeReceiptImageProcessingError(error, 'Receipt image could not be decoded safely.');
  }
}

export async function assertReceiptBufferWithinProcessingLimits(buffer: Buffer): Promise<void> {
  await readProcessableReceiptImageMetadata(buffer);
}

export function assertReceiptImageMetadataWithinProcessingLimits(metadata: {
  width?: number;
  height?: number;
  pages?: number;
}): asserts metadata is { width: number; height: number; pages?: number } {
  if (!metadata.width || !metadata.height) {
    throw new ReceiptImageProcessingLimitError('Receipt image dimensions could not be determined.');
  }

  if (metadata.pages && metadata.pages > 1) {
    throw new ReceiptImageProcessingLimitError('Receipt image must not be animated or multi-page.');
  }

  if (metadata.width > MAX_RECEIPT_IMAGE_DIMENSION_PIXELS || metadata.height > MAX_RECEIPT_IMAGE_DIMENSION_PIXELS) {
    throw new ReceiptImageProcessingLimitError(
      `Receipt image dimensions must be at most ${MAX_RECEIPT_IMAGE_DIMENSION_PIXELS}px per side.`,
    );
  }

  const pixelCount = metadata.width * metadata.height;
  if (pixelCount > MAX_RECEIPT_DECODED_IMAGE_PIXELS) {
    throw new ReceiptImageProcessingLimitError(
      `Receipt image must be at most ${MAX_RECEIPT_DECODED_IMAGE_PIXELS.toLocaleString('en-US')} decoded pixels.`,
    );
  }
}

export function normalizeReceiptImageProcessingError(error: unknown, fallbackMessage: string): Error {
  if (isReceiptImageProcessingError(error)) {
    return error;
  }

  if (isSharpTimeoutError(error)) {
    return new ReceiptImageProcessingTimeoutError(
      `Receipt image processing timed out after ${RECEIPT_IMAGE_METADATA_TIMEOUT_SECONDS} seconds.`,
    );
  }

  if (isSharpInputLimitError(error)) {
    return new ReceiptImageProcessingLimitError('Receipt image exceeds processing limits.');
  }

  return new ReceiptImageProcessingLimitError(fallbackMessage);
}

export function isReceiptImageProcessingError(error: unknown): error is ReceiptImageProcessingLimitError | ReceiptImageProcessingTimeoutError {
  return error instanceof ReceiptImageProcessingLimitError || error instanceof ReceiptImageProcessingTimeoutError;
}

export function isSharpTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('timeout');
}

export function isSharpInputLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('pixel limit') || message.includes('memory limit') || message.includes('exceeds');
}
