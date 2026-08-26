import { formatPrizeDrawReelName, normalizePrizeDrawText } from './prize-draw-name';

describe('prize draw name formatting', () => {
  it.each([
    ['Ana Beatriz de Souza', 'Ana S.'],
    ['João Silva', 'João S.'],
    ['madonna', 'madonna'],
    ['  Érica   álvares  ', 'Érica Á.'],
    ['Participante removido', 'Participante removido'],
  ])('formats %p as %p', (fullName, expected) => {
    expect(formatPrizeDrawReelName(fullName)).toBe(expected);
  });

  it('normalizes optional text without inventing content', () => {
    expect(normalizePrizeDrawText('  Prêmio principal  ')).toBe('Prêmio principal');
    expect(normalizePrizeDrawText('   ')).toBeNull();
    expect(normalizePrizeDrawText(null)).toBeNull();
  });
});
