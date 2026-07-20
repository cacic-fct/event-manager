import { FormControl, FormGroup } from '@angular/forms';
import { buildEventListFilters, resetEventFiltersForm, type EventFiltersForm } from './event-list-filters';

describe('event list filters', () => {
  it('builds trimmed API filters with UTC day boundaries and optional booleans', () => {
    expect(
      buildEventListFilters(
        {
          query: '  oficina angular  ',
          startDateFrom: '2026-05-20',
          startDateUntil: '2026-05-21',
          isInGroup: 'YES',
          isInMajorEvent: 'NO',
        },
        50,
      ),
    ).toEqual({
      query: 'oficina angular',
      startDateFrom: '2026-05-20T00:00:00.000Z',
      startDateUntil: '2026-05-21T23:59:59.999Z',
      isInGroup: true,
      isInMajorEvent: false,
      take: 50,
    });
  });

  it('omits empty text, dates, and all-membership filters', () => {
    expect(
      buildEventListFilters({
        query: '   ',
        startDateFrom: '',
        startDateUntil: '',
        isInGroup: 'ALL',
        isInMajorEvent: 'ALL',
      }),
    ).toEqual({
      query: undefined,
      startDateFrom: undefined,
      startDateUntil: undefined,
      isInGroup: undefined,
      isInMajorEvent: undefined,
      take: 200,
    });
  });

  it('resets a filters form to the default query state', () => {
    const form: EventFiltersForm = new FormGroup({
      startDateFrom: new FormControl('2026-05-20', { nonNullable: true }),
      startDateUntil: new FormControl('2026-05-21', { nonNullable: true }),
      isInGroup: new FormControl('YES', { nonNullable: true }),
      isInMajorEvent: new FormControl('NO', { nonNullable: true }),
      query: new FormControl('Angular', { nonNullable: true }),
    });

    resetEventFiltersForm(form);

    expect(form.getRawValue()).toEqual({
      startDateFrom: '',
      startDateUntil: '',
      isInGroup: 'ALL',
      isInMajorEvent: 'ALL',
      query: '',
    });
  });
});
