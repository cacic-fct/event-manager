import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { Person } from './people';
import {
  SportsMatchActionType,
  SportsOfficialRole,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsScoreEntrySource,
} from './sports-enums';
import { SportsMatch } from './sports-competition';
import { SportsRegistration, SportsRegistrationMember, SportsTeam } from './sports-participation';

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
