import { describe, expect, it } from 'vitest';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import { buildSubscriberCsv, formatIdentityDocumentForExport, isValidCpf } from './subscriber-csv-export';

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

  it.each(['=', '+', '-', '@', '\t', '\r', '\n'])(
    'prefixes exported values starting with %s to prevent spreadsheet formula execution',
    (prefix) => {
      const csv = buildSubscriberCsv(
        [
          {
            person: createAdminPerson({ name: `${prefix}HYPERLINK("https://example.com")` }),
          },
        ],
        { fields: ['fullName'], identityDocumentMode: 'masked' },
      );

      expect(csv).toBe(`Nome completo\r\n${escapeExpectedCsvCell(`'${prefix}HYPERLINK("https://example.com")`)}`);
    },
  );

  it('keeps delimiter and quote escaping after formula prefixing', () => {
    const csv = buildSubscriberCsv(
      [
        {
          person: createAdminPerson({ name: '=SUM(1;2)' }),
        },
      ],
      { fields: ['fullName'], identityDocumentMode: 'masked' },
    );

    expect(csv).toBe('Nome completo\r\n"\'=SUM(1;2)"');
  });
});

function escapeExpectedCsvCell(value: string): string {
  if (!/[;\r\n"]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
