export const PrizeDrawTargetType = {
  EVENT: 'EVENT',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;
export type PrizeDrawTargetType = (typeof PrizeDrawTargetType)[keyof typeof PrizeDrawTargetType];

export const PrizeDrawChanceMode = {
  EQUAL: 'EQUAL',
  WEIGHTED: 'WEIGHTED',
} as const;
export type PrizeDrawChanceMode = (typeof PrizeDrawChanceMode)[keyof typeof PrizeDrawChanceMode];

export const PrizeDrawSpeed = {
  INSTANT: 'INSTANT',
  QUICK: 'QUICK',
  DRAMATIC: 'DRAMATIC',
} as const;
export type PrizeDrawSpeed = (typeof PrizeDrawSpeed)[keyof typeof PrizeDrawSpeed];

export type PrizeDrawNotificationStatus = 'NOT_REQUESTED' | 'PENDING' | 'SENT' | 'CANCELLED' | 'FAILED' | 'DELETED';

export interface PrizeDrawTargetSummary {
  type: PrizeDrawTargetType;
  id: string;
  name: string;
}

export interface PrizeDrawPlannedSpin {
  id: string;
  position: number;
  description?: string | null;
  speed: PrizeDrawSpeed;
  countdownSeconds?: number | null;
}

export interface PrizeDrawManualEntry {
  id: string;
  personId?: string | null;
  name: string;
  weight: number;
}

export interface PrizeDrawWeightOverride {
  personId: string;
  weight: number;
}

export interface PrizeDrawExcludedPerson {
  personId: string;
  displayName: string;
}

export interface PrizeDrawEligibleEntry {
  identityKey: string;
  personId?: string | null;
  displayName: string;
  weight: number;
  sources: string[];
}

export interface PrizeDrawWeightBreakdown {
  weight: number;
  peopleCount: number;
}

export interface PrizeDrawSpin {
  id: string;
  sequence: number;
  plannedSpinId?: string | null;
  description?: string | null;
  speed: PrizeDrawSpeed;
  countdownSeconds?: number | null;
  chanceMode: PrizeDrawChanceMode;
  removeWinnerAfterDraw: boolean;
  winnerDisplayName: string;
  winnerPersonId?: string | null;
  winnerWeight: number;
  entrantCount: number;
  totalWeight: number;
  duplicateEntryCount: number;
  weightBreakdown: PrizeDrawWeightBreakdown[];
  eligibilityFrozenAt?: string | null;
  drawnAt: string;
  undoneAt?: string | null;
  notificationStatus: PrizeDrawNotificationStatus;
}

export interface PrizeDraw {
  id: string;
  title: string;
  description?: string | null;
  target: PrizeDrawTargetSummary;
  includePresent: boolean;
  includeSubscribers: boolean;
  includeManualEntries: boolean;
  chanceMode: PrizeDrawChanceMode;
  spinLimit?: number | null;
  removeWinnerAfterDraw: boolean;
  defaultSpeed: PrizeDrawSpeed;
  dramaticCountdownSeconds: number;
  notifyWinner: boolean;
  frozenAt?: string | null;
  unfrozenAt?: string | null;
  revision: number;
  plannedSpins: PrizeDrawPlannedSpin[];
  manualEntries: PrizeDrawManualEntry[];
  weightOverrides: PrizeDrawWeightOverride[];
  excludedPeople: PrizeDrawExcludedPerson[];
  spins: PrizeDrawSpin[];
  eligibleEntrantCount: number;
  eligibleTotalWeight: number;
  eligibleDuplicateEntryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrizeDrawSpinResult {
  demo: boolean;
  drawId: string;
  spinId?: string | null;
  sequence?: number | null;
  drawTitle: string;
  spinDescription?: string | null;
  winnerFullName: string;
  winnerReelName: string;
  winnerReelIndex: number;
  reelNames: string[];
  speed: PrizeDrawSpeed;
  countdownMs: number;
  reelDurationMs: number;
  preRevealPauseMs: number;
  hasMoreSpins: boolean;
}

export interface PrizeDrawWinnerContact {
  spinId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  academicId?: string | null;
}

export interface PrizeDrawPlannedSpinInput {
  id?: string | null;
  position: number;
  description?: string | null;
  speed: PrizeDrawSpeed;
  countdownSeconds?: number | null;
}

export interface PrizeDrawManualEntryInput {
  id?: string | null;
  personId?: string | null;
  name: string;
  weight: number;
}

export interface PrizeDrawWeightOverrideInput {
  personId: string;
  weight: number;
}

export interface SavePrizeDrawInput {
  id?: string | null;
  title: string;
  description?: string | null;
  targetType: PrizeDrawTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  includePresent: boolean;
  includeSubscribers: boolean;
  includeManualEntries: boolean;
  chanceMode: PrizeDrawChanceMode;
  spinLimit?: number | null;
  removeWinnerAfterDraw: boolean;
  defaultSpeed: PrizeDrawSpeed;
  dramaticCountdownSeconds: number;
  notifyWinner: boolean;
  plannedSpins: PrizeDrawPlannedSpinInput[];
  manualEntries: PrizeDrawManualEntryInput[];
  weightOverrides: PrizeDrawWeightOverrideInput[];
  excludedPersonIds: string[];
}

export interface SpinPrizeDrawInput {
  drawId: string;
  demo: boolean;
  reducedMotion: boolean;
}
