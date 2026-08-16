import { BadRequestException } from '@nestjs/common';

export interface MajorEventPaymentSelectionSource {
  isPaymentRequired: boolean;
  majorEventPrices: Array<{
    tiers: Array<{
      name: string;
      value: number;
      includesSportsRegistration?: boolean;
    }>;
  }>;
}

export interface MajorEventPaymentSelection {
  amountPaid: number | null;
  paymentTier: string | null;
}

export function normalizeMajorEventPaymentTier(paymentTier?: string | null): string | null | undefined {
  if (paymentTier === undefined) {
    return undefined;
  }
  if (paymentTier === null) {
    return null;
  }
  return paymentTier.trim() || null;
}

export function resolveMajorEventSelfServicePayment(
  majorEvent: MajorEventPaymentSelectionSource,
  paymentTierInput?: string | null,
): MajorEventPaymentSelection {
  if (!majorEvent.isPaymentRequired) {
    return {
      amountPaid: null,
      paymentTier: null,
    };
  }

  const tiers = majorEvent.majorEventPrices.flatMap((price) => price.tiers);
  if (tiers.length === 0) {
    return {
      amountPaid: null,
      paymentTier: null,
    };
  }

  if (tiers.length === 1) {
    const [tier] = tiers;
    return {
      amountPaid: tier.value,
      paymentTier: tier.name,
    };
  }

  const normalizedPaymentTier = normalizeMajorEventPaymentTier(paymentTierInput);
  if (!normalizedPaymentTier) {
    throw new BadRequestException('A faixa de pagamento é obrigatória para este grande evento.');
  }

  const selectedTier = tiers.find(
    (tier) => tier.name.trim().toLocaleLowerCase('pt-BR') === normalizedPaymentTier.toLocaleLowerCase('pt-BR'),
  );
  if (!selectedTier) {
    throw new BadRequestException('A faixa de pagamento não é válida para este grande evento.');
  }

  return {
    amountPaid: selectedTier.value,
    paymentTier: selectedTier.name,
  };
}

export function resolveSportsSelfServicePayment(
  majorEvent: MajorEventPaymentSelectionSource,
  paymentTierInput?: string | null,
): MajorEventPaymentSelection {
  if (!majorEvent.isPaymentRequired) {
    return resolveMajorEventSelfServicePayment(majorEvent, paymentTierInput);
  }

  const sportsTiers = majorEvent.majorEventPrices.flatMap((price) =>
    price.tiers.filter((tier) => tier.includesSportsRegistration === true),
  );
  if (sportsTiers.length === 0) {
    throw new BadRequestException('Nenhuma faixa de pagamento inclui a inscrição no torneio.');
  }

  return resolveMajorEventSelfServicePayment(
    {
      ...majorEvent,
      majorEventPrices: [{ tiers: sportsTiers }],
    },
    paymentTierInput,
  );
}
