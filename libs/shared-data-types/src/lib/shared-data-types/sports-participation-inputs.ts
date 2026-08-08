import { Field, InputType, Int } from '@nestjs/graphql';

import {
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsFormat,
  SportsIdentityType,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsPreset,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsScoringMode,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from './sports-enums';

@InputType()
export class SportsTournamentCreateInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => SportsTournamentStatus, { nullable: true })
  status?: SportsTournamentStatus;

  @Field(() => SportsScoringMode, { nullable: true })
  scoringMode?: SportsScoringMode;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionEnabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean;
}

@InputType()
export class SportsTournamentUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsTournamentStatus, { nullable: true })
  status?: SportsTournamentStatus;

  @Field(() => SportsScoringMode, { nullable: true })
  scoringMode?: SportsScoringMode;

  @Field(() => Boolean, { nullable: true })
  selfSubscriptionEnabled?: boolean;

  @Field(() => Boolean, { nullable: true })
  allowPlayerMultipleTeams?: boolean;

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
  periodsEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  maximumPeriods?: number | null;

  @Field(() => String, { nullable: true })
  periodLabel?: string | null;

  @Field(() => String)
  scoreRulesJson!: string;

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
  periodsEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  maximumPeriods?: number | null;

  @Field(() => String, { nullable: true })
  periodLabel?: string | null;

  @Field(() => String, { nullable: true })
  scoreRulesJson?: string;

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

@InputType()
export class SportsTeamCreateInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  institution?: string | null;

  @Field(() => SportsTeamStatus, { nullable: true })
  status?: SportsTeamStatus;
}

@InputType()
export class SportsTeamUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  institution?: string | null;

  @Field(() => SportsTeamStatus, { nullable: true })
  status?: SportsTeamStatus;
}

@InputType()
export class SportsTeamCloneInput {
  @Field(() => String)
  sourceTeamId!: string;

  @Field(() => String)
  destinationTournamentId!: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Boolean, { nullable: true })
  includeLogo?: boolean;

  @Field(() => Boolean, { nullable: true })
  includeRepresentatives?: boolean;

  @Field(() => Boolean, { nullable: true })
  includeMembers?: boolean;
}

@InputType()
export class SportsIdentityClaimInput {
  @Field(() => String)
  clientKey!: string;

  @Field(() => SportsIdentityType)
  type!: SportsIdentityType;

  @Field(() => String)
  value!: string;
}

@InputType()
export class SportsTeamMemberCreateInput {
  @Field(() => String)
  teamId!: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => SportsIdentityClaimInput, { nullable: true })
  identity?: SportsIdentityClaimInput;
}

@InputType()
export class SportsTeamMemberUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsTeamMemberStatus, { nullable: true })
  status?: SportsTeamMemberStatus;
}

@InputType()
export class SportsRepresentativeAssignInput {
  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  personId!: string;
}

@InputType()
export class SportsRepresentativeRevokeInput {
  @Field(() => String)
  representativeId!: string;
}

@InputType()
export class SportsRegistrationCreateInput {
  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => Int, { nullable: true })
  seed?: number | null;

  @Field(() => String, { nullable: true })
  formAnswersJson?: string | null;
}

@InputType()
export class SportsRegistrationUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsRegistrationStatus, { nullable: true })
  status?: SportsRegistrationStatus;

  @Field(() => Int, { nullable: true })
  seed?: number | null;

  @Field(() => String, { nullable: true })
  formAnswersJson?: string | null;
}

@InputType()
export class SportsRegistrationMemberUpsertInput {
  @Field(() => String)
  registrationId!: string;

  @Field(() => String)
  teamMemberId!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsEligibilityStatus, { nullable: true })
  eligibility?: SportsEligibilityStatus;
}

@InputType()
export class SportsParticipantUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => SportsParticipantStatus, { nullable: true })
  status?: SportsParticipantStatus;

  @Field(() => SportsPaymentStatus, { nullable: true })
  paymentStatus?: SportsPaymentStatus;

  @Field(() => String, { nullable: true })
  rejectionReason?: string | null;
}

@InputType()
export class SportsTeamChangeRequestInput {
  @Field(() => String)
  teamId!: string;

  @Field(() => SportsTeamChangeRequestType)
  type!: SportsTeamChangeRequestType;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => Int, { nullable: true })
  expectedRequestRevision?: number;

  @Field(() => String)
  baseFieldRevisionsJson!: string;

  @Field(() => String)
  deltaJson!: string;

  @Field(() => String, { nullable: true })
  pendingKey?: string;

  @Field(() => [SportsIdentityClaimInput], { nullable: true })
  identityClaims?: SportsIdentityClaimInput[];
}

@InputType()
export class SportsTeamChangeReviewInput {
  @Field(() => String)
  requestId!: string;

  @Field(() => Int)
  expectedRequestRevision!: number;

  @Field(() => SportsTeamChangeRequestStatus)
  decision!: SportsTeamChangeRequestStatus;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => String, { nullable: true })
  resolvedDeltaJson?: string | null;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Admin-only explicit override for field revision conflicts. Defaults to false.',
  })
  forceConflicts?: boolean;
}

@InputType()
export class SportsPlayerApplicationCreateInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  requestedTeamId!: string;

  @Field(() => [String])
  categoryIds!: string[];

  @Field(() => Boolean)
  noticeAccepted!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Major-event payment tier selected by the applicant. Required when the paid tournament exposes multiple tiers.',
  })
  paymentTier?: string | null;

  @Field(() => String, { nullable: true })
  pendingKey?: string;
}

@InputType()
export class SportsPlayerApplicationReviewInput {
  @Field(() => String)
  applicationId!: string;

  @Field(() => SportsApplicationStatus)
  decision!: SportsApplicationStatus;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;
}
