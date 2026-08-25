import { BadRequestException } from '@nestjs/common';
import { detectImageMimeType } from '@cacic-fct/shared-utils';
import { extname } from 'path';
import { MAX_RECEIPT_FILE_SIZE_BYTES, UploadedReceiptFile } from '../receipt.types';

const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function assertValidReceiptUpload(file: UploadedReceiptFile | undefined): asserts file is UploadedReceiptFile {
  if (!file) {
    throw new BadRequestException('Receipt file is required.');
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    throw new BadRequestException('Receipt must be at most 15 MB.');
  }

  const detectedMimeType = detectReceiptMimeType(file.buffer);
  if (!detectedMimeType || !ALLOWED_RECEIPT_MIME_TYPES.has(detectedMimeType)) {
    throw new BadRequestException('Receipt must be a supported image or PDF.');
  }

  file.mimetype = detectedMimeType;
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
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };

  return extensions[mimeType.toLowerCase()];
}

export function normalizeExtension(extension: string): string | undefined {
  const normalizedExtension = extension.replace('.', '').trim().toLowerCase();
  return normalizedExtension.length > 0 ? normalizedExtension : undefined;
}

export function isAllowedReceiptMimeType(mimeType: string, fileName = ''): boolean {
  return ALLOWED_RECEIPT_MIME_TYPES.has(mimeType.toLowerCase()) || isPdfReceiptUpload(mimeType, fileName);
}

export function isPdfReceiptMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase() === 'application/pdf';
}

function isPdfReceiptUpload(mimeType: string, fileName: string): boolean {
  return isPdfReceiptMimeType(mimeType) || normalizeExtension(extname(fileName)) === 'pdf';
}

function detectReceiptMimeType(buffer: Buffer): string | undefined {
  // A PDF signature is only valid at byte zero. Searching a prefix permits
  // ZIP/polyglot payloads to reach native PDF processing tools.
  if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return 'application/pdf';
  }
  const detectedMimeType = detectImageMimeType(buffer);
  return detectedMimeType === 'image/svg+xml' ? undefined : detectedMimeType;
}
