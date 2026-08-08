import {
  redactSportsPublicName,
  toSportsPublicOfficialName,
  toSportsPublicPlayerName,
} from './sports-public-name';

describe('sports public names', () => {
  it('shows only the first and final names for players', () => {
    expect(toSportsPublicPlayerName('  Ana   Beatriz de Souza  ')).toBe('Ana Souza');
  });

  it('shows only the first name and final-name initial for officials', () => {
    expect(toSportsPublicOfficialName('joão pedro da silva')).toBe('joão S.');
    expect(redactSportsPublicName('Maria', 'OFFICIAL')).toBe('Maria');
  });

  it('does not invent a name for blank input', () => {
    expect(toSportsPublicPlayerName('  ')).toBe('');
  });
});
