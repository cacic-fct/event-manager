import { BadRequestException } from '@nestjs/common';
import {
  assertValidReceiptUpload,
  buildReceiptObjectKey,
  extensionForMimeType,
  isAllowedReceiptMimeType,
  normalizeExtension,
} from './receipt-file.utils';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('receipt-file utils', () => {
  it('rejects missing, non-image, and oversized uploads', () => {
    expect(() => assertValidReceiptUpload(undefined)).toThrow(BadRequestException);
    expect(() =>
      assertValidReceiptUpload({
        buffer: Buffer.from('file'),
        mimetype: 'application/pdf',
        originalname: 'receipt.pdf',
        size: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidReceiptUpload({
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        mimetype: 'image/svg+xml',
        originalname: 'receipt.svg',
        size: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidReceiptUpload({
        buffer: PNG_BYTES,
        mimetype: 'image/png',
        originalname: 'receipt.png',
        size: 16 * 1024 * 1024,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts valid image uploads', () => {
    const file = {
      buffer: PNG_BYTES,
      mimetype: 'image/unknown',
      originalname: 'receipt.png',
      size: 1024,
    };

    expect(() => assertValidReceiptUpload(file)).not.toThrow();
    expect(file.mimetype).toBe('image/png');
  });

  it('accepts allowed raster MIME types at upload filter time', () => {
    expect(isAllowedReceiptMimeType('image/png')).toBe(true);
    expect(isAllowedReceiptMimeType('image/jpeg')).toBe(true);
    expect(isAllowedReceiptMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedReceiptMimeType('application/xml')).toBe(false);
  });

  it('rejects image headers when magic bytes do not match a raster format', () => {
    expect(() =>
      assertValidReceiptUpload({
        buffer: Buffer.from('file'),
        mimetype: 'image/png',
        originalname: 'receipt.png',
        size: 1024,
      }),
    ).toThrow(BadRequestException);
  });

  it('builds receipt object keys preferring known mime extensions', () => {
    expect(buildReceiptObjectKey('major', 'subscription', 'receipt', 'ignored.jpeg', 'image/png')).toBe(
      'major-events/major/subscriptions/subscription/receipts/receipt.png',
    );
    expect(buildReceiptObjectKey('major', 'subscription', 'receipt', 'scan.custom', 'image/unknown')).toBe(
      'major-events/major/subscriptions/subscription/receipts/receipt.custom',
    );
    expect(buildReceiptObjectKey('major', 'subscription', 'receipt', 'scan', 'image/unknown')).toBe(
      'major-events/major/subscriptions/subscription/receipts/receipt.img',
    );
  });

  it('normalizes known mime types and file extensions', () => {
    expect(extensionForMimeType('IMAGE/JPEG')).toBe('jpg');
    expect(extensionForMimeType('application/pdf')).toBeUndefined();
    expect(extensionForMimeType('image/svg+xml')).toBeUndefined();
    expect(normalizeExtension('. PNG ')).toBe('png');
    expect(normalizeExtension('')).toBeUndefined();
  });
});
