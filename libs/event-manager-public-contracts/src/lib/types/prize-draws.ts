export type PublicPrizeDrawTargetType = 'EVENT' | 'MAJOR_EVENT';
export type PublicPrizeDrawScopeType = PublicPrizeDrawTargetType | 'EVENT_GROUP';
export type PublicPrizeDrawChanceMode = 'EQUAL' | 'WEIGHTED';
export type PublicPrizeDrawSpeed = 'INSTANT' | 'QUICK' | 'DRAMATIC';

export interface PublicPrizeDrawWeightBreakdown {
  weight: number;
  peopleCount: number;
}

export interface PublicPrizeDrawSpin {
  id: string;
  sequence: number;
  description?: string | null;
  speed: PublicPrizeDrawSpeed;
  countdownSeconds?: number | null;
  chanceMode: PublicPrizeDrawChanceMode;
  removeWinnerAfterDraw: boolean;
  winnerDisplayName: string;
  winnerWeight: number;
  entrantCount: number;
  totalWeight: number;
  duplicateEntryCount: number;
  weightBreakdown: PublicPrizeDrawWeightBreakdown[];
  eligibilityFrozenAt?: string | null;
  drawnAt: string;
}

export interface PublicPrizeDraw {
  id: string;
  title: string;
  description?: string | null;
  target: {
    type: PublicPrizeDrawTargetType;
    id: string;
    name: string;
  };
  includePresent: boolean;
  includeSubscribers: boolean;
  includeManualEntries: boolean;
  chanceMode: PublicPrizeDrawChanceMode;
  spinLimit?: number | null;
  removeWinnerAfterDraw: boolean;
  frozenAt?: string | null;
  revision: number;
  spins: PublicPrizeDrawSpin[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicPrizeDrawAvailability {
  targetType: PublicPrizeDrawScopeType;
  targetId: string;
  drawCount: number;
}
