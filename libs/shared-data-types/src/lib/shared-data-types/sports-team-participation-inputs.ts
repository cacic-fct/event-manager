import { Field, InputType, Int } from '@nestjs/graphql';

import {
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsIdentityType,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from './sports-enums';

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
    description: 'Admin-only explicit override for field revision conflicts. Defaults to false.',
  })
  forceConflicts?: boolean;
}

@InputType()
export class SportsPlayerApplicationCreateInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  requestedTeamId?: string | null;

  @Field(() => [String])
  categoryIds!: string[];

  @Field(() => Boolean)
  noticeAccepted!: boolean;

  @Field(() => Boolean, { nullable: true })
  imageLicenseAgreementAccepted?: boolean | null;

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
export class SportsRepresentativeApplicationReviewInput {
  @Field(() => String)
  applicationId!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => Boolean)
  approved!: boolean;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;
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
