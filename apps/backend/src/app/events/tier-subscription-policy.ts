import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ensureTierAllowsEventIds,
  ensureTierEventLimits,
  resolvePriceTierEventPolicy,
} from '../current-user/major-events/tier-event-policy';
import { normalizeAttendancePriceTier } from './attendance-price-tier-policy';

/** Load one transactional snapshot for staff enrollment, bulk imports, and receipt approval. */
export async function loadWorkspaceTierSubscriptionPolicy(tx: Prisma.TransactionClient, majorEventId: string) {
  const majorEvent = await tx.majorEvent.findFirst({
    where: { id: majorEventId, deletedAt: null },
    select: {
      isPaymentRequired: true,
      maxCoursesPerAttendee: true,
      maxLecturesPerAttendee: true,
      maxUncategorizedPerAttendee: true,
      majorEventPrices: { select: { tiers: true } },
    },
  });
  if (!majorEvent) {
    throw new NotFoundException('Grande evento não encontrado.');
  }
  const tiers = majorEvent.majorEventPrices?.flatMap((price) => price.tiers) ?? [];
  const enforceTierRules =
    majorEvent.isPaymentRequired !== false &&
    tiers.some(
      (tier) =>
        tier.restrictEventSelection || tier.customizeSubscriptionLimits || tier.includesEventRegistration === false,
    );
  const events = enforceTierRules
    ? await tx.event.findMany({
        where: {
          deletedAt: null,
          sportsMatch: { is: null },
          OR: [{ majorEventId }, { eventGroup: { majorEventId, deletedAt: null } }],
        },
        select: { id: true, type: true, eventGroupId: true },
      })
    : [];

  return {
    resolvePolicy: (paymentTier: string | null | undefined) => resolvePriceTierEventPolicy(majorEvent, paymentTier),
    canonicalPaymentTier(paymentTier: string | null | undefined) {
      if (paymentTier == null) {
        return paymentTier;
      }
      const name = normalizeAttendancePriceTier(paymentTier);
      return tiers.find((tier) => normalizeAttendancePriceTier(tier.name) === name)?.name ?? paymentTier.trim();
    },
    validate(paymentTier: string | null | undefined, selectedEventIds: readonly string[]): void {
      // Staff retain their existing enrollment behavior when tier rules are disabled.
      if (!enforceTierRules) {
        return;
      }
      const policy = resolvePriceTierEventPolicy(majorEvent, paymentTier);
      const selectedIds = new Set(selectedEventIds);
      const selectedEvents = events.filter((event) => selectedIds.has(event.id));
      if (selectedEvents.length !== selectedIds.size) {
        throw new BadRequestException('Os eventos selecionados devem pertencer à programação deste grande evento.');
      }
      ensureTierAllowsEventIds(policy, selectedEventIds, events);
      const selectedGroups = new Set(
        selectedEvents.flatMap((event) => (event.eventGroupId ? [event.eventGroupId] : [])),
      );
      const hasIncompleteGroup = events.some(
        (event) => event.eventGroupId && selectedGroups.has(event.eventGroupId) && !selectedIds.has(event.id),
      );
      if (hasIncompleteGroup) {
        throw new BadRequestException('Selecione todos os eventos de cada grupo.');
      }
      ensureTierEventLimits(policy, selectedEvents);
    },
  };
}

export async function ensureWorkspaceTierSubscriptionPolicy(
  tx: Prisma.TransactionClient,
  majorEventId: string,
  paymentTier: string | null | undefined,
  selectedEventIds: readonly string[],
): Promise<string | null | undefined> {
  const policy = await loadWorkspaceTierSubscriptionPolicy(tx, majorEventId);
  policy.validate(paymentTier, selectedEventIds);
  return policy.canonicalPaymentTier(paymentTier);
}
