export interface SportsSwissStanding {
  readonly registrationId: string;
  readonly points: number;
  readonly tiebreakers?: readonly number[];
  readonly seed?: number | null;
  readonly byeCount?: number;
}

export interface SportsSwissMatchHistory {
  readonly homeRegistrationId: string;
  readonly awayRegistrationId: string;
}

export interface GenerateSportsSwissRoundInput {
  readonly roundNumber: number;
  readonly standings: readonly SportsSwissStanding[];
  readonly matchHistory: readonly SportsSwissMatchHistory[];
}

export interface SportsSwissPairing {
  readonly position: number;
  readonly homeRegistrationId: string;
  readonly awayRegistrationId: string;
  readonly pointDifference: number;
  readonly rematch: boolean;
}

export interface SportsSwissRoundPlan {
  readonly roundNumber: number;
  readonly orderedRegistrationIds: readonly string[];
  readonly pairings: readonly SportsSwissPairing[];
  readonly byeRegistrationId: string | null;
  readonly containsUnavoidableRematch: boolean;
}

interface RankedSwissStanding extends SportsSwissStanding {
  readonly rank: number;
  readonly normalizedTiebreakers: readonly number[];
  readonly normalizedSeed: number;
  readonly normalizedByeCount: number;
}

export function generateSportsSwissRound(
  input: GenerateSportsSwissRoundInput,
): SportsSwissRoundPlan {
  validateSwissInput(input);
  const ranked = rankSwissStandings(input.standings);
  const history = createHistorySet(input.matchHistory);
  const bye = selectSwissBye(ranked);
  const pairingPool = bye
    ? ranked.filter((standing) => standing.registrationId !== bye.registrationId)
    : ranked;

  const rematchFree = findRematchFreePairings(pairingPool, history, new Map());
  const pairs = rematchFree ?? createDeterministicFallbackPairings(pairingPool, history);

  return {
    roundNumber: input.roundNumber,
    orderedRegistrationIds: ranked.map((standing) => standing.registrationId),
    pairings: pairs.map(([home, away], index) => ({
      position: index + 1,
      homeRegistrationId: home.registrationId,
      awayRegistrationId: away.registrationId,
      pointDifference: Math.abs(home.points - away.points),
      rematch: history.has(pairKey(home.registrationId, away.registrationId)),
    })),
    byeRegistrationId: bye?.registrationId ?? null,
    containsUnavoidableRematch: rematchFree === null,
  };
}

export function rankSportsSwissStandings(
  standings: readonly SportsSwissStanding[],
): readonly SportsSwissStanding[] {
  validateStandings(standings);
  return rankSwissStandings(standings).map(
    ({ registrationId, points, tiebreakers, seed, byeCount }) => ({
      registrationId,
      points,
      tiebreakers,
      seed,
      byeCount,
    }),
  );
}

