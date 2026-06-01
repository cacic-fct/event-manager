import { describe, expect, it } from 'vitest';
import { isFrozenEventGroup, isFrozenFromDates } from './frozen-resource';

describe('frozen-resource', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('freezes when the latest relevant date is older than two months', () => {
    expect(isFrozenFromDates(['2026-01-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z'], now)).toBe(true);
  });

  it('keeps resources editable when createdAt or endDate is inside the two-month window', () => {
    expect(isFrozenFromDates(['2026-01-01T12:00:00.000Z', '2026-05-01T12:00:00.000Z'], now)).toBe(false);
    expect(isFrozenFromDates(['2026-05-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z'], now)).toBe(false);
  });

  it('uses linked event end dates when evaluating event groups', () => {
    expect(
      isFrozenEventGroup(
        {
          createdAt: '2026-01-01T12:00:00.000Z',
        },
        [
          {
            eventGroupId: 'group-1',
            createdAt: '2026-01-01T12:00:00.000Z',
            endDate: '2026-05-10T12:00:00.000Z',
          },
        ],
      ),
    ).toBe(false);
  });

  it('uses linked event creation dates when evaluating event groups', () => {
    expect(
      isFrozenEventGroup(
        {
          createdAt: '2026-01-01T12:00:00.000Z',
        },
        [
          {
            eventGroupId: 'group-1',
            createdAt: '2026-05-10T12:00:00.000Z',
            endDate: null,
          },
        ],
      ),
    ).toBe(false);
  });
});
