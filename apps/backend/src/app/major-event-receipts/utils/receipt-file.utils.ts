import { BadRequestException } from '@nestjs/common';
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
]);

export function assertValidReceiptUpload(file: UploadedReceiptFile | undefined): asserts file is UploadedReceiptFile {
  if (!file) {
    throw new BadRequestException('Receipt file is required.');
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    throw new BadRequestException('Receipt must be at most 15 MB.');
  }

  const detectedMimeType = isPdfReceiptUpload(file.mimetype, file.originalname)
    ? 'application/pdf'
    : detectReceiptMimeType(file.buffer);
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
  if (buffer.length < 4) {
    return undefined;
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (buffer.subarray(0, 1_024).includes(Buffer.from('%PDF-'))) {
    return 'application/pdf';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif';
  }

  if (buffer.subarray(0, 2).toString('ascii') === 'BM') {
    return 'image/bmp';
  }

  if (
    buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  ) {
    return 'image/tiff';
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
  }

  return undefined;
}
