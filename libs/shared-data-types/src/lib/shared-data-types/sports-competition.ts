import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { Event, PlacePreset } from './events';
import {
  SportsBracketSide,
  SportsLivestreamProvider,
  SportsLossReason,
  SportsMatchState,
  SportsReviewStatus,
  SportsStageType,
} from './sports-enums';
import { SportsRegistration } from './sports-participation';

export * from './sports-match-operations';

@ObjectType()
export class SportsScorePeriod {
  @Field(() => Int)
  number!: number;

  @Field(() => String, { nullable: true })
  label?: string | null;

  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => Boolean)
  completed!: boolean;
}

@ObjectType()
export class SportsScoreboard {
  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => [SportsScorePeriod])
  periods!: SportsScorePeriod[];

  @Field(() => Int, { nullable: true })
  activePeriod?: number | null;

  @Field(() => String, { nullable: true })
  metadataJson?: string | null;
}

@ObjectType()
export class SportsVenue {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  placePresetId!: string;

  @Field(() => PlacePreset, { nullable: true })
  placePreset?: PlacePreset | null;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  courtLabel?: string | null;

  @Field(() => Int, { nullable: true })
  capacity?: number | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  parentVenueId?: string | null;

  @Field(() => Int)
  revision!: number;

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
export class SportsStage {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsStageType)
  type!: SportsStageType;

  @Field(() => Int)
  displayOrder!: number;

  @Field(() => String)
  settingsJson!: string;

  @Field(() => Int)
  generationRevision!: number;

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
export class SportsMatchPeriodTimer {
  @Field(() => Int)
  periodNumber!: number;

  @Field(() => Float, { nullable: true })
  startedAtUnixMs?: number | null;

  @Field(() => Float, { nullable: true })
  pausedAtUnixMs?: number | null;

  @Field(() => Float)
  elapsedBeforePauseMs!: number;

  @Field(() => Float)
  scheduledStartOffsetMs!: number;

  @Field(() => Float, { nullable: true })
  capMs?: number | null;

  @Field(() => Boolean)
  allowOvertime!: boolean;
}

@ObjectType()
export class SportsMatch {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event | null;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => SportsStage, { nullable: true })
  stage?: SportsStage | null;

  @Field(() => String, { nullable: true })
  venueId?: string | null;

  @Field(() => SportsVenue, { nullable: true })
  venue?: SportsVenue | null;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => SportsRegistration, { nullable: true })
  homeRegistration?: SportsRegistration | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => SportsRegistration, { nullable: true })
  awayRegistration?: SportsRegistration | null;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => SportsMatchState)
  canonicalState!: SportsMatchState;

  @Field(() => SportsReviewStatus)
  reviewStatus!: SportsReviewStatus;

  @Field(() => SportsScoreboard)
  scoreboard!: SportsScoreboard;

  @Field(() => SportsScoreboard)
  canonicalScoreboard!: SportsScoreboard;

  @Field(() => String, { nullable: true })
  winnerRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  loserRegistrationId?: string | null;

  @Field(() => SportsLossReason, { nullable: true })
  lossReason?: SportsLossReason | null;

  @Field(() => String, { nullable: true })
  lossReasonDetail?: string | null;

  @Field(() => Boolean, { nullable: true })
  drawWillReschedule?: boolean | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String)
  occurrencesJson!: string;

  @Field(() => SportsLivestreamProvider, { nullable: true })
  livestreamProvider?: SportsLivestreamProvider | null;

  @Field(() => String, { nullable: true })
  livestreamUrl?: string | null;

  @Field(() => Date, { nullable: true })
  timerStartedAt?: Date | null;

  @Field(() => Float, { nullable: true })
  timerStartedAtUnixMs?: number | null;

  @Field(() => Date, { nullable: true })
  timerPausedAt?: Date | null;

  @Field(() => Float, { nullable: true })
  timerPausedAtUnixMs?: number | null;

  @Field(() => Int)
  elapsedBeforePauseMs!: number;

  @Field(() => [SportsMatchPeriodTimer])
  periodTimers!: SportsMatchPeriodTimer[];

  @Field(() => Boolean)
  overallTimerEnabled!: boolean;

  @Field(() => Boolean)
  periodTimerEnabled!: boolean;

  @Field(() => Int, { nullable: true })
  roundNumber?: number | null;

  @Field(() => Int, { nullable: true })
  bracketPosition?: number | null;

  @Field(() => String, { nullable: true })
  groupKey?: string | null;

  @Field(() => String, { nullable: true })
  winnerAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  winnerAdvancesToSide?: SportsBracketSide | null;

  @Field(() => String, { nullable: true })
  loserAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  loserAdvancesToSide?: SportsBracketSide | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => Int)
  operationSequence!: number;

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
