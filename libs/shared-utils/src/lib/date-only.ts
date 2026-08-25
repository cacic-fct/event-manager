import { format, formatISO, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

export type DateOnlyBoundary = 'start' | 'end';

/**
 * Converts a persisted calendar date to a local Date without treating it as a UTC timestamp.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = parseISO(value);
  return isValid(date) && formatISO(date, { representation: 'date' }) === value ? date : null;
}

/**
 * Converts a Material date-picker value to the persisted calendar-date representation.
 */
export function formatDateOnly(value: Date | null | undefined): string | null {
  return value && isValid(value) ? formatISO(value, { representation: 'date' }) : null;
}

/**
 * Converts a local calendar date to the UTC boundary expected by date-range APIs.
 */
export function formatDateOnlyUtcBoundary(
  value: Date | null | undefined,
  boundary: DateOnlyBoundary,
): string | null {
  const dateOnly = formatDateOnly(value);
  return dateOnly ? `${dateOnly}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z` : null;
}

/**
 * Formats a persisted calendar date for Brazilian Portuguese presentation.
 */
export function formatDateOnlyForDisplay(value: string | null | undefined): string | null {
  const date = parseDateOnly(value);
  return date ? format(date, 'P', { locale: ptBR }) : null;
}
