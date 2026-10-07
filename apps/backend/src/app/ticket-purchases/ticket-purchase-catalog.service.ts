import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { TicketEligibilityService, type TicketEligibilityIdentitySnapshot } from '../tickets/ticket-eligibility.service';
import { TicketPurchaseOptionModel } from './ticket-purchase.models';

export type TicketPurchaseOffer = TicketPurchaseOptionModel & {
  priceOptionId: string;
  majorEventSubscriptionId: string;
};

/** Purchase offers require a confirmed subscription with a validated receipt. */
export function hasValidatedSubscriptionReceipt(subscription: {
  subscriptionStatus: string;
  receiptValidatedAt: Date | null;
  deletedAt?: Date | null;
} | null): boolean {
  return subscription?.subscriptionStatus === 'CONFIRMED' &&
    subscription.receiptValidatedAt != null && !subscription.deletedAt;
}

export function selectTicketPrice<T extends { priceTierId: string | null; amountCents: number }>(
  prices: readonly T[],
  tierId: string | null,
): T | undefined {
  return prices.find((price) => price.priceTierId !== null && price.priceTierId === tierId) ??
    prices.find((price) => price.priceTierId === null);
}

@Injectable()
export class TicketPurchaseCatalogService {
  constructor(private readonly eligibility: TicketEligibilityService) {}

  async listOffers(
    tx: Prisma.TransactionClient,
    personId: string,
    majorEventId: string,
    prepared?: ReadonlyMap<string, TicketEligibilityIdentitySnapshot>,
    onlyEventId?: string,
  ): Promise<TicketPurchaseOffer[]> {
    const subscription = await tx.majorEventSubscription.findFirst({
      where: { majorEventId, personId, deletedAt: null, majorEvent: { deletedAt: null } },
      select: { id: true, subscriptionStatus: true, receiptValidatedAt: true, paymentTier: true },
    });
    if (!hasValidatedSubscriptionReceipt(subscription) || !subscription) return [];

    const tiers = await tx.priceTier.findMany({ where: { price: { majorEventId } }, select: { id: true, name: true } });
    const tier = tiers.find((candidate) => candidate.name.trim().toLocaleLowerCase('pt-BR') ===
      subscription.paymentTier?.trim().toLocaleLowerCase('pt-BR'));
    // Hidden offers remain gated by the validated subscription and offer policy.
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const configs = await tx.ticketConfig.findMany({
        where: {
          enabled: true, purchaseEnabled: true,
          ...(onlyEventId ? { eventId: onlyEventId } : {}),
          event: { deletedAt: null, OR: [{ majorEventId }, { majorEventId: null, eventGroup: { majorEventId, deletedAt: null } }] },
        },
        include: { priceOptions: true, event: { include: { eventGroup: true, majorEvent: true } } },
        orderBy: { event: { startDate: 'asc' } },
      });
      const offers: TicketPurchaseOffer[] = [];
      for (const config of configs) {
        const expiresAt = config.expirationMode === 'CUSTOM' ? config.customExpiresAt : config.event.endDate;
        if (!expiresAt || expiresAt <= new Date()) continue;
        if (config.purchaseLimit != null) {
          const reserved = await tx.ticketPurchase.count({
            where: { ticketConfigId: config.id, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
          });
          if (reserved >= config.purchaseLimit) continue;
        }
        const price = selectTicketPrice(config.priceOptions, tier?.id ?? null);
        if (!price || price.amountCents <= 0) continue;
        const [owned, pendingPurchase] = await Promise.all([
          tx.eventTicket.findFirst({ where: { eventId: config.eventId, holderPersonId: personId, status: { in: ['ACTIVE', 'CONSUMED'] } }, select: { id: true } }),
          tx.ticketPurchase.findFirst({ where: { ticketConfigId: config.id, personId, status: { in: ['UNDER_REVIEW', 'APPROVED'] } }, select: { id: true } }),
        ]);
        if (owned || pendingPurchase) continue;
        const identity = prepared
          ? prepared.get(config.eventId)
          : await this.eligibility.prepareIdentitySnapshot(config.eventId, personId, 'purchase');
        const policy = await this.eligibility.evaluatePurchaseEligibility(tx, config.eventId, personId, identity);
        if (!policy.eligible) continue;
        offers.push({
          eventId: config.eventId, majorEventId, ticketConfigId: config.id,
          name: config.displayName || config.event.name,
          emoji: config.displayEmoji || config.event.emoji,
          description: config.description,
          amountCents: price.amountCents,
          priceTierId: tier?.id ?? null,
          priceTierName: tier?.name ?? null,
          expiresAt,
          priceOptionId: price.id,
          majorEventSubscriptionId: subscription.id,
          event: {
            id: config.event.id, name: config.event.name, emoji: config.event.emoji,
            startDate: config.event.startDate, endDate: config.event.endDate,
            isPubliclyListed: config.event.isPubliclyListed && config.event.publicationState === 'PUBLISHED' &&
              config.event.audience === 'PUBLIC' && (!config.event.eventGroup || config.event.eventGroup.audience === 'PUBLIC') &&
              (!config.event.majorEvent || config.event.majorEvent.audience === 'PUBLIC'),
            locationDescription: config.event.locationDescription,
          },
        });
      }
      return offers;
    });
  }

  async requireOffer(
    tx: Prisma.TransactionClient,
    personId: string,
    eventId: string,
    identitySnapshot: TicketEligibilityIdentitySnapshot,
  ): Promise<TicketPurchaseOffer> {
    const event = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      tx.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { majorEventId: true, eventGroup: { select: { majorEventId: true } } } }),
    );
    const majorEventId = event?.majorEventId ?? event?.eventGroup?.majorEventId;
    const offer = majorEventId ? (await this.listOffers(tx, personId, majorEventId, new Map([[eventId, identitySnapshot]]), eventId)).find((item) => item.eventId === eventId) : undefined;
    if (!offer) throw new BadRequestException('Este bilhete não está disponível para compra.');
    return offer;
  }
}
