import { describe, expect, it } from 'vitest';
import { formatIdentityDocumentForExport, isValidCpf } from './subscriber-csv-export';

describe('subscriber CSV export helpers', () => {
  it('masks valid CPF values by default', () => {
    expect(formatIdentityDocumentForExport('123.456.789-09', 'masked')).toBe('•••.456.789-••');
  });

  it('prints valid CPF values completely when requested', () => {
    expect(formatIdentityDocumentForExport('12345678909', 'complete')).toBe('123.456.789-09');
  });

  it('prints non-CPF documents without masking', () => {
    expect(formatIdentityDocumentForExport('AB123456', 'masked')).toBe('AB123456');
  });

  it('rejects invalid CPF values', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123.456.789-00')).toBe(false);
  });
});
