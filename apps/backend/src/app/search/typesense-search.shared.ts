export function toUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function toOptionalString(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
