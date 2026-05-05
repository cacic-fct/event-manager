import { FormControl, FormGroup } from '@angular/forms';

export type EventMembershipFilter = 'ALL' | 'YES' | 'NO';

export type EventFiltersForm = FormGroup<{
  startDateFrom: FormControl<string>;
  startDateTo: FormControl<string>;
  isInGroup: FormControl<string>;
  isInMajorEvent: FormControl<string>;
  query: FormControl<string>;
}>;

export interface EventListApiFilters {
  query?: string;
  startDateFrom?: string;
  startDateTo?: string;
  isInGroup?: boolean;
  isInMajorEvent?: boolean;
  take?: number;
}

export function buildEventListFilters(
  raw: EventFiltersForm['value'],
  take = 200,
): EventListApiFilters {
  return {
    query: raw.query?.trim() || undefined,
    startDateFrom: raw.startDateFrom
      ? new Date(`${raw.startDateFrom}T00:00:00.000Z`).toISOString()
      : undefined,
    startDateTo: raw.startDateTo
      ? new Date(`${raw.startDateTo}T23:59:59.999Z`).toISOString()
      : undefined,
    isInGroup: toOptionalBoolean(raw.isInGroup),
    isInMajorEvent: toOptionalBoolean(raw.isInMajorEvent),
    take,
  };
}

export function resetEventFiltersForm(form: EventFiltersForm): void {
  form.reset({
    startDateFrom: '',
    startDateTo: '',
    isInGroup: 'ALL',
    isInMajorEvent: 'ALL',
    query: '',
  });
}

function toOptionalBoolean(
  value: string | null | undefined,
): boolean | undefined {
  if (value === 'YES') {
    return true;
  }

  if (value === 'NO') {
    return false;
  }

  return undefined;
}
