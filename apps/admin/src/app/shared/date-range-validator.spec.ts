import { FormControl, FormGroup } from '@angular/forms';
import { dateRangeValidator, isDateAfter } from './date-range-validator';

describe('date range validation', () => {
  it('rejects only ranges whose start is after their end', () => {
    const form = new FormGroup(
      {
        start: new FormControl('2026-08-24T16:00'),
        end: new FormControl('2026-08-24T14:00'),
      },
      { validators: dateRangeValidator('start', 'end', 'datesOutOfOrder') },
    );

    expect(form.hasError('datesOutOfOrder')).toBe(true);

    form.controls.end.setValue('2026-08-24T16:00');

    expect(form.valid).toBe(true);
  });

  it('does not treat intentionally open-ended windows as invalid ranges', () => {
    expect(isDateAfter('2026-08-24T16:00', '')).toBe(false);
    expect(isDateAfter('', '2026-08-24T16:00')).toBe(false);
  });

  it('can skip a range that is disabled by another form control', () => {
    const form = new FormGroup(
      {
        enabled: new FormControl(false),
        start: new FormControl('2026-08-24T16:00'),
        end: new FormControl('2026-08-24T14:00'),
      },
      { validators: dateRangeValidator('start', 'end', 'datesOutOfOrder', (control) => control.get('enabled')?.value) },
    );

    expect(form.valid).toBe(true);

    form.controls.enabled.setValue(true);

    expect(form.hasError('datesOutOfOrder')).toBe(true);
  });
});
