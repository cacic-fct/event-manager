export function formatPrizeDrawReelName(fullName: string): string {
  if (fullName.trim() === 'Participante removido') return 'Participante removido';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Participante';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('pt-BR')}.`;
}

export function normalizePrizeDrawText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
