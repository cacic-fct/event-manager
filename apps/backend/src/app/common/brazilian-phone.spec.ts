import { getBrazilianPhoneCandidates } from './brazilian-phone';

describe('getBrazilianPhoneCandidates', () => {
  it('builds national, country-code, and display aliases for Brazilian phones', () => {
    expect(getBrazilianPhoneCandidates('+55 (18) 99999-0000')).toEqual(
      expect.arrayContaining([
        '5518999990000',
        '18999990000',
        '+5518999990000',
        '(18) 99999-0000',
        '+55 (18) 99999-0000',
      ]),
    );
  });

  it('preserves DDD 55 numbers instead of stripping them as a country code', () => {
    expect(getBrazilianPhoneCandidates('55999990000')).toEqual(expect.arrayContaining(['55999990000']));
  });

  it('builds display aliases for 10-digit Brazilian phones', () => {
    expect(getBrazilianPhoneCandidates('1833330000')).toEqual(
      expect.arrayContaining([
        '1833330000',
        '551833330000',
        '+551833330000',
        '(18) 3333-0000',
        '+55 (18) 3333-0000',
      ]),
    );
  });

  it('ignores digit strings that cannot be Brazilian phones', () => {
    expect(getBrazilianPhoneCandidates('ABC123')).toEqual([]);
    expect(getBrazilianPhoneCandidates('123456789')).toEqual([]);
  });
});
