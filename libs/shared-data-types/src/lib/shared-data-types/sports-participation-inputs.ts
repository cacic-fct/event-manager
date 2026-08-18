import { Field, InputType, Int } from '@nestjs/graphql';

import {
  SportsAthleteIdentifierMode,
  SportsCategoryStatus,
  SportsFormat,
  SportsPreset,
  SportsScoringMode,
  SportsTournamentStatus,
} from './sports-enums';

export * from './sports-team-participation-inputs';

@InputType()
export class SportsTournamentCreateInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => SportsTournamentStatus, { nullable: true })
  status?: SportsTournamentStatus;

  @Field(() => Date, { nullable: true })
  registrationStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  registrationEndDate?: Date | null;

  @Field(() => SportsScoringMode, { nullable: true })
  scoringMode?: SportsScoringMode;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionEnabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionAllowNoTeam?: boolean;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionAllowNoCategory?: boolean;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;
}

@InputType()
export class SportsTournamentUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsTournamentStatus, { nullable: true })
  status?: SportsTournamentStatus;

  @Field(() => Date, { nullable: true })
  registrationStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  registrationEndDate?: Date | null;

  @Field(() => SportsScoringMode, { nullable: true })
  scoringMode?: SportsScoringMode;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionEnabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionAllowNoTeam?: boolean;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionAllowNoCategory?: boolean;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Date, { nullable: true })
  finishedAt?: Date | null;
}

@InputType()
export class SportsTournamentClonePartsInput {
  @Field(() => Boolean, { nullable: true })
  categories?: boolean;

  @Field(() => Boolean, { nullable: true })
  teams?: boolean;

  @Field(() => Boolean, { nullable: true })
  registrations?: boolean;

  @Field(() => Boolean, { nullable: true })
  venues?: boolean;

  @Field(() => Boolean, { nullable: true })
  officials?: boolean;

  @Field(() => Boolean, { nullable: true })
  rules?: boolean;
}

@InputType()
export class SportsTournamentCloneInput {
  @Field(() => String)
  sourceTournamentId!: string;

  @Field(() => String)
  destinationMajorEventId!: string;

  @Field(() => SportsTournamentClonePartsInput, { nullable: true })
  parts?: SportsTournamentClonePartsInput;
}

@InputType()
export class SportsCategoryCreateInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => SportsPreset)
  sport!: SportsPreset;

  @Field(() => String, { nullable: true })
  customSportName?: string | null;

  @Field(() => String, { nullable: true })
  division?: string | null;

  @Field(() => SportsFormat)
  format!: SportsFormat;

  @Field(() => SportsCategoryStatus, { nullable: true })
  status?: SportsCategoryStatus;

  @Field(() => Date, { nullable: true })
  registrationStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  registrationEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  minimumRosterSize?: number | null;

  @Field(() => Int, { nullable: true })
  maximumRosterSize?: number | null;

  @Field(() => Int, { nullable: true })
  maximumCaptains?: number | null;

  @Field(() => Int, { nullable: true })
  maximumCoaches?: number | null;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;

  @Field(() => SportsAthleteIdentifierMode, { nullable: true })
  athleteIdentifierMode?: SportsAthleteIdentifierMode;

  @Field(() => String, { nullable: true })
  joiningInstructions?: string | null;

  @Field(() => Boolean, { nullable: true })
  periodsEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  maximumPeriods?: number | null;

  @Field(() => String, { nullable: true })
  periodLabel?: string | null;

  @Field(() => String, { nullable: true })
  timerRulesJson?: string;

  @Field(() => String)
  scoreRulesJson!: string;

  @Field(() => String, { nullable: true })
  overallScoringRulesJson?: string;

  @Field(() => String)
  rosterRulesJson!: string;

  @Field(() => String)
  bracketRulesJson!: string;

  @Field(() => String)
  standingsRulesJson!: string;

  @Field(() => String, { nullable: true })
  rulesText?: string | null;

  @Field(() => String, { nullable: true })
  registrationFormId?: string | null;
}

@InputType()
export class SportsCategoryUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => SportsPreset, { nullable: true })
  sport?: SportsPreset;

  @Field(() => String, { nullable: true })
  customSportName?: string | null;

  @Field(() => String, { nullable: true })
  division?: string | null;

  @Field(() => SportsFormat, { nullable: true })
  format?: SportsFormat;

  @Field(() => SportsCategoryStatus, { nullable: true })
  status?: SportsCategoryStatus;

  @Field(() => Date, { nullable: true })
  registrationStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  registrationEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  minimumRosterSize?: number | null;

  @Field(() => Int, { nullable: true })
  maximumRosterSize?: number | null;

  @Field(() => Int, { nullable: true })
  maximumCaptains?: number | null;

  @Field(() => Int, { nullable: true })
  maximumCoaches?: number | null;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;

  @Field(() => SportsAthleteIdentifierMode, { nullable: true })
  athleteIdentifierMode?: SportsAthleteIdentifierMode;

  @Field(() => String, { nullable: true })
  joiningInstructions?: string | null;

  @Field(() => Boolean, { nullable: true })
  periodsEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  maximumPeriods?: number | null;

  @Field(() => String, { nullable: true })
  periodLabel?: string | null;

  @Field(() => String, { nullable: true })
  timerRulesJson?: string;

  @Field(() => String, { nullable: true })
  scoreRulesJson?: string;

  @Field(() => String, { nullable: true })
  overallScoringRulesJson?: string;

  @Field(() => String, { nullable: true })
  rosterRulesJson?: string;

  @Field(() => String, { nullable: true })
  bracketRulesJson?: string;

  @Field(() => String, { nullable: true })
  standingsRulesJson?: string;

  @Field(() => String, { nullable: true })
  rulesText?: string | null;

  @Field(() => String, { nullable: true })
  registrationFormId?: string | null;

  @Field(() => Date, { nullable: true })
  finishedAt?: Date | null;
}

@InputType()
export class SportsCategoryCloneInput {
  @Field(() => String)
  sourceCategoryId!: string;

  @Field(() => String)
  destinationTournamentId!: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Boolean, { nullable: true })
  includeRegistrations?: boolean;

  @Field(() => Boolean, { nullable: true })
  includeStages?: boolean;

  @Field(() => Boolean, { nullable: true })
  includeOfficials?: boolean;
}
