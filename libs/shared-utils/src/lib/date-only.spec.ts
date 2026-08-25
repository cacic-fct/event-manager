import { formatDateOnly, formatDateOnlyForDisplay, formatDateOnlyUtcBoundary, parseDateOnly } from './date-only';

describe('date-only utilities', () => {
  it('round-trips a calendar date without using UTC serialization', () => {
    const date = parseDateOnly('2026-05-20');

    expect(date).toEqual(expect.any(Date));
    expect(formatDateOnly(date)).toBe('2026-05-20');
    expect(formatDateOnlyForDisplay('2026-05-20')).toBe('20/05/2026');
  });

  it('formats UTC range boundaries without shifting the calendar date', () => {
    const date = parseDateOnly('2026-05-20');

    expect(formatDateOnlyUtcBoundary(date, 'start')).toBe('2026-05-20T00:00:00.000Z');
    expect(formatDateOnlyUtcBoundary(date, 'end')).toBe('2026-05-20T23:59:59.999Z');
    expect(formatDateOnlyUtcBoundary(null, 'start')).toBeNull();
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseDateOnly('2026-02-29')).toBeNull();
    expect(parseDateOnly('20/05/2026')).toBeNull();
    expect(formatDateOnly(new Date(Number.NaN))).toBeNull();
    expect(formatDateOnlyForDisplay('2026-02-29')).toBeNull();
  });
});
