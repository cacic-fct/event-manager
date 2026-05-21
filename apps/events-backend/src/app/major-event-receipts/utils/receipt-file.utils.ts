import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import { MAX_RECEIPT_FILE_SIZE_BYTES, UploadedReceiptFile } from '../receipt.types';

export function assertValidReceiptUpload(file: UploadedReceiptFile | undefined): asserts file is UploadedReceiptFile {
  if (!file) {
    throw new BadRequestException('Receipt image file is required.');
  }

  if (!file.mimetype.startsWith('image/')) {
    throw new BadRequestException('Receipt must be an image.');
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    throw new BadRequestException('Receipt image must be at most 15 MB.');
  }
}

export function buildReceiptObjectKey(
  majorEventId: string,
  subscriptionId: string,
  receiptId: string,
  fileName: string,
  mimeType: string,
): string {
  const extension = extensionForMimeType(mimeType) ?? normalizeExtension(extname(fileName)) ?? 'img';
  return `major-events/${majorEventId}/subscriptions/${subscriptionId}/receipts/${receiptId}.${extension}`;
}

export function extensionForMimeType(mimeType: string): string | undefined {
  const extensions: Record<string, string> = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jpeg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'image/x-portable-bitmap': 'pbm',
  };

  return extensions[mimeType.toLowerCase()];
}

export function normalizeExtension(extension: string): string | undefined {
  const normalizedExtension = extension.replace('.', '').trim().toLowerCase();
  return normalizedExtension.length > 0 ? normalizedExtension : undefined;
}
