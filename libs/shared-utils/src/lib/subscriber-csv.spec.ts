import { describe, expect, it } from 'vitest';
import { subscriberCsvHeader, subscriberCsvRow } from './subscriber-csv';

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
});
