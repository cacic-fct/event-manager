import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function dateRangeValidator(
  startControlName: string,
  endControlName: string,
  errorKey: string,
  shouldValidate: (control: AbstractControl) => boolean = () => true,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!shouldValidate(control)) {
      return null;
    }

    const start = control.get(startControlName)?.value;
    const end = control.get(endControlName)?.value;

    return isDateAfter(start, end) ? { [errorKey]: true } : null;
  };
}

export function isDateAfter(start: unknown, end: unknown): boolean {
  if (!start || !end) {
    return false;
  }

  const startDate = new Date(String(start));
  const endDate = new Date(String(end));
  return !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate > endDate;
}
