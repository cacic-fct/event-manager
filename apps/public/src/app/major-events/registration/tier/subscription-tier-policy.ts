import type {
  PublicEvent,
  PublicMajorEvent,
  PublicMajorEventPriceTier,
} from '@cacic-fct/event-manager-public-contracts';
import { getTierAutomaticSelectionIds, getTierSelectableEventIds } from '@cacic-fct/shared-event-participation';

export type SubscriptionEventCategory = 'course' | 'lecture' | 'uncategorized';

export interface SubscriptionCategoryLimits {
  course: number | null;
  lecture: number | null;
  uncategorized: number | null;
}

const CATEGORY_LABELS = {
  course: { singular: 'minicurso', plural: 'minicursos' },
  lecture: { singular: 'palestra', plural: 'palestras' },
  uncategorized: { singular: 'outro evento', plural: 'outros eventos' },
};

export function subscriptionCategoryLabel(category: SubscriptionEventCategory, count: number): string {
  const labels = CATEGORY_LABELS[category];
  return count === 1 ? labels.singular : labels.plural;
}

/** Use the shared domain policy so public selection matches server authorization. */
export function selectableEventIds(
  events: readonly PublicEvent[],
  tier: PublicMajorEventPriceTier | null,
): Set<string> {
  return getTierSelectableEventIds(events, tier);
}

/** Tier automatic-selection behavior is shared with event participation policy. */
export function automaticEventIds(events: readonly PublicEvent[], tier: PublicMajorEventPriceTier | null): Set<string> {
  return getTierAutomaticSelectionIds(events, tier);
}

export function categoryLimits(
  majorEvent: PublicMajorEvent | null,
  tier: PublicMajorEventPriceTier | null,
): SubscriptionCategoryLimits {
  const source = tier?.customizeSubscriptionLimits === true ? tier : majorEvent;
  return {
    course: source?.maxCoursesPerAttendee ?? null,
    lecture: source?.maxLecturesPerAttendee ?? null,
    uncategorized: source?.maxUncategorizedPerAttendee ?? null,
  };
}

export function eventCategory(event: PublicEvent): SubscriptionEventCategory {
  if (event.type === 'MINICURSO') {
    return 'course';
  }
  if (event.type === 'PALESTRA') {
    return 'lecture';
  }
  return 'uncategorized';
}

export function automaticSelectionLimitViolations(
  majorEvent: PublicMajorEvent,
  events: readonly PublicEvent[],
  tier: PublicMajorEventPriceTier | null,
): string[] {
  const automaticIds = automaticEventIds(events, tier);
  const counts: Record<SubscriptionEventCategory, number> = { course: 0, lecture: 0, uncategorized: 0 };
  for (const event of events) {
    if (automaticIds.has(event.id)) {
      const category = eventCategory(event);
      counts[category] += 1;
    }
  }

  const limits = categoryLimits(majorEvent, tier);
  const scope = tier?.customizeSubscriptionLimits === true ? 'desta modalidade' : 'geral';
  const violations: string[] = [];
  for (const category of ['course', 'lecture', 'uncategorized'] as const) {
    const limit = limits[category];
    if (limit !== null && counts[category] > limit) {
      violations.push(
        `A inscrição automática inclui ${counts[category]} ${subscriptionCategoryLabel(category, counts[category])}, acima do limite ${scope} de ${limit}.`,
      );
    }
  }
  return violations;
}

/** Human-readable tier rules shown both while choosing a tier and while reviewing the selection. */
export function subscriptionTierRuleSummaries(
  majorEvent: PublicMajorEvent,
  tier: PublicMajorEventPriceTier | null,
  events?: readonly PublicEvent[],
): string[] {
  if (!tier) {
    return [];
  }

  const summaries: string[] = [];
  if (tier.includesEventRegistration === false) {
    summaries.push('Esta modalidade não inclui inscrição em eventos.');
  } else if (tier.restrictEventSelection === true) {
    const hasSelectableEvents = events
      ? selectableEventIds(events, tier).size > 0
      : (tier.allowedEventIds?.length ?? 0) > 0;
    summaries.push(
      !hasSelectableEvents
        ? 'Esta modalidade não tem eventos disponíveis para seleção.'
        : 'A seleção fica limitada aos eventos liberados por esta modalidade.',
    );
  }

  const limits = categoryLimits(majorEvent, tier);
  const hasCustomLimits = tier.customizeSubscriptionLimits === true;
  const categories: SubscriptionEventCategory[] = ['course', 'lecture', 'uncategorized'];
  const limitedCategories = categories.filter((category) => limits[category] !== null);
  const positiveLimits: string[] = [];
  for (const category of hasCustomLimits ? categories : limitedCategories) {
    const limit = limits[category];
    const labels = CATEGORY_LABELS[category];
    if (limit === null) {
      summaries.push(`Sem limite de ${labels.plural}`);
    } else if (limit === 0) {
      summaries.push(`Não inclui ${labels.plural}`);
    } else {
      positiveLimits.push(`${limit} ${limit === 1 ? labels.singular : labels.plural}`);
    }
  }
  if (positiveLimits.length) {
    summaries.push(`Até ${new Intl.ListFormat('pt-BR').format(positiveLimits)}`);
  }

  if (events) {
    summaries.push(...automaticSelectionLimitViolations(majorEvent, events, tier));
  }

  return summaries;
}
