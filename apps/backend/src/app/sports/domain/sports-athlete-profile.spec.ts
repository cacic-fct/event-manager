import { BadRequestException } from '@nestjs/common';
import { normalizeSportsAthleteProfilePatch } from './sports-athlete-profile';

describe('normalizeSportsAthleteProfilePatch', () => {
  it('trims and preserves a category-scoped shirt number independently from game identity', () => {
    expect(
      normalizeSportsAthleteProfilePatch({
        shirtNumber: '  10-A  ',
        gameNickname: ' Fênix ',
        gameAccountName: ' fenix#2026 ',
        gameAccountUrl: ' https://example.com/users/fenix ',
      }),
    ).toEqual({
      shirtNumber: '10-A',
      gameNickname: 'Fênix',
      gameAccountName: 'fenix#2026',
      gameAccountUrl: 'https://example.com/users/fenix',
    });
  });

  it('trims game identity fields and preserves an HTTPS account URL', () => {
    expect(
      normalizeSportsAthleteProfilePatch({
        gameNickname: '  Fênix  ',
        gameAccountName: '  fenix#2026  ',
        gameAccountUrl: '  https://example.com/users/fenix  ',
      }),
    ).toEqual({
      gameNickname: 'Fênix',
      gameAccountName: 'fenix#2026',
      gameAccountUrl: 'https://example.com/users/fenix',
    });
  });

  it('supports explicitly clearing every optional field', () => {
    expect(
      normalizeSportsAthleteProfilePatch({
        gameNickname: ' ',
        gameAccountName: null,
        gameAccountUrl: '',
      }),
    ).toEqual({ gameNickname: null, gameAccountName: null, gameAccountUrl: null });
  });

  it.each([
    [{}, 'Informe ao menos um dado'],
    [{ shirtNumber: '1234567890123' }, 'número de camisa'],
    [{ shirtNumber: '10!' }, 'número de camisa'],
    [{ gameNickname: 'a'.repeat(81) }, 'no máximo 80'],
    [{ gameAccountName: 'jogador\nadmin' }, 'caracteres inválidos'],
    [{ gameAccountUrl: 'javascript:alert(1)' }, 'link HTTPS válido'],
    [{ gameAccountUrl: 'http://example.com/player' }, 'link HTTPS válido'],
    [{ gameAccountUrl: 'https://user:password@example.com/player' }, 'link HTTPS válido'],
  ])('rejects unsafe or invalid profile values', (input, message) => {
    expect(() => normalizeSportsAthleteProfilePatch(input)).toThrow(BadRequestException);
    expect(() => normalizeSportsAthleteProfilePatch(input)).toThrow(message);
  });
});
