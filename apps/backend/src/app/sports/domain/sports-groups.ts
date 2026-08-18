import { generateSingleEliminationBracket, SportsBracketEntrant, SportsBracketSide } from './sports-brackets';
import { generateSportsRoundRobin, SportsRoundRobinRoundPlan } from './sports-round-robin';

export interface SportsGroupEntrant {
  readonly registrationId: string;
  readonly seed?: number | null;
}

export interface AllocateSportsGroupsInput {
  readonly entrants: readonly SportsGroupEntrant[];
  readonly groupCount: number;
}

export interface SportsGroupAllocation {
  readonly key: string;
  readonly displayOrder: number;
  readonly entrants: readonly Required<SportsGroupEntrant>[];
}

export interface SportsGroupStagePlan {
  readonly groups: readonly (SportsGroupAllocation & {
    readonly rounds: readonly SportsRoundRobinRoundPlan[];
  })[];
  readonly doubleRoundRobin: boolean;
}

export interface PlanSportsGroupStageInput extends AllocateSportsGroupsInput {
  readonly doubleRoundRobin?: boolean;
}

export interface SportsGroupQualifier {
  readonly key: string;
  readonly groupKey: string;
  readonly groupPosition: number;
  readonly seed: number;
}

export type SportsGroupEliminationSlot =
  | {
      readonly type: 'GROUP_POSITION';
      readonly qualifierKey: string;
      readonly groupKey: string;
      readonly groupPosition: number;
      readonly seed: number;
    }
  | {
      readonly type: 'WINNER';
      readonly sourceMatchKey: string;
    }
  | {
      readonly type: 'BYE';
    };

export interface SportsGroupEliminationMatch {
  readonly key: string;
  readonly roundNumber: number;
  readonly position: number;
  readonly home: SportsGroupEliminationSlot;
  readonly away: SportsGroupEliminationSlot;
  readonly winnerAdvancesToKey: string | null;
  readonly winnerAdvancesToSide: SportsBracketSide | null;
  readonly hasStructuralBye: boolean;
}

export interface SportsGroupEliminationPlan {
  readonly qualifiers: readonly SportsGroupQualifier[];
  readonly bracketSize: number;
  readonly rounds: readonly (readonly SportsGroupEliminationMatch[])[];
}

export interface PlanSportsGroupEliminationInput {
  readonly groups: readonly Pick<SportsGroupAllocation, 'key'>[];
  readonly qualifiersPerGroup: number;
}

export function allocateSportsGroups(input: AllocateSportsGroupsInput): readonly SportsGroupAllocation[] {
  validateGroupAllocationInput(input);
  const ordered = orderGroupEntrants(input.entrants);
  const groups: Array<{
    key: string;
    displayOrder: number;
    entrants: Required<SportsGroupEntrant>[];
  }> = Array.from({ length: input.groupCount }, (_, index) => ({
    key: groupKey(index),
    displayOrder: index + 1,
    entrants: [],
  }));

  for (let index = 0; index < ordered.length; index += 1) {
    const row = Math.floor(index / input.groupCount);
    const column = index % input.groupCount;
    const groupIndex = row % 2 === 0 ? column : input.groupCount - 1 - column;
    groups[groupIndex].entrants.push({
      registrationId: ordered[index].registrationId,
      seed: index + 1,
    });
  }

  return groups;
}

export function planSportsGroupStage(input: PlanSportsGroupStageInput): SportsGroupStagePlan {
  const groups = allocateSportsGroups(input);
  return {
    groups: groups.map((group) => ({
      ...group,
      rounds: generateSportsRoundRobin({
        registrationIds: group.entrants.map((entrant) => entrant.registrationId),
        doubleRoundRobin: input.doubleRoundRobin,
      }),
    })),
    doubleRoundRobin: input.doubleRoundRobin ?? false,
  };
}

export function planSportsGroupElimination(input: PlanSportsGroupEliminationInput): SportsGroupEliminationPlan {
  validateQualifierInput(input);
  const qualifiers = createQualifiers(input.groups, input.qualifiersPerGroup);
  const qualifierByKey = new Map(qualifiers.map((qualifier) => [qualifier.key, qualifier]));
  const bracket = generateSingleEliminationBracket({
    entrants: qualifiers.map(
      (qualifier): SportsBracketEntrant => ({
        registrationId: qualifier.key,
        seed: qualifier.seed,
      }),
    ),
    seedingMode: 'MANUAL',
  });

  const rounds = bracket.rounds.map((round) =>
    round.matches.map((match) => ({
      key: match.key,
      roundNumber: match.roundNumber,
      position: match.position,
      home: mapQualifierSlot(match.home, qualifierByKey),
      away: mapQualifierSlot(match.away, qualifierByKey),
      winnerAdvancesToKey: match.winnerAdvancesToKey,
      winnerAdvancesToSide: match.winnerAdvancesToSide,
      hasStructuralBye: match.home.type === 'BYE' || match.away.type === 'BYE',
    })),
  );
  repairSameGroupFirstRound(rounds[0]);

  return {
    qualifiers,
    bracketSize: bracket.bracketSize,
    rounds,
  };
}

function createQualifiers(
  groups: readonly Pick<SportsGroupAllocation, 'key'>[],
  qualifiersPerGroup: number,
): SportsGroupQualifier[] {
  const qualifiers: SportsGroupQualifier[] = [];
  for (let groupPosition = 1; groupPosition <= qualifiersPerGroup; groupPosition += 1) {
    for (const group of groups) {
      qualifiers.push({
        key: `GROUP:${group.key}:POSITION:${groupPosition}`,
        groupKey: group.key,
        groupPosition,
        seed: qualifiers.length + 1,
      });
    }
  }
  return qualifiers;
}

