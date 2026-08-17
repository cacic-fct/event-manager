import { timeWindowFromBrushEvent } from './attendance-statistics-page.component';

describe('attendance statistics chart time selection', () => {
  it('turns the two brush pivots into inclusive minute boundaries', () => {
    expect(timeWindowFromBrushEvent({
      areas: [{ coordRange: [
        Date.parse('2026-08-16T13:47:42.500Z'),
        Date.parse('2026-08-16T12:03:18.000Z'),
      ] }],
    })).toEqual({
      start: '2026-08-16T12:03:00.000Z',
      end: '2026-08-16T13:47:59.999Z',
    });
  });

  it('keeps a same-minute drag as a valid one-minute interval', () => {
    expect(timeWindowFromBrushEvent({
      areas: [{ coordRange: [
        Date.parse('2026-08-16T12:03:10.000Z'),
        Date.parse('2026-08-16T12:03:12.000Z'),
      ] }],
    })).toEqual({
      start: '2026-08-16T12:03:00.000Z',
      end: '2026-08-16T12:03:59.999Z',
    });
  });

  it.each([
    null,
    {},
    { areas: [] },
    { areas: [{ coordRange: ['invalid', 123] }] },
  ])('ignores an incomplete brush payload %#', (event) => {
    expect(timeWindowFromBrushEvent(event)).toBeNull();
  });
});
