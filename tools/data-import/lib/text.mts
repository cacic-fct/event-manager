const WHITESPACE_PATTERN = /\s+/gu;
const NON_WORD_PATTERN = /[^\p{Letter}\p{Number}_\s]/gu;
type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export function normalizeSpaces(value: unknown): string {
  return String(value ?? '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

export function removeAccents(value: unknown, form: NormalizationForm = 'NFKD'): string {
  return String(value ?? '')
    .normalize(form)
    .replace(/\p{Mark}/gu, '');
}

// JavaScript has no native String.casefold(). Lower-casing after NFKD gives
// the same result for the Portuguese/Latin data handled by these imports.
export function caseFold(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('und');
}

export function canonicalHeader(value: unknown): string {
  return caseFold(normalizeSpaces(removeAccents(value)));
}

export function normalizeTextKey(value: unknown): string {
  return normalizeSpaces(removeAccents(value).replace(NON_WORD_PATTERN, ' ')).toLocaleLowerCase('und');
}
