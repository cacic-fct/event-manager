import { parseTicketBarcode } from '@cacic-fct/shared-ticketing';

export function parseUserAztecCode(code: string): string | null {
  const normalized = code.trim();
  if (normalized.startsWith('ticket:')) {
    // Attendance writers validate the ticket, event and persisted ownership.
    return parseTicketBarcode(normalized)?.holderUserId ?? null;
  }
  const parts = normalized.split(':');
  const [kind, userId, ...extraParts] = parts;
  if (kind !== 'user' || !userId || extraParts.length > 0) {
    return null;
  }

  return userId;
}

export function scannerUserIdForStorage(code: string | null | undefined): string | null {
  const normalizedCode = code?.trim();
  if (!normalizedCode || !parseUserAztecCode(normalizedCode)) return null;
  // Keep ticket identity for validation when reviewing an offline submission.
  return normalizedCode.startsWith('ticket:') ? normalizedCode : parseUserAztecCode(normalizedCode);
}

export function parseStoredScannerUserId(scannerCode: string): string | null {
  const normalizedCode = scannerCode.trim();
  if (!normalizedCode) {
    return null;
  }

  const prefixedUserId = parseUserAztecCode(normalizedCode);
  if (prefixedUserId) {
    return prefixedUserId;
  }

  return normalizedCode.includes(':') ? null : normalizedCode;
}
