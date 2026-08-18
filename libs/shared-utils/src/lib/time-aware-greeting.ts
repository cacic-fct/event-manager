export interface TimeAwareGreetingOptions {
  firstNameOnly?: boolean;
}

export function timeAwareGreeting(
  date: Date,
  name?: string | null,
  options: TimeAwareGreetingOptions = {},
): string {
  const hour = date.getHours();
  const greeting = hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const normalizedName = name?.trim();
  const displayName = options.firstNameOnly ? normalizedName?.split(/\s+/)[0] : normalizedName;

  return displayName ? `${greeting}, ${displayName}!` : `${greeting}!`;
}
