import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { Event, PlacePreset } from './events';
import { Person } from './people';
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
import { SportsRegistration, SportsRegistrationMember, SportsTeam } from './sports-participation';

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

@ObjectType()
export class SportsMatchRoster {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  matchId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => SportsRegistration, { nullable: true })
  registration?: SportsRegistration | null;

  @Field(() => SportsRosterStatus)
  status!: SportsRosterStatus;

  @Field(() => Int)
  revision!: number;

  @Field(() => Boolean)
  manuallyEdited!: boolean;

  @Field(() => String, { nullable: true })
  copiedFromRosterId?: string | null;

  @Field(() => [SportsMatchRosterEntry])
  entries!: SportsMatchRosterEntry[];

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsMatchRosterEntry {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  rosterId!: string;

  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => SportsRegistrationMember, { nullable: true })
  registrationMember?: SportsRegistrationMember | null;

  @Field(() => SportsRosterEntryStatus)
  status!: SportsRosterEntryStatus;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;

  @Field(() => String, { nullable: true })
  roleMetadataJson?: string | null;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date | null;

  @Field(() => String, { nullable: true })
  checkedInById?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsOfficialAssignment {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String, { nullable: true })
  matchId?: string | null;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person | null;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;

  @Field(() => Boolean)
  active!: boolean;

  @Field(() => Date)
  assignedAt!: Date;

  @Field(() => String)
  assignedById!: string;

  @Field(() => Date, { nullable: true })
  revokedAt?: Date | null;

  @Field(() => String, { nullable: true })
  revokedById?: string | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsMatchAction {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  matchId!: string;

  @Field(() => String)
  clientId!: string;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => Int)
  sequence!: number;

  @Field(() => SportsMatchActionType)
  type!: SportsMatchActionType;

  @Field(() => String)
  payloadJson!: string;

  @Field(() => SportsReviewStatus)
  reviewStatus!: SportsReviewStatus;

  @Field(() => String, { nullable: true })
  scorerRosterEntryId?: string | null;

  @Field(() => String, { nullable: true })
  actorPersonId?: string | null;

  @Field(() => String, { nullable: true })
  actorUserId?: string | null;

  @Field(() => String, { nullable: true })
  actorRole?: string | null;

  @Field(() => Date)
  authoredAt!: Date;

  @Field(() => Date)
  submittedAt!: Date;

  @Field(() => Boolean)
  offline!: boolean;

  @Field(() => Date, { nullable: true })
  reviewedAt?: Date | null;

  @Field(() => String, { nullable: true })
  reviewedById?: string | null;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsStanding {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  stageId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => SportsRegistration, { nullable: true })
  registration?: SportsRegistration | null;

  @Field(() => Int)
  played!: number;

  @Field(() => Int)
  wins!: number;

  @Field(() => Int)
  draws!: number;

  @Field(() => Int)
  losses!: number;

  @Field(() => Float)
  scoreFor!: number;

  @Field(() => Float)
  scoreAgainst!: number;

  @Field(() => Float)
  points!: number;

  @Field(() => Int, { nullable: true })
  rank?: number | null;

  @Field(() => String)
  tiebreakDataJson!: string;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsCategoryPlacement {
  @Field(() => String)
  id!: string;

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

  @Field(() => Date, { nullable: true })
  confirmedAt?: Date | null;

  @Field(() => String, { nullable: true })
  confirmedById?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsTournamentScoreEntry {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String)
  teamId!: string;

  @Field(() => SportsTeam, { nullable: true })
  team?: SportsTeam | null;

  @Field(() => String, { nullable: true })
  sourceMatchId?: string | null;

  @Field(() => SportsScoreEntrySource)
  source!: SportsScoreEntrySource;

  @Field(() => Int)
  points!: number;

  @Field(() => String)
  reason!: string;

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

  @Field(() => String, { nullable: true })
  deletedById?: string | null;
}

@ObjectType()
export class SportsReviewResult {
  @Field(() => Boolean)
  accepted!: boolean;

  @Field(() => SportsReviewStatus)
  reviewStatus!: SportsReviewStatus;

  @Field(() => String)
  resourceId!: string;

  @Field(() => Int, { nullable: true })
  resultingRevision?: number | null;

  @Field(() => String, { nullable: true })
  message?: string | null;
}

@ObjectType()
export class SportsMatchActionCommitResult {
  @Field(() => String)
  clientId!: string;

  @Field(() => Boolean)
  accepted!: boolean;

  @Field(() => Boolean)
  duplicate!: boolean;

  @Field(() => Boolean)
  conflict!: boolean;

  @Field(() => Int)
  revision!: number;

  @Field(() => Int)
  operationSequence!: number;

  @Field(() => SportsMatch, { nullable: true })
  match?: SportsMatch | null;

  @Field(() => String, { nullable: true })
  message?: string | null;
}
