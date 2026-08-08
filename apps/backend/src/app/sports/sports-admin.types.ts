import { Prisma, SportsCategoryStatus, SportsBracketSide, SportsFormat, SportsLivestreamProvider, SportsPreset, SportsScoringMode, SportsTournamentStatus } from '@prisma/client';

export interface CreateSportsTournamentInput {
  name: string;
  emoji?: string;
  startDate: Date;
  endDate: Date;
  description?: string | null;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  selfSubscriptionEnabled?: boolean;
  selfSubscriptionAllowNoTeam?: boolean;
  selfSubscriptionAllowNoCategory?: boolean;
  allowPlayerMultipleTeams?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface UpdateSportsTournamentInput {
  expectedRevision: number;
  status?: SportsTournamentStatus;
  finishedAt?: Date | null;
  selfSubscriptionEnabled?: boolean;
  selfSubscriptionAllowNoTeam?: boolean;
  selfSubscriptionAllowNoCategory?: boolean;
  allowPlayerMultipleTeams?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface CreateSportsCategoryInput {
  tournamentId: string;
  eventGroupId?: string;
  name: string;
  emoji?: string;
  sport: SportsPreset;
  customSportName?: string | null;
  division?: string | null;
  format: SportsFormat;
  status?: SportsCategoryStatus;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  minimumRosterSize?: number | null;
  maximumRosterSize?: number | null;
  maximumCaptains?: number | null;
  maximumCoaches?: number | null;
  allowPlayerMultipleTeams?: boolean | null;
  periodsEnabled?: boolean;
  maximumPeriods?: number | null;
  periodLabel?: string | null;
  timerRules?: Prisma.InputJsonValue;
  scoreRules: Prisma.InputJsonValue;
  rosterRules: Prisma.InputJsonValue;
  bracketRules: Prisma.InputJsonValue;
  standingsRules: Prisma.InputJsonValue;
  rulesText?: string | null;
  registrationFormId?: string | null;
}

export interface CreateSportsMatchInput {
  categoryId: string;
  eventId?: string;
  name?: string;
  stageId?: string | null;
  venueId?: string | null;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  startDate?: Date;
  endDate?: Date;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  notes?: string | null;
  livestreamProvider?: SportsLivestreamProvider | null;
  livestreamUrl?: string | null;
  publishImmediately?: boolean;
  winnerAdvancesToId?: string | null;
  winnerAdvancesToSide?: SportsBracketSide | null;
  loserAdvancesToId?: string | null;
  loserAdvancesToSide?: SportsBracketSide | null;
}

