export type SportsPublicNameRole = 'PLAYER' | 'OFFICIAL';

export function redactSportsPublicName(name: string, role: SportsPublicNameRole): string {
  return role === 'PLAYER' ? toSportsPublicPlayerName(name) : toSportsPublicOfficialName(name);
}

export function toSportsPublicPlayerName(name: string): string {
  const parts = normalizeNameParts(name);
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function toSportsPublicOfficialName(name: string): string {
  const parts = normalizeNameParts(name);
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toLocaleUpperCase('pt-BR')}.`;
}

function normalizeNameParts(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
