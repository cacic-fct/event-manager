import { Field, InputType, Int } from '@nestjs/graphql';

import {
  SportsBracketSide,
  SportsLivestreamProvider,
  SportsMatchState,
  SportsStageType,
} from './sports-enums';

export * from './sports-match-operation-inputs';

@InputType()
export class SportsVenueCreateInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  placePresetId!: string;

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
}

@InputType()
export class SportsVenueUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => String, { nullable: true })
  placePresetId?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  courtLabel?: string | null;

  @Field(() => Int, { nullable: true })
  capacity?: number | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  parentVenueId?: string | null;
}

@InputType()
export class SportsStageCreateInput {
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
}

@InputType()
export class SportsStageUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedGenerationRevision!: number;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => SportsStageType, { nullable: true })
  type?: SportsStageType;

  @Field(() => Int, { nullable: true })
  displayOrder?: number;

  @Field(() => String, { nullable: true })
  settingsJson?: string;
}

@InputType()
export class SportsBracketParticipantInput {
  @Field(() => String)
  registrationId!: string;

  @Field(() => Int, { nullable: true })
  seed?: number | null;
}

@InputType()
export class SportsBracketGenerateInput {
  @Field(() => String)
  categoryId!: string;

  @Field(() => [SportsBracketParticipantInput])
  participants!: SportsBracketParticipantInput[];

  @Field(() => Boolean, { nullable: true })
  randomizeUnseeded?: boolean;

  @Field(() => String, { nullable: true })
  randomSeed?: string;

  @Field(() => Boolean, { nullable: true })
  replaceExistingDraft?: boolean;
}

@InputType()
export class SportsMatchCreateInput {
  @Field(() => String)
  categoryId!: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => String, { nullable: true })
  venueId?: string | null;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => Int, { nullable: true })
  roundNumber?: number | null;

  @Field(() => Int, { nullable: true })
  bracketPosition?: number | null;

  @Field(() => String, { nullable: true })
  groupKey?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => SportsLivestreamProvider, { nullable: true })
  livestreamProvider?: SportsLivestreamProvider | null;

  @Field(() => String, { nullable: true })
  livestreamUrl?: string | null;

  @Field(() => String, { nullable: true })
  winnerAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  winnerAdvancesToSide?: SportsBracketSide | null;

  @Field(() => String, { nullable: true })
  loserAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  loserAdvancesToSide?: SportsBracketSide | null;
}

@InputType()
export class SportsMatchUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => String, { nullable: true })
  venueId?: string | null;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => SportsMatchState, { nullable: true })
  state?: SportsMatchState;

  @Field(() => Int, { nullable: true })
  roundNumber?: number | null;

  @Field(() => Int, { nullable: true })
  bracketPosition?: number | null;

  @Field(() => String, { nullable: true })
  groupKey?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => SportsLivestreamProvider, { nullable: true })
  livestreamProvider?: SportsLivestreamProvider | null;

  @Field(() => String, { nullable: true })
  livestreamUrl?: string | null;

  @Field(() => String, { nullable: true })
  winnerAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  winnerAdvancesToSide?: SportsBracketSide | null;

  @Field(() => String, { nullable: true })
  loserAdvancesToId?: string | null;

  @Field(() => SportsBracketSide, { nullable: true })
  loserAdvancesToSide?: SportsBracketSide | null;
}

@InputType()
export class SportsScorePeriodInput {
  @Field(() => Int)
  number!: number;

  @Field(() => String, { nullable: true })
  label?: string | null;

  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => Boolean, { nullable: true })
  completed?: boolean;
}

@InputType()
export class SportsScoreboardInput {
  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => [SportsScorePeriodInput], { nullable: true })
  periods?: SportsScorePeriodInput[];

  @Field(() => Int, { nullable: true })
  activePeriod?: number | null;

  @Field(() => String, { nullable: true })
  metadataJson?: string | null;
}
