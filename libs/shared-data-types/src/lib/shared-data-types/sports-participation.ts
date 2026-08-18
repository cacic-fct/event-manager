import { Field, Int, ObjectType } from '@nestjs/graphql';

import { EventGroup } from './event-groups';
import { EventForm } from './forms';
import { MajorEvent } from './major-events';
import {
  SportsAthleteIdentifierMode,
  SportsCategoryStatus,
  SportsFormat,
  SportsPreset,
  SportsScoringMode,
  SportsTeamStatus,
  SportsTournamentStatus,
} from './sports-enums';

export * from './sports-participant-management';

@ObjectType()
export class SportsTournament {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent | null;

  @Field(() => SportsTournamentStatus)
  status!: SportsTournamentStatus;

  @Field(() => Date, { nullable: true })
  registrationStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  registrationEndDate?: Date | null;

  @Field(() => SportsScoringMode)
  scoringMode!: SportsScoringMode;

  @Field(() => Boolean)
  selfSubscriptionEnabled!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoTeam!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoCategory!: boolean;

  @Field(() => Boolean)
  allowPlayerMultipleTeams!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificate!: boolean;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date, { nullable: true })
  finishedAt?: Date | null;

  @Field(() => Int, { nullable: true })
  categoryCount?: number | null;

  @Field(() => Int, { nullable: true })
  teamCount?: number | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsCategory {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  eventGroupId!: string;

  @Field(() => EventGroup, { nullable: true })
  eventGroup?: EventGroup | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => SportsPreset)
  sport!: SportsPreset;

  @Field(() => String, { nullable: true })
  customSportName?: string | null;

  @Field(() => String, { nullable: true })
  division?: string | null;

  @Field(() => SportsFormat)
  format!: SportsFormat;

  @Field(() => SportsCategoryStatus)
  status!: SportsCategoryStatus;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;

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

  @Field(() => SportsAthleteIdentifierMode)
  athleteIdentifierMode!: SportsAthleteIdentifierMode;

  @Field(() => String, { nullable: true })
  joiningInstructions?: string | null;

  @Field(() => Boolean)
  periodsEnabled!: boolean;

  @Field(() => Int, { nullable: true })
  maximumPeriods?: number | null;

  @Field(() => String, { nullable: true })
  periodLabel?: string | null;

  @Field(() => String)
  timerRulesJson!: string;

  @Field(() => String)
  scoreRulesJson!: string;

  @Field(() => String)
  overallScoringRulesJson!: string;

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

  @Field(() => EventForm, { nullable: true })
  registrationForm?: EventForm | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date, { nullable: true })
  finishedAt?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsTeam {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  institution?: string | null;

  @Field(() => SportsTeamStatus)
  status!: SportsTeamStatus;

  @Field(() => String, { nullable: true })
  logoUrl?: string | null;

  @Field(() => String, { nullable: true })
  logoObjectKey?: string | null;

  @Field(() => String, { nullable: true })
  logoSha256?: string | null;

  @Field(() => String, { nullable: true })
  logoMimeType?: string | null;

  @Field(() => Int, { nullable: true })
  logoSizeBytes?: number | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => String)
  fieldRevisionsJson!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}
