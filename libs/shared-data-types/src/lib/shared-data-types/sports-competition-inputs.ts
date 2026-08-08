import { Field, InputType, Int } from '@nestjs/graphql';

import {
  SportsBracketSide,
  SportsLivestreamProvider,
  SportsLossReason,
  SportsMatchActionType,
  SportsMatchState,
  SportsOfficialRole,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsScoreEntrySource,
  SportsStageType,
} from './sports-enums';

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

@InputType()
export class SportsMatchFinalizeInput {
  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => Boolean)
  draw!: boolean;

  @Field(() => Boolean, { nullable: true })
  drawWillReschedule?: boolean | null;

  @Field(() => String, { nullable: true })
  winnerRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  loserRegistrationId?: string | null;

  @Field(() => SportsLossReason, { nullable: true })
  lossReason?: SportsLossReason | null;

  @Field(() => String, { nullable: true })
  lossReasonDetail?: string | null;

  @Field(() => SportsScoreboardInput, { nullable: true })
  scoreboard?: SportsScoreboardInput | null;
}

@InputType()
export class SportsRosterEntryInput {
  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => SportsRosterRole, { nullable: true })
  role?: SportsRosterRole;

  @Field(() => SportsRosterEntryStatus, { nullable: true })
  status?: SportsRosterEntryStatus;

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;

  @Field(() => String, { nullable: true })
  roleMetadataJson?: string | null;
}

@InputType()
export class SportsMatchRosterUpsertInput {
  @Field(() => String)
  matchId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => Int, { nullable: true })
  expectedRevision?: number;

  @Field(() => SportsRosterStatus, { nullable: true })
  status?: SportsRosterStatus;

  @Field(() => [SportsRosterEntryInput])
  entries!: SportsRosterEntryInput[];
}

@InputType()
export class SportsMatchRosterCopyInput {
  @Field(() => String)
  sourceRosterId!: string;

  @Field(() => String)
  destinationMatchId!: string;

  @Field(() => Boolean, { nullable: true })
  replaceDraft?: boolean;
}

@InputType()
export class SportsRosterCheckInInput {
  @Field(() => String, {
    description:
      'Client-generated idempotency key. Replaying the same key and payload is safe; reusing it for another check-in is rejected.',
  })
  clientId!: string;

  @Field(() => String)
  rosterEntryId!: string;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Whether the player is present. False safely reverses an accidental check-in.',
  })
  present?: boolean;
}

@InputType()
export class SportsRosterScannerCheckInInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String, { description: 'Código Aztec do usuário lido pelo scanner.' })
  code!: string;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;
}

@InputType()
export class SportsOfficialAssignInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String, { nullable: true })
  matchId?: string | null;

  @Field(() => String)
  personId!: string;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;
}

@InputType()
export class SportsOfficialUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsOfficialRole, { nullable: true })
  role?: SportsOfficialRole;

  @Field(() => Boolean, { nullable: true })
  active?: boolean;
}

@InputType()
export class SportsMatchActionInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => SportsMatchActionType)
  type!: SportsMatchActionType;

  @Field(() => String)
  payloadJson!: string;

  @Field(() => String, { nullable: true })
  scorerRosterEntryId?: string | null;

  @Field(() => Date)
  authoredAt!: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;
}

@InputType()
export class CommitSportsMatchActionsInput {
  @Field(() => [SportsMatchActionInput])
  actions!: SportsMatchActionInput[];
}

@InputType()
export class SportsMatchActionReviewInput {
  @Field(() => String)
  actionId!: string;

  @Field(() => SportsReviewStatus)
  decision!: SportsReviewStatus;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => String, { nullable: true })
  correctedPayloadJson?: string | null;
}

@InputType()
export class SportsCategoryPlacementInput {
  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => String, { nullable: true })
  sourceMatchId?: string | null;

  @Field(() => Int)
  placement!: number;

  @Field(() => Int, { nullable: true })
  pointsAwarded?: number | null;
}

@InputType()
export class SportsTournamentScoreEntryInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String)
  teamId!: string;

  @Field(() => String, { nullable: true })
  sourceMatchId?: string | null;

  @Field(() => SportsScoreEntrySource)
  source!: SportsScoreEntrySource;

  @Field(() => Int)
  points!: number;

  @Field(() => String)
  reason!: string;
}

@InputType()
export class SportsTournamentScoreEntryUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String, { nullable: true })
  teamId?: string;

  @Field(() => SportsScoreEntrySource, { nullable: true })
  source?: SportsScoreEntrySource;

  @Field(() => Int, { nullable: true })
  points?: number;

  @Field(() => String, { nullable: true })
  reason?: string;
}