function rankSwissStandings(
  standings: readonly SportsSwissStanding[],
): RankedSwissStanding[] {
  const maximumTiebreakers = standings.reduce(
    (maximum, standing) => Math.max(maximum, standing.tiebreakers?.length ?? 0),
    0,
  );
  return standings
    .map((standing) => ({
      ...standing,
      rank: 0,
      normalizedTiebreakers: Array.from(
        { length: maximumTiebreakers },
        (_, index) => standing.tiebreakers?.[index] ?? 0,
      ),
      normalizedSeed: standing.seed ?? Number.MAX_SAFE_INTEGER,
      normalizedByeCount: standing.byeCount ?? 0,
    }))
    .sort(compareRankedStandings)
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

function compareRankedStandings(
  left: RankedSwissStanding,
  right: RankedSwissStanding,
): number {
  if (left.points !== right.points) {
    return right.points - left.points;
  }
  for (let index = 0; index < left.normalizedTiebreakers.length; index += 1) {
    const difference =
      right.normalizedTiebreakers[index] - left.normalizedTiebreakers[index];
    if (difference !== 0) {
      return difference;
    }
  }
  if (left.normalizedSeed !== right.normalizedSeed) {
    return left.normalizedSeed - right.normalizedSeed;
  }
  return left.registrationId.localeCompare(right.registrationId, 'en');
}

function selectSwissBye(
  standings: readonly RankedSwissStanding[],
): RankedSwissStanding | null {
  if (standings.length % 2 === 0) {
    return null;
  }
  return [...standings].sort((left, right) => {
    if (left.normalizedByeCount !== right.normalizedByeCount) {
      return left.normalizedByeCount - right.normalizedByeCount;
    }
    return right.rank - left.rank;
  })[0];
}

function findRematchFreePairings(
  standings: readonly RankedSwissStanding[],
  history: ReadonlySet<string>,
  memo: Map<string, readonly (readonly [RankedSwissStanding, RankedSwissStanding])[] | null>,
): readonly (readonly [RankedSwissStanding, RankedSwissStanding])[] | null {
  if (standings.length === 0) {
    return [];
  }
  const memoKey = standings.map((standing) => standing.registrationId).sort().join('\u0000');
  const memoized = memo.get(memoKey);
  if (memoized !== undefined) {
    return memoized;
  }

  const home = standings[0];
  const opponents = standings
    .slice(1)
    .filter(
      (standing) =>
        !history.has(pairKey(home.registrationId, standing.registrationId)),
    )
    .sort((left, right) => comparePairingCandidates(home, left, right));

  for (const away of opponents) {
    const remaining = standings.filter(
      (standing) =>
        standing.registrationId !== home.registrationId &&
        standing.registrationId !== away.registrationId,
    );
    const remainingPairs = findRematchFreePairings(remaining, history, memo);
    if (remainingPairs) {
      const result = [[home, away] as const, ...remainingPairs];
      memo.set(memoKey, result);
      return result;
    }
  }

  memo.set(memoKey, null);
  return null;
}

function createDeterministicFallbackPairings(
  standings: readonly RankedSwissStanding[],
  history: ReadonlySet<string>,
): readonly (readonly [RankedSwissStanding, RankedSwissStanding])[] {
  const remaining = [...standings];
  const pairs: Array<readonly [RankedSwissStanding, RankedSwissStanding]> = [];

  while (remaining.length > 0) {
    const home = remaining.shift();
    if (!home) {
      break;
    }
    const opponentIndex = remaining
      .map((standing, index) => ({ standing, index }))
      .sort((left, right) => {
        const leftRematch = history.has(
          pairKey(home.registrationId, left.standing.registrationId),
        );
        const rightRematch = history.has(
          pairKey(home.registrationId, right.standing.registrationId),
        );
        if (leftRematch !== rightRematch) {
          return leftRematch ? 1 : -1;
        }
        return comparePairingCandidates(home, left.standing, right.standing);
      })[0]?.index;
    if (opponentIndex === undefined) {
      throw new Error('O conjunto de pareamento suíço deve conter um número par de inscrições.');
    }
    const [away] = remaining.splice(opponentIndex, 1);
    pairs.push([home, away]);
  }

  return pairs;
}

function comparePairingCandidates(
  home: RankedSwissStanding,
  left: RankedSwissStanding,
  right: RankedSwissStanding,
): number {
  const leftPointDifference = Math.abs(home.points - left.points);
  const rightPointDifference = Math.abs(home.points - right.points);
  if (leftPointDifference !== rightPointDifference) {
    return leftPointDifference - rightPointDifference;
  }
  const leftRankDifference = Math.abs(home.rank - left.rank);
  const rightRankDifference = Math.abs(home.rank - right.rank);
  if (leftRankDifference !== rightRankDifference) {
    return leftRankDifference - rightRankDifference;
  }
  return left.registrationId.localeCompare(right.registrationId, 'en');
}

function createHistorySet(
  history: readonly SportsSwissMatchHistory[],
): ReadonlySet<string> {
  return new Set(
    history.map((match) =>
      pairKey(match.homeRegistrationId, match.awayRegistrationId),
    ),
  );
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join('\u0000');
}

function validateSwissInput(input: GenerateSportsSwissRoundInput): void {
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
    throw new Error('Swiss round number must be a positive integer.');
  }
  validateStandings(input.standings);
  const registrationIds = new Set(
    input.standings.map((standing) => standing.registrationId),
  );
  for (const match of input.matchHistory) {
    if (
      !registrationIds.has(match.homeRegistrationId) ||
      !registrationIds.has(match.awayRegistrationId)
    ) {
      throw new Error('Swiss match history references an unknown registration.');
    }
    if (match.homeRegistrationId === match.awayRegistrationId) {
      throw new Error('A Swiss match cannot contain the same registration twice.');
    }
  }
}

function validateStandings(standings: readonly SportsSwissStanding[]): void {
  if (standings.length < 2) {
    throw new Error('A Swiss round requires at least two registrations.');
  }
  const registrationIds = new Set<string>();
  for (const standing of standings) {
    if (!standing.registrationId.trim()) {
      throw new Error('Swiss registration ids cannot be empty.');
    }
    if (registrationIds.has(standing.registrationId)) {
      throw new Error(
        `Registration ${standing.registrationId} appears more than once in Swiss standings.`,
      );
    }
    registrationIds.add(standing.registrationId);
    if (!Number.isFinite(standing.points)) {
      throw new Error('Swiss points must be finite numbers.');
    }
    if (
      standing.tiebreakers?.some((tiebreaker) => !Number.isFinite(tiebreaker))
    ) {
      throw new Error('Swiss tiebreakers must be finite numbers.');
    }
    if (
      standing.seed !== null &&
      standing.seed !== undefined &&
      (!Number.isInteger(standing.seed) || standing.seed < 1)
    ) {
      throw new Error('Swiss seeds must be positive integers.');
    }
    if (
      standing.byeCount !== undefined &&
      (!Number.isInteger(standing.byeCount) || standing.byeCount < 0)
    ) {
      throw new Error('Swiss bye counts must be non-negative integers.');
    }
  }
}
