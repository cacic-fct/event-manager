import { parseStoredScannerUserId, parseUserAztecCode, scannerUserIdForStorage } from './user-scanner-code';

describe('attendance barcode identity', () => {
  const ticketId = '019af432-98b0-7000-8000-000000000001';
  const userId = 'holder-user';

  it('uses holder identity from both user and ticket barcodes', () => {
    expect(parseUserAztecCode(`user:${userId}`)).toBe(userId);
    expect(parseUserAztecCode(`ticket:${ticketId}:${userId}`)).toBe(userId);
    expect(scannerUserIdForStorage(`ticket:${ticketId}:${userId}`)).toBe(userId);
    expect(parseStoredScannerUserId(`ticket:${ticketId}:${userId}`)).toBe(userId);
    expect(parseStoredScannerUserId(userId)).toBe(userId);
  });

  it.each([
    `ticket:${ticketId}`,
    `ticket:${ticketId}:`,
    `ticket:${ticketId}:${userId}:extra`,
    `ticket:not-a-ticket:${userId}`,
    `ticket:${ticketId.replace('-7000-', '-4000-')}:${userId}`,
    `ticket:${ticketId}:   `,
  ])('rejects malformed ticket payload %s', (code) => {
    expect(parseUserAztecCode(code)).toBeNull();
  });
});
