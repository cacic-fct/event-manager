import { BadRequestException } from '@nestjs/common';
import { resolveMajorEventSelfServicePayment, resolveSportsSelfServicePayment } from './major-event-payment-selection';

describe('resolveSportsSelfServicePayment', () => {
  it('accepts only tiers configured to include sports registration', () => {
    const majorEvent = {
      isPaymentRequired: true,
      majorEventPrices: [
        {
          tiers: [
            { name: 'Somente atividades', value: 3000, includesSportsRegistration: false },
            { name: 'Atividades e torneio', value: 7000, includesSportsRegistration: true },
            { name: 'Somente torneio', value: 5000, includesSportsRegistration: true },
          ],
        },
      ],
    };

    expect(resolveSportsSelfServicePayment(majorEvent, 'Atividades e torneio')).toEqual({
      amountPaid: 7000,
      paymentTier: 'Atividades e torneio',
    });
    expect(() => resolveSportsSelfServicePayment(majorEvent, 'Somente atividades')).toThrow(BadRequestException);
  });

  it('rejects a paid tournament without any sports-enabled tier', () => {
    expect(() =>
      resolveSportsSelfServicePayment(
        {
          isPaymentRequired: true,
          majorEventPrices: [
            { tiers: [{ name: 'Somente atividades', value: 3000, includesSportsRegistration: false }] },
          ],
        },
        null,
      ),
    ).toThrow('Nenhuma faixa de pagamento inclui a inscrição no torneio.');
  });
});

describe('ambiguous historical payment tiers', () => {
  it.each([false, true])('rejects ambiguous selection regardless of row order (%s)', (reverse) => {
    const tiers = [
      { name: 'Aluno', value: 1000 },
      { name: ' aluno ', value: 2500 },
    ];
    if (reverse) tiers.reverse();
    expect(() =>
      resolveMajorEventSelfServicePayment(
        {
          isPaymentRequired: true,
          majorEventPrices: [{ tiers }],
        },
        'ALUNO',
      ),
    ).toThrow('A configuração das faixas de pagamento é ambígua.');
  });
});
