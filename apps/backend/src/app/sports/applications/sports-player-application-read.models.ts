import {
  SportsApplicationStatus,
  SportsParticipantStatus,
  SportsPaymentStatus,
} from '@cacic-fct/shared-data-types';
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SportsPlayerApplicationTeamSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  institution?: string | null;

  @Field(() => String, { nullable: true })
  logoUrl?: string | null;
}

@ObjectType()
export class SportsPlayerApplicationCategorySummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  division?: string | null;
}

@ObjectType()
export class SportsPlayerApplicationApplicantSummary {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class CurrentUserSportsPlayerApplicationRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => SportsPlayerApplicationTeamSummary, { nullable: true })
  requestedTeam?: SportsPlayerApplicationTeamSummary | null;

  @Field(() => [SportsPlayerApplicationCategorySummary])
  categories!: SportsPlayerApplicationCategorySummary[];

  @Field(() => SportsApplicationStatus)
  status!: SportsApplicationStatus;

  @Field(() => SportsParticipantStatus, { nullable: true })
  participantStatus?: SportsParticipantStatus | null;

  @Field(() => SportsPaymentStatus, { nullable: true })
  paymentStatus?: SportsPaymentStatus | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;

  @Field(() => Date)
  noticeAcceptedAt!: Date;

  @Field(() => Date, { nullable: true })
  reviewedAt?: Date | null;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class AdminSportsPlayerApplicationRead extends CurrentUserSportsPlayerApplicationRead {
  @Field(() => SportsPlayerApplicationApplicantSummary)
  applicant!: SportsPlayerApplicationApplicantSummary;
}
