import { parseTicketBarcode } from '@cacic-fct/shared-ticketing';

/** Normalize the display barcode; the backend verifies ownership from persisted records. */
export function normalizeTicketBarcodeForAttendance(code: string): string | null {
  if (!code.startsWith('ticket:')) return code;
  return parseTicketBarcode(code)?.userBarcode ?? null;
}
