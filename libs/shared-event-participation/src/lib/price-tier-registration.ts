export interface PriceTierActivityRules {
  includesEventRegistration?: boolean | null;
  restrictEventSelection?: boolean | null;
  allowedEventIds?: readonly string[] | null;
}

export interface PriceTierActivity {
  id: string;
  eventGroupId?: string | null;
  autoSubscribe?: boolean | null;
}

/** Restricted groups must be completely allowed and available as one selection. */
export function getTierSelectableEventIds(
  events: readonly PriceTierActivity[],
  tier: PriceTierActivityRules | null,
  groupUniverse: readonly PriceTierActivity[] = events,
): Set<string> {
  if (tier?.includesEventRegistration === false) {
    return new Set();
  }
  if (tier?.restrictEventSelection !== true) {
    return new Set(events.map((event) => event.id));
  }

  const allowedIds = new Set(tier.allowedEventIds ?? []);
  const availableIds = new Set(events.map((event) => event.id));
  const deniedGroups = new Set<string>();
  for (const event of groupUniverse) {
    if (event.eventGroupId && (!allowedIds.has(event.id) || !availableIds.has(event.id))) {
      deniedGroups.add(event.eventGroupId);
    }
  }
  return new Set(
    events
      .filter((event) => allowedIds.has(event.id) && (!event.eventGroupId || !deniedGroups.has(event.eventGroupId)))
      .map((event) => event.id),
  );
}

/** Whitelisted automatic groups enroll all members; disabled rules preserve legacy automatic events. */
export function getTierAutomaticSelectionIds(
  events: readonly PriceTierActivity[],
  tier: PriceTierActivityRules | null,
  groupUniverse: readonly PriceTierActivity[] = events,
): Set<string> {
  if (tier?.includesEventRegistration === false) {
    return new Set();
  }
  if (tier?.restrictEventSelection !== true) {
    return new Set(events.filter((event) => event.autoSubscribe).map((event) => event.id));
  }

  const selectableIds = getTierSelectableEventIds(events, tier, groupUniverse);
  const automaticGroups = new Set(
    events
      .filter((event) => event.autoSubscribe && event.eventGroupId && selectableIds.has(event.id))
      .map((event) => event.eventGroupId),
  );
  return new Set(
    events
      .filter(
        (event) =>
          selectableIds.has(event.id) &&
          (event.autoSubscribe || (event.eventGroupId && automaticGroups.has(event.eventGroupId))),
      )
      .map((event) => event.id),
  );
}
