import { parsePhoneNumberFromString } from 'libphonenumber-js';

function completePhone(value: string) {
  const text = value.trim();
  const digits = text.replace(/\D/g, '');
  if (
    !text.startsWith('+') &&
    digits.length !== 10 &&
    digits.length !== 11 &&
    !(digits.startsWith('55') && (digits.length === 12 || digits.length === 13))
  )
    return undefined;
  const phone = parsePhoneNumberFromString(text, { defaultCountry: 'BR', extract: false });
  if (!phone?.isPossible() || phone.ext) return undefined;
  if (phone.country === 'BR' && phone.nationalNumber.length !== 10 && phone.nationalNumber.length !== 11)
    return undefined;
  return phone;
}

/** International numbers require a country prefix; local numbers retain the app's Brazilian default. */
export function normalizeTransferPhone(value: string): string | undefined {
  return completePhone(value)?.number;
}

export function transferPhoneCandidates(value: string): string[] {
  const phone = completePhone(value);
  if (!phone) return [];
  return [...new Set([value.trim(), phone.number, phone.number.slice(1), phone.formatInternational()])];
}
