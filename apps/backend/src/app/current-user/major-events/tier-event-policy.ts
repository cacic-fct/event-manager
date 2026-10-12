import { getTierAutomaticSelectionIds, getTierSelectableEventIds } from '@cacic-fct/shared-event-participation';
import { BadRequestException } from '@nestjs/common';
import { EventType } from '@cacic-fct/shared-data-types';
import { normalizeAttendancePriceTier } from '../../events/attendance-price-tier-policy';

export interface PriceTierEventPolicySource {
  isPaymentRequired?: boolean;
  maxCoursesPerAttendee?: number | null;
  maxLecturesPerAttendee?: number | null;
  maxUncategorizedPerAttendee?: number | null;
  majorEventPrices?: Array<{
    tiers: Array<{
      name: string;
      includesEventRegistration?: boolean | null;
      restrictEventSelection?: boolean | null;
      allowedEventIds?: string[] | null;
      customizeSubscriptionLimits?: boolean | null;
      maxCoursesPerAttendee?: number | null;
      maxLecturesPerAttendee?: number | null;
      maxUncategorizedPerAttendee?: number | null;
    }>;
  }>;
}

export interface TierPolicyEventLike {
  id: string;
  eventGroupId: string | null;
  autoSubscribe?: boolean | null;
}

export interface PriceTierEventPolicy {
  restrictEventSelection: boolean;
  customizeSubscriptionLimits: boolean;
  /** `null` means unrestricted; an empty set denies every event. */
  allowedEventIds: ReadonlySet<string> | null;
  maxCoursesPerAttendee: number | null;
  maxLecturesPerAttendee: number | null;
  maxUncategorizedPerAttendee: number | null;
}

export function resolvePriceTierEventPolicy(
  majorEvent: PriceTierEventPolicySource,
  selectedTierName?: string | null,
): PriceTierEventPolicy {
  const inheritedPolicy: PriceTierEventPolicy = {
    restrictEventSelection: false,
    customizeSubscriptionLimits: false,
    allowedEventIds: null,
    maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee ?? null,
    maxLecturesPerAttendee: majorEvent.maxLecturesPerAttendee ?? null,
    maxUncategorizedPerAttendee: majorEvent.maxUncategorizedPerAttendee ?? null,
  };
  if (majorEvent.isPaymentRequired === false) {
    return inheritedPolicy;
  }
  const tiers = majorEvent.majorEventPrices?.flatMap((price) => price.tiers) ?? [];
  const hasConfiguredTierPolicy = tiers.some(
    (tier) =>
      tier.includesEventRegistration === false ||
      tier.restrictEventSelection === true ||
      tier.customizeSubscriptionLimits === true,
  );
  const normalizedTierName = normalizeAttendancePriceTier(selectedTierName);
  const matchingTiers = normalizedTierName
    ? tiers.filter((tier) => normalizeAttendancePriceTier(tier.name) === normalizedTierName)
    : [];

  if (matchingTiers.length > 1) {
    throw new BadRequestException('A configuração das faixas de pagamento é ambígua. Contate a organização.');
  }

  const selectedTier = matchingTiers[0];
  if (!selectedTier && hasConfiguredTierPolicy) {
    throw new BadRequestException(
      'A faixa selecionada não tem uma política de inscrição válida para este grande evento.',
    );
  }

  if (!selectedTier) {
    return inheritedPolicy;
  }

  const includesEventRegistration = selectedTier.includesEventRegistration !== false;
  const restrictEventSelection = selectedTier.restrictEventSelection === true || !includesEventRegistration;
  const customizeSubscriptionLimits = selectedTier.customizeSubscriptionLimits === true;
  return {
    restrictEventSelection,
    customizeSubscriptionLimits,
    allowedEventIds: restrictEventSelection
      ? new Set(includesEventRegistration ? (selectedTier.allowedEventIds ?? []) : [])
      : null,
    maxCoursesPerAttendee: customizeSubscriptionLimits
      ? (selectedTier.maxCoursesPerAttendee ?? null)
      : (majorEvent.maxCoursesPerAttendee ?? null),
    maxLecturesPerAttendee: customizeSubscriptionLimits
      ? (selectedTier.maxLecturesPerAttendee ?? null)
      : (majorEvent.maxLecturesPerAttendee ?? null),
    maxUncategorizedPerAttendee: customizeSubscriptionLimits
      ? (selectedTier.maxUncategorizedPerAttendee ?? null)
      : (majorEvent.maxUncategorizedPerAttendee ?? null),
  };
}

