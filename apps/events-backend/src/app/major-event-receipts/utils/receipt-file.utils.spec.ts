import { BadRequestException } from '@nestjs/common';
import {
  assertValidReceiptUpload,
  buildReceiptObjectKey,
  extensionForMimeType,
  normalizeExtension,
} from './receipt-file.utils';

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
        buffer: Buffer.from('file'),
        mimetype: 'image/png',
        originalname: 'receipt.png',
        size: 16 * 1024 * 1024,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts valid image uploads', () => {
    expect(() =>
      assertValidReceiptUpload({
        buffer: Buffer.from('file'),
        mimetype: 'image/png',
        originalname: 'receipt.png',
        size: 1024,
      }),
    ).not.toThrow();
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
    expect(normalizeExtension('. PNG ')).toBe('png');
    expect(normalizeExtension('')).toBeUndefined();
  });
});
