import { BadRequestException, Injectable } from '@nestjs/common';
import { formatEventLocation } from '@cacic-fct/shared-utils';
import { Prisma } from '@prisma/client';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import {
  TicketEligibilityService,
  type TicketEligibilityIdentitySnapshot,
} from '../tickets/ticket-eligibility.service';
import { TicketPurchaseOptionModel } from './ticket-purchase.models';

export type TicketPurchaseOffer = TicketPurchaseOptionModel & {
  priceOptionId: string;
  majorEventSubscriptionId: string;
};

/** Purchase offers require a confirmed subscription with a validated receipt. */
export function hasValidatedSubscriptionReceipt(
  subscription: {
    subscriptionStatus: string;
    receiptValidatedAt: Date | null;
    deletedAt?: Date | null;
  } | null,
): boolean {
  return (
    subscription?.subscriptionStatus === 'CONFIRMED' &&
    subscription.receiptValidatedAt != null &&
    !subscription.deletedAt
  );
}

export function selectTicketPrice<T extends { priceTierId: string | null; amountCents: number }>(
  prices: readonly T[],
  tierId: string | null,
): T | undefined {
  return (
    prices.find((price) => price.priceTierId !== null && price.priceTierId === tierId) ??
    prices.find((price) => price.priceTierId === null)
  );
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
    if (!hasValidatedSubscriptionReceipt(subscription) || !subscription) {
      return [];
    }

    const tiers = await tx.priceTier.findMany({ where: { price: { majorEventId } }, select: { id: true, name: true } });
    const tier = tiers.find(
      (candidate) =>
        candidate.name.trim().toLocaleLowerCase('pt-BR') ===
        subscription.paymentTier?.trim().toLocaleLowerCase('pt-BR'),
    );
    // Hidden offers remain gated by the validated subscription and offer policy.
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const configs = await tx.ticketConfig.findMany({
        where: {
          enabled: true,
          purchaseEnabled: true,
          ...(onlyEventId ? { eventId: onlyEventId } : {}),
          event: {
            deletedAt: null,
            OR: [{ majorEventId }, { majorEventId: null, eventGroup: { majorEventId, deletedAt: null } }],
          },
        },
        include: { priceOptions: true, event: { include: { eventGroup: true, majorEvent: true } } },
        orderBy: { event: { startDate: 'asc' } },
      });
      const now = new Date();
      const candidates = configs.filter((config) => {
        const expiresAt = config.expirationMode === 'CUSTOM' ? config.customExpiresAt : config.event.endDate;
        const price = selectTicketPrice(config.priceOptions, tier?.id ?? null);
        return expiresAt != null && expiresAt > now && price != null && price.amountCents > 0;
      });
      if (candidates.length === 0) {
        return [];
      }
      const configIds = candidates.map((config) => config.id);
      const limitedConfigIds = candidates.filter((config) => config.purchaseLimit != null).map((config) => config.id);
      const [reservations, ownedTickets, pendingPurchases] = await Promise.all([
        limitedConfigIds.length > 0
          ? tx.ticketPurchase.groupBy({
              by: ['ticketConfigId'],
              where: { ticketConfigId: { in: limitedConfigIds }, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
              _count: { _all: true },
            })
          : [],
        tx.eventTicket.findMany({
          where: {
            eventId: { in: candidates.map((config) => config.eventId) },
            holderPersonId: personId,
            status: { in: ['ACTIVE', 'CONSUMED'] },
          },
          select: { eventId: true },
        }),
        tx.ticketPurchase.findMany({
          where: { ticketConfigId: { in: configIds }, personId, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
          select: { ticketConfigId: true },
        }),
      ]);
      const reservedByConfig = new Map(reservations.map((entry) => [entry.ticketConfigId, entry._count._all]));
      const ownedEventIds = new Set(ownedTickets.map((ticket) => ticket.eventId));
      const pendingConfigIds = new Set(pendingPurchases.map((purchase) => purchase.ticketConfigId));
      const offers: TicketPurchaseOffer[] = [];
      for (const config of candidates) {
        const expiresAt = config.expirationMode === 'CUSTOM' ? config.customExpiresAt : config.event.endDate;
        if (!expiresAt || expiresAt <= new Date()) {
          continue;
        }
        if (config.purchaseLimit != null && (reservedByConfig.get(config.id) ?? 0) >= config.purchaseLimit) {
          continue;
        }
        const price = selectTicketPrice(config.priceOptions, tier?.id ?? null);
        if (!price || price.amountCents <= 0 || ownedEventIds.has(config.eventId) || pendingConfigIds.has(config.id)) {
          continue;
        }
        const identity = prepared
          ? prepared.get(config.eventId)
          : await this.eligibility.prepareIdentitySnapshot(config.eventId, personId, 'purchase');
        const policy = await this.eligibility.evaluatePurchaseEligibility(tx, config.eventId, personId, identity);
        if (!policy.eligible) {
          continue;
        }
        offers.push({
          eventId: config.eventId,
          majorEventId,
          ticketConfigId: config.id,
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
            id: config.event.id,
            name: config.event.name,
            emoji: config.event.emoji,
            startDate: config.event.startDate,
            endDate: config.event.endDate,
            isPubliclyListed:
              config.event.isPubliclyListed &&
              config.event.publicationState === 'PUBLISHED' &&
              config.event.audience === 'PUBLIC' &&
              (!config.event.eventGroup || config.event.eventGroup.audience === 'PUBLIC') &&
              (!config.event.majorEvent || config.event.majorEvent.audience === 'PUBLIC'),
            locationDescription: formatEventLocation(config.event),
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
      tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { majorEventId: true, eventGroup: { select: { majorEventId: true } } },
      }),
    );
    const majorEventId = event?.majorEventId ?? event?.eventGroup?.majorEventId;
    const offer = majorEventId
      ? (await this.listOffers(tx, personId, majorEventId, new Map([[eventId, identitySnapshot]]), eventId)).find(
          (item) => item.eventId === eventId,
        )
      : undefined;
    if (!offer) {
      throw new BadRequestException('Este bilhete não está disponível para compra.');
    }
    return offer;
  }
}
