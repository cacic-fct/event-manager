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

  it('ignores digit strings that cannot be Brazilian phones', () => {
    expect(getBrazilianPhoneCandidates('ABC123')).toEqual([]);
    expect(getBrazilianPhoneCandidates('123456789')).toEqual([]);
  });
});
