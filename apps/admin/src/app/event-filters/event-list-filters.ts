import { FormControl, FormGroup } from '@angular/forms';

export type EventMembershipFilter = 'ALL' | 'YES' | 'NO';

export type EventFiltersForm = FormGroup<{
  startDateFrom: FormControl<string>;
  startDateUntil: FormControl<string>;
  isInGroup: FormControl<string>;
  isInMajorEvent: FormControl<string>;
  query: FormControl<string>;
}>;

export interface EventListApiFilters {
  query?: string;
  startDateFrom?: string;
  startDateUntil?: string;
  isInGroup?: boolean;
  isInMajorEvent?: boolean;
  skip?: number;
  take?: number;
}

export function buildEventListFilters(raw: EventFiltersForm['value'], take = 200): EventListApiFilters {
  return {
    query: raw.query?.trim() || undefined,
    startDateFrom: raw.startDateFrom ? new Date(`${raw.startDateFrom}T00:00:00.000Z`).toISOString() : undefined,
    startDateUntil: raw.startDateUntil ? new Date(`${raw.startDateUntil}T23:59:59.999Z`).toISOString() : undefined,
    isInGroup: toOptionalBoolean(raw.isInGroup),
    isInMajorEvent: toOptionalBoolean(raw.isInMajorEvent),
    take,
  };
}

export function resetEventFiltersForm(form: EventFiltersForm, options?: { emitEvent?: boolean }): void {
  form.reset({
    startDateFrom: '',
    startDateUntil: '',
    isInGroup: 'ALL',
    isInMajorEvent: 'ALL',
    query: '',
  }, options);
}

function toOptionalBoolean(value: string | null | undefined): boolean | undefined {
  if (value === 'YES') {
    return true;
  }

  if (value === 'NO') {
    return false;
  }

  return undefined;
}
