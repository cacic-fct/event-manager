import { describe, expect, it } from 'vitest';
import {
  escapeCsvValue,
  formatIdentityDocumentForExport,
  isValidCpf,
  subscriberCsvHeader,
  subscriberCsvRow,
} from './subscriber-csv';

describe('subscriber CSV rows', () => {
  const options = { fields: ['fullName'] as const, identityDocumentMode: 'masked' as const };

  it('appends archive-specific columns without changing the selected subscriber fields', () => {
    expect(subscriberCsvHeader(options, ['Caminho relativo do código Aztec'])).toBe(
      'Nome completo;Caminho relativo do código Aztec',
    );
    expect(
      subscriberCsvRow({ name: 'Ana Silva' }, options, ['codigos/ana-silva-12345678909.svg']),
    ).toBe('Ana Silva;codigos/ana-silva-12345678909.svg');
  });

  it('validates and formats CPFs safely for export', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(formatIdentityDocumentForExport('52998224725', 'masked')).toBe('•••.982.247-••');
    expect(formatIdentityDocumentForExport('529.982.247-25', 'complete')).toBe('529.982.247-25');
  });

  it('escapes CSV formula values', () => {
    expect(escapeCsvValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });
});
