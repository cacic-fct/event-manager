import { toOptionalString, toUnixTimestamp } from './typesense-search.shared';

describe('typesense shared helpers', () => {
  it('normalizes optional strings and unix timestamps', () => {
    expect(toOptionalString('  Ana  ')).toBe('Ana');
    expect(toOptionalString('   ')).toBeUndefined();
    expect(toOptionalString(null)).toBeUndefined();
    expect(toUnixTimestamp(new Date('2026-06-25T12:00:00.000Z'))).toBe(1782388800);
  });
});
