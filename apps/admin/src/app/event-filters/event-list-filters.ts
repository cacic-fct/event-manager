import { FormControl, FormGroup } from '@angular/forms';
import { formatDateOnlyUtcBoundary } from '@cacic-fct/shared-utils';

export type EventMembershipFilter = 'ALL' | 'YES' | 'NO';

export type EventFiltersForm = FormGroup<{
  startDateFrom: FormControl<Date | null>;
  startDateUntil: FormControl<Date | null>;
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
    startDateFrom: formatDateOnlyUtcBoundary(raw.startDateFrom, 'start') ?? undefined,
    startDateUntil: formatDateOnlyUtcBoundary(raw.startDateUntil, 'end') ?? undefined,
    isInGroup: toOptionalBoolean(raw.isInGroup),
    isInMajorEvent: toOptionalBoolean(raw.isInMajorEvent),
    take,
  };
}

export function resetEventFiltersForm(form: EventFiltersForm, options?: { emitEvent?: boolean }): void {
  form.reset(
    {
      startDateFrom: null,
      startDateUntil: null,
      isInGroup: 'ALL',
      isInMajorEvent: 'ALL',
      query: '',
    },
    options,
  );
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
