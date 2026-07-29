export const SPORTS_MATCH_STATES = [
  'SCHEDULED',
  'CHECK_IN',
  'LIVE',
  'PAUSED',
  'AWAITING_REVIEW',
  'CANCELED',
  'DRAW',
  'FINISHED',
] as const;

export type SportsMatchState = (typeof SPORTS_MATCH_STATES)[number];
export type SportsMatchTransitionActor = 'OFFICIAL' | 'ADMIN' | 'SYSTEM';
export type SportsReviewStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED';

export interface SportsMatchTransitionRequest {
  readonly from: SportsMatchState;
  readonly to: SportsMatchState;
  readonly actor: SportsMatchTransitionActor;
}

export interface SportsMatchTransitionPlan {
  readonly from: SportsMatchState;
  readonly to: SportsMatchState;
  readonly requiresAdminReview: boolean;
  readonly freezesNonAdminEdits: boolean;
}

const TERMINAL_STATES: ReadonlySet<SportsMatchState> = new Set(['CANCELED', 'DRAW', 'FINISHED']);

const OFFICIAL_TRANSITIONS: Readonly<Record<SportsMatchState, ReadonlySet<SportsMatchState>>> = {
  SCHEDULED: new Set(['CHECK_IN', 'CANCELED']),
  CHECK_IN: new Set(['SCHEDULED', 'LIVE', 'CANCELED']),
  LIVE: new Set(['PAUSED', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED']),
  PAUSED: new Set(['LIVE', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED']),
  AWAITING_REVIEW: new Set(),
  CANCELED: new Set(),
  DRAW: new Set(),
  FINISHED: new Set(),
};

const ADMIN_TRANSITIONS: Readonly<Record<SportsMatchState, ReadonlySet<SportsMatchState>>> = {
  SCHEDULED: new Set(['CHECK_IN', 'CANCELED']),
  CHECK_IN: new Set(['SCHEDULED', 'LIVE', 'CANCELED']),
  LIVE: new Set(['PAUSED', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED']),
  PAUSED: new Set(['LIVE', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED']),
  AWAITING_REVIEW: new Set(['SCHEDULED', 'CHECK_IN', 'LIVE', 'PAUSED', 'CANCELED', 'DRAW', 'FINISHED']),
  CANCELED: new Set(['SCHEDULED']),
  DRAW: new Set(['SCHEDULED', 'FINISHED']),
  FINISHED: new Set(['SCHEDULED', 'AWAITING_REVIEW']),
};

export function isTerminalSportsMatchState(state: SportsMatchState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransitionSportsMatchState(request: SportsMatchTransitionRequest): boolean {
  if (request.from === request.to) {
    return true;
  }

  const transitions = request.actor === 'OFFICIAL' ? OFFICIAL_TRANSITIONS : ADMIN_TRANSITIONS;
  return transitions[request.from].has(request.to);
}

export function planSportsMatchStateTransition(
  request: SportsMatchTransitionRequest,
): SportsMatchTransitionPlan {
  if (!canTransitionSportsMatchState(request)) {
    throw new Error(
      `${request.actor} cannot transition a sports match from ${request.from} to ${request.to}.`,
    );
  }

  const requiresAdminReview =
    request.actor === 'OFFICIAL' &&
    request.from !== request.to &&
    (request.to === 'AWAITING_REVIEW' || isTerminalSportsMatchState(request.to));

  return {
    from: request.from,
    to: request.to,
    requiresAdminReview,
    freezesNonAdminEdits: isTerminalSportsMatchState(request.to),
  };
}

export function resolvePublicSportsMatchState(input: {
  readonly canonicalState: SportsMatchState;
  readonly intendedState: SportsMatchState | null;
  readonly reviewStatus: SportsReviewStatus;
}): SportsMatchState {
  if (input.intendedState && input.reviewStatus === 'APPROVED') {
    return input.intendedState;
  }
  return input.canonicalState;
}
