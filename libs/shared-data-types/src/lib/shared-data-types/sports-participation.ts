import { Field, Int, ObjectType } from '@nestjs/graphql';

import { EventGroup } from './event-groups';
import { EventForm } from './forms';
import { MajorEvent } from './major-events';
import { Person } from './people';
import {
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsFormat,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsParticipantSource,
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

  @Field(() => SportsScoringMode)
  scoringMode!: SportsScoringMode;

  @Field(() => Boolean)
  selfSubscriptionEnabled!: boolean;

  @Field(() => Boolean)
  allowPlayerMultipleTeams!: boolean;

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

  @Field(() => Boolean)
  periodsEnabled!: boolean;

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

@ObjectType()
export class SportsTournamentParticipant {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person | null;

  @Field(() => SportsParticipantSource)
  source!: SportsParticipantSource;

  @Field(() => SportsParticipantStatus)
  status!: SportsParticipantStatus;

  @Field(() => SportsPaymentStatus)
  paymentStatus!: SportsPaymentStatus;

  @Field(() => String, { nullable: true })
  majorEventSubscriptionId?: string | null;

  @Field(() => Date, { nullable: true })
  approvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  approvedById?: string | null;

  @Field(() => Date, { nullable: true })
  rejectedAt?: Date | null;

  @Field(() => String, { nullable: true })
  rejectedById?: string | null;

  @Field(() => String, { nullable: true })
  rejectionReason?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsTeamMember {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  participantId!: string;

  @Field(() => SportsTournamentParticipant, { nullable: true })
  participant?: SportsTournamentParticipant | null;

  @Field(() => SportsTeamMemberStatus)
  status!: SportsTeamMemberStatus;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date, { nullable: true })
  approvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  approvedById?: string | null;

  @Field(() => Date, { nullable: true })
  rejectedAt?: Date | null;

  @Field(() => String, { nullable: true })
  rejectedById?: string | null;

  @Field(() => String, { nullable: true })
  rejectionReason?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsTeamRepresentative {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person | null;

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

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsRegistration {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => SportsTeam, { nullable: true })
  team?: SportsTeam | null;

  @Field(() => String)
  categoryId!: string;

  @Field(() => SportsCategory, { nullable: true })
  category?: SportsCategory | null;

  @Field(() => SportsRegistrationStatus)
  status!: SportsRegistrationStatus;

  @Field(() => Int, { nullable: true })
  seed?: number | null;

  @Field(() => String, { nullable: true })
  formAnswersJson?: string | null;

  @Field(() => String, { nullable: true })
  formSchemaSnapshotJson?: string | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => Date, { nullable: true })
  approvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  approvedById?: string | null;

  @Field(() => Date, { nullable: true })
  rejectedAt?: Date | null;

  @Field(() => String, { nullable: true })
  rejectedById?: string | null;

  @Field(() => String, { nullable: true })
  rejectionReason?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsRegistrationMember {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  teamMemberId!: string;

  @Field(() => SportsTeamMember, { nullable: true })
  teamMember?: SportsTeamMember | null;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsEligibilityStatus)
  eligibility!: SportsEligibilityStatus;

  @Field(() => Date, { nullable: true })
  approvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  approvedById?: string | null;

  @Field(() => String, { nullable: true })
  rejectionReason?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

@ObjectType()
export class SportsIdentityClaim {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  requestId!: string;

  @Field(() => SportsIdentityType)
  type!: SportsIdentityType;

  @Field(() => String)
  displayHint!: string;

  @Field(() => SportsIdentityClaimStatus)
  status!: SportsIdentityClaimStatus;

  @Field(() => String, { nullable: true })
  resolvedPersonId?: string | null;

  @Field(() => Person, { nullable: true })
  resolvedPerson?: Person | null;

  @Field(() => Date, { nullable: true })
  resolvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  resolvedById?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsTeamChangeRequest {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  submittedByPersonId!: string;

  @Field(() => SportsTeamChangeRequestType)
  type!: SportsTeamChangeRequestType;

  @Field(() => SportsTeamChangeRequestStatus)
  status!: SportsTeamChangeRequestStatus;

  @Field(() => Int)
  requestRevision!: number;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => String)
  baseFieldRevisionsJson!: string;

  @Field(() => String)
  deltaJson!: string;

  @Field(() => String, { nullable: true })
  pendingKey?: string | null;

  @Field(() => [SportsIdentityClaim])
  identityClaims!: SportsIdentityClaim[];

  @Field(() => Date, { nullable: true })
  reviewedAt?: Date | null;

  @Field(() => String, { nullable: true })
  reviewedById?: string | null;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => String, { nullable: true })
  resolvedDeltaJson?: string | null;

  @Field(() => Int, { nullable: true })
  resultingRevision?: number | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class SportsPlayerApplicationCategory {
  @Field(() => String)
  applicationId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => SportsCategory, { nullable: true })
  category?: SportsCategory | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class SportsPlayerApplication {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  applicantPersonId!: string;

  @Field(() => Person, { nullable: true })
  applicantPerson?: Person | null;

  @Field(() => String)
  requestedTeamId!: string;

  @Field(() => SportsTeam, { nullable: true })
  requestedTeam?: SportsTeam | null;

  @Field(() => SportsApplicationStatus)
  status!: SportsApplicationStatus;

  @Field(() => Date)
  noticeAcceptedAt!: Date;

  @Field(() => String, { nullable: true })
  pendingKey?: string | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;

  @Field(() => [SportsPlayerApplicationCategory])
  categoryChoices!: SportsPlayerApplicationCategory[];

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

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}

export interface SportsParticipantPaymentChangedPayload {
  type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED';
  reason:
    | 'SUBMITTED'
    | 'REVIEWED'
    | 'RECEIPT_UPLOADED'
    | 'PAYMENT_APPROVED'
    | 'PAYMENT_REJECTED'
    | 'PAYMENT_REVIEW_UNDONE';
  tournamentId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  participantStatus: SportsParticipantStatus;
  paymentStatus: SportsPaymentStatus;
  applications: Array<{
    id: string;
    status: SportsApplicationStatus;
  }>;
  occurredAt: string;
}
