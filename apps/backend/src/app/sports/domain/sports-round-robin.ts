export interface SportsRoundRobinMatchPlan {
  readonly roundNumber: number;
  readonly position: number;
  readonly homeRegistrationId: string;
  readonly awayRegistrationId: string;
}

export interface SportsRoundRobinRoundPlan {
  readonly roundNumber: number;
  readonly matches: readonly SportsRoundRobinMatchPlan[];
  readonly byeRegistrationId: string | null;
}

export interface GenerateSportsRoundRobinInput {
  readonly registrationIds: readonly string[];
  readonly doubleRoundRobin?: boolean;
}

export function generateSportsRoundRobin(
  input: GenerateSportsRoundRobinInput,
): readonly SportsRoundRobinRoundPlan[] {
  validateRegistrationIds(input.registrationIds);
  if (input.registrationIds.length < 2) {
    throw new Error('A round-robin stage requires at least two registrations.');
  }

  const participants: Array<string | null> = [...input.registrationIds];
  if (participants.length % 2 === 1) {
    participants.push(null);
  }

  const firstLeg: SportsRoundRobinRoundPlan[] = [];
  const roundCount = participants.length - 1;
  const rotating = [...participants];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const matches: SportsRoundRobinMatchPlan[] = [];
    let byeRegistrationId: string | null = null;

    for (let pairIndex = 0; pairIndex < rotating.length / 2; pairIndex += 1) {
      const left = rotating[pairIndex];
      const right = rotating[rotating.length - 1 - pairIndex];
      if (left === null || right === null) {
        byeRegistrationId = left ?? right;
        continue;
      }

      const reverseHome = (roundIndex + pairIndex) % 2 === 1;
      matches.push({
        roundNumber: roundIndex + 1,
        position: matches.length + 1,
        homeRegistrationId: reverseHome ? right : left,
        awayRegistrationId: reverseHome ? left : right,
      });
    }

    firstLeg.push({
      roundNumber: roundIndex + 1,
      matches,
      byeRegistrationId,
    });

    rotating.splice(1, 0, rotating.pop() ?? null);
  }

  if (!input.doubleRoundRobin) {
    return firstLeg;
  }

  const secondLeg = firstLeg.map((round, index) => ({
    roundNumber: roundCount + index + 1,
    byeRegistrationId: round.byeRegistrationId,
    matches: round.matches.map((match) => ({
      roundNumber: roundCount + index + 1,
      position: match.position,
      homeRegistrationId: match.awayRegistrationId,
      awayRegistrationId: match.homeRegistrationId,
    })),
  }));
  return [...firstLeg, ...secondLeg];
}

function validateRegistrationIds(registrationIds: readonly string[]): void {
  const uniqueIds = new Set<string>();
  for (const registrationId of registrationIds) {
    if (!registrationId.trim()) {
      throw new Error('Round-robin registration ids cannot be empty.');
    }
    if (uniqueIds.has(registrationId)) {
      throw new Error(`Registration ${registrationId} appears more than once in the round-robin stage.`);
    }
    uniqueIds.add(registrationId);
  }
}
