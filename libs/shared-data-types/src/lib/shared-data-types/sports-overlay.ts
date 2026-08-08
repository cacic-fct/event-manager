export const SPORTS_OVERLAY_PERIOD_WORDS = [
  'Rodada',
  'Tempo',
  'Turno',
  'Etapa',
  'Período',
  'Round',
  'Set',
  'Fase',
  'Parcial',
  'Mapa',
  'Heat',
] as const;

export type SportsOverlayPeriodWord = (typeof SPORTS_OVERLAY_PERIOD_WORDS)[number];

export const DEFAULT_SPORTS_OVERLAY_PERIOD_WORD: SportsOverlayPeriodWord = 'Rodada';

function comparablePeriodWord(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function normalizeSportsOverlayPeriodWord(value: unknown): SportsOverlayPeriodWord {
  if (typeof value !== 'string') {
    return DEFAULT_SPORTS_OVERLAY_PERIOD_WORD;
  }

  const comparableValue = comparablePeriodWord(value);
  return (
    SPORTS_OVERLAY_PERIOD_WORDS.find((periodWord) => comparablePeriodWord(periodWord) === comparableValue) ??
    DEFAULT_SPORTS_OVERLAY_PERIOD_WORD
  );
}
