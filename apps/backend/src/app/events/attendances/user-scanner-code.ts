export function parseUserAztecCode(code: string): string | null {
  const [kind, userId, ...extraParts] = code.trim().split(':');
  if (kind !== 'user' || !userId || extraParts.length > 0) {
    return null;
  }

  return userId;
}

export function scannerUserIdForStorage(code: string | null | undefined): string | null {
  const normalizedCode = code?.trim();
  return normalizedCode ? parseUserAztecCode(normalizedCode) : null;
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
