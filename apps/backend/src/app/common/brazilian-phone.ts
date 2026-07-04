export function getBrazilianPhoneCandidates(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return [];
  }

  const candidates = new Set<string>();
  const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
    return [];
  }

  const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
  for (const candidate of [digits, withoutCountry, withCountry, `+${withCountry}`]) {
    candidates.add(candidate);
  }
  addBrazilianPhoneDisplayCandidates(candidates, withoutCountry);
  return [...candidates];
}

function addBrazilianPhoneDisplayCandidates(candidates: Set<string>, withoutCountry: string): void {
  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
    return;
  }

  const areaCode = withoutCountry.slice(0, 2);
  const localNumber = withoutCountry.slice(2);
  const prefixLength = localNumber.length === 9 ? 5 : 4;
  const prefix = localNumber.slice(0, prefixLength);
  const suffix = localNumber.slice(prefixLength);
  const localDisplay = `${prefix}-${suffix}`;
  for (const candidate of [
    `(${areaCode}) ${localDisplay}`,
    `(${areaCode})${localDisplay}`,
    `${areaCode} ${localDisplay}`,
    `${areaCode}${localDisplay}`,
    `55 ${areaCode} ${localDisplay}`,
    `+55 ${areaCode} ${localDisplay}`,
    `+55 (${areaCode}) ${localDisplay}`,
  ]) {
    candidates.add(candidate);
  }
}