export function ensureTierAllowsEventIds(
  policy: PriceTierEventPolicy,
  eventIds: readonly string[],
  events: readonly TierPolicyEventLike[],
): void {
  if (!policy.allowedEventIds) {
    return;
  }

  const eventsById = new Map(events.map((event) => [event.id, event]));
  const deniedGroupIds = getDeniedGroupIds(policy, events);
  for (const eventId of eventIds) {
    const event = eventsById.get(eventId);
    if (!event) {
      throw new BadRequestException(`O evento ${eventId} não está disponível para a faixa selecionada.`);
    }
    if (!policy.allowedEventIds.has(eventId)) {
      throw new BadRequestException(`O evento ${eventId} não é permitido para a faixa selecionada.`);
    }
    if (event.eventGroupId && deniedGroupIds.has(event.eventGroupId)) {
      throw new BadRequestException(
        `O grupo de eventos ${event.eventGroupId} não pode ser selecionado porque a faixa não permite todos os eventos do grupo.`,
      );
    }
  }
}

export function getTierEligibleEvents<T extends TierPolicyEventLike>(
  policy: PriceTierEventPolicy,
  events: readonly T[],
  groupPolicyEvents: readonly TierPolicyEventLike[] = events,
): T[] {
  const selectableIds = getTierSelectableEventIds(events, activityRules(policy), groupPolicyEvents);
  return events.filter((event) => selectableIds.has(event.id));
}

export function getTierAutomaticEventIds(
  policy: PriceTierEventPolicy,
  events: readonly TierPolicyEventLike[],
  groupPolicyEvents: readonly TierPolicyEventLike[] = events,
): string[] {
  return [...getTierAutomaticSelectionIds(events, activityRules(policy), groupPolicyEvents)];
}

function activityRules(policy: PriceTierEventPolicy) {
  return {
    restrictEventSelection: policy.allowedEventIds !== null,
    allowedEventIds: policy.allowedEventIds ? [...policy.allowedEventIds] : [],
  };
}

export function ensureTierEventLimits(policy: PriceTierEventPolicy, selectedEvents: readonly { type: string }[]): void {
  const selectedCourseCount = selectedEvents.filter((event) => event.type === EventType.MINICURSO).length;
  if (policy.maxCoursesPerAttendee != null && selectedCourseCount > policy.maxCoursesPerAttendee) {
    throw new BadRequestException(
      `Foram selecionados ${selectedCourseCount} minicursos, mas o limite da faixa é ${policy.maxCoursesPerAttendee}.`,
    );
  }

  const selectedLectureCount = selectedEvents.filter((event) => event.type === EventType.PALESTRA).length;
  if (policy.maxLecturesPerAttendee != null && selectedLectureCount > policy.maxLecturesPerAttendee) {
    throw new BadRequestException(
      `Foram selecionadas ${selectedLectureCount} palestras, mas o limite da faixa é ${policy.maxLecturesPerAttendee}.`,
    );
  }

  const selectedUncategorizedCount = selectedEvents.filter(
    (event) => event.type !== EventType.MINICURSO && event.type !== EventType.PALESTRA,
  ).length;
  if (policy.maxUncategorizedPerAttendee != null && selectedUncategorizedCount > policy.maxUncategorizedPerAttendee) {
    throw new BadRequestException(
      `Foram selecionadas ${selectedUncategorizedCount} outras atividades, mas o limite da faixa é ${policy.maxUncategorizedPerAttendee}.`,
    );
  }
}

function getDeniedGroupIds(policy: PriceTierEventPolicy, events: readonly TierPolicyEventLike[]): Set<string> {
  if (!policy.allowedEventIds) {
    return new Set();
  }

  return new Set(
    events
      .filter((event) => event.eventGroupId && !policy.allowedEventIds?.has(event.id))
      .map((event) => event.eventGroupId as string),
  );
}