function mapQualifierSlot(
  slot:
    | {
        readonly type: 'REGISTRATION';
        readonly registrationId: string;
        readonly seed: number;
      }
    | {
        readonly type: 'WINNER';
        readonly sourceMatchKey: string;
      }
    | {
        readonly type: 'BYE';
      },
  qualifierByKey: ReadonlyMap<string, SportsGroupQualifier>,
): SportsGroupEliminationSlot {
  if (slot.type !== 'REGISTRATION') {
    return slot;
  }
  const qualifier = qualifierByKey.get(slot.registrationId);
  if (!qualifier) {
    throw new Error(`Unknown group qualifier ${slot.registrationId}.`);
  }
  return {
    type: 'GROUP_POSITION',
    qualifierKey: qualifier.key,
    groupKey: qualifier.groupKey,
    groupPosition: qualifier.groupPosition,
    seed: qualifier.seed,
  };
}

function repairSameGroupFirstRound(matches: SportsGroupEliminationMatch[]): void {
  for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    if (!sameGroup(match.home, match.away)) {
      continue;
    }

    for (let candidateIndex = 0; candidateIndex < matches.length; candidateIndex += 1) {
      if (candidateIndex === matchIndex) {
        continue;
      }
      const candidate = matches[candidateIndex];
      if (canSwapAwaySlots(match.home, match.away, candidate.home, candidate.away)) {
        const originalAway = match.away;
        replaceMatchAway(matches, matchIndex, candidate.away);
        replaceMatchAway(matches, candidateIndex, originalAway);
        break;
      }
    }
  }
}

function canSwapAwaySlots(
  firstHome: SportsGroupEliminationSlot,
  firstAway: SportsGroupEliminationSlot,
  secondHome: SportsGroupEliminationSlot,
  secondAway: SportsGroupEliminationSlot,
): boolean {
  if (firstAway.type !== 'GROUP_POSITION' || secondAway.type !== 'GROUP_POSITION') {
    return false;
  }
  return !sameGroup(firstHome, secondAway) && !sameGroup(secondHome, firstAway);
}

function replaceMatchAway(
  matches: SportsGroupEliminationMatch[],
  index: number,
  away: SportsGroupEliminationSlot,
): void {
  const current = matches[index];
  matches[index] = {
    ...current,
    away,
    hasStructuralBye: current.home.type === 'BYE' || away.type === 'BYE',
  };
}

function sameGroup(home: SportsGroupEliminationSlot, away: SportsGroupEliminationSlot): boolean {
  return home.type === 'GROUP_POSITION' && away.type === 'GROUP_POSITION' && home.groupKey === away.groupKey;
}

function orderGroupEntrants(entrants: readonly SportsGroupEntrant[]): SportsGroupEntrant[] {
  const positioned: Array<SportsGroupEntrant | undefined> = Array.from({
    length: entrants.length,
  });
  const unseeded: SportsGroupEntrant[] = [];

  for (const entrant of entrants) {
    if (entrant.seed === null || entrant.seed === undefined) {
      unseeded.push(entrant);
      continue;
    }
    if (!Number.isInteger(entrant.seed) || entrant.seed < 1 || entrant.seed > entrants.length) {
      throw new Error(`Group seed for registration ${entrant.registrationId} is outside the field.`);
    }
    if (positioned[entrant.seed - 1]) {
      throw new Error(`Group seed ${entrant.seed} is assigned more than once.`);
    }
    positioned[entrant.seed - 1] = entrant;
  }

  let unseededIndex = 0;
  return positioned.map((entrant) => entrant ?? unseeded[unseededIndex++]);
}

function validateGroupAllocationInput(input: AllocateSportsGroupsInput): void {
  if (!Number.isInteger(input.groupCount) || input.groupCount < 2) {
    throw new Error('Group count must be an integer greater than or equal to two.');
  }
  if (input.entrants.length < input.groupCount * 2) {
    throw new Error('Every sports group must contain at least two registrations.');
  }
  const ids = new Set<string>();
  for (const entrant of input.entrants) {
    if (!entrant.registrationId.trim()) {
      throw new Error('Group registration ids cannot be empty.');
    }
    if (ids.has(entrant.registrationId)) {
      throw new Error(`Registration ${entrant.registrationId} appears more than once in group allocation.`);
    }
    ids.add(entrant.registrationId);
  }
}

function validateQualifierInput(input: PlanSportsGroupEliminationInput): void {
  if (!Number.isInteger(input.qualifiersPerGroup) || input.qualifiersPerGroup < 1) {
    throw new Error('Qualifiers per group must be a positive integer.');
  }
  if (input.groups.length < 2) {
    throw new Error('Group elimination requires at least two groups.');
  }
  const keys = new Set<string>();
  for (const group of input.groups) {
    if (!group.key.trim()) {
      throw new Error('Group keys cannot be empty.');
    }
    if (keys.has(group.key)) {
      throw new Error(`Group key ${group.key} appears more than once.`);
    }
    keys.add(group.key);
  }
}

function groupKey(index: number): string {
  let remaining = index + 1;
  let key = '';
  while (remaining > 0) {
    remaining -= 1;
    key = String.fromCharCode(65 + (remaining % 26)) + key;
    remaining = Math.floor(remaining / 26);
  }
  return key;
}
