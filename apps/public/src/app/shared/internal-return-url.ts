export function resolveInternalReturnUrl(returnUrl: string | null, fallback: string): string {
  const hasControlCharacter = returnUrl
    ? Array.from(returnUrl).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
      })
    : false;
  if (
    !returnUrl ||
    !returnUrl.startsWith('/') ||
    returnUrl.startsWith('//') ||
    returnUrl.includes('\\') ||
    hasControlCharacter
  ) {
    return fallback;
  }
  return returnUrl;
}
