import { MAX_RECEIPT_PDF_PAGES } from '../receipt.types';
import {
  assertReceiptPdfPageCount,
  parseReceiptPdfPageCount,
  ReceiptPdfProcessingError,
} from './receipt-pdf-processing.utils';

describe('receipt PDF processing utils', () => {
  it('reads a positive PDF page count from pdfinfo output', () => {
    expect(parseReceiptPdfPageCount('Title: Recibo\nPages:          4\nEncrypted: no')).toBe(4);
    expect(parseReceiptPdfPageCount('Pages: 0')).toBeUndefined();
    expect(parseReceiptPdfPageCount('Pages: unknown')).toBeUndefined();
  });

  it('rejects PDFs that exceed the page limit with an actionable message', () => {
    expect(() => assertReceiptPdfPageCount(MAX_RECEIPT_PDF_PAGES)).not.toThrow();
    expect(() => assertReceiptPdfPageCount(MAX_RECEIPT_PDF_PAGES + 1)).toThrow(ReceiptPdfProcessingError);
    expect(() => assertReceiptPdfPageCount(MAX_RECEIPT_PDF_PAGES + 1)).toThrow(
      `no máximo ${MAX_RECEIPT_PDF_PAGES} páginas`,
    );
  });
});
