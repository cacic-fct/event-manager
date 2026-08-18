import {
  SportsIdentityType,
  SportsMatchState,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsEligibilityStatus,
  SportsTeamMemberStatus,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
} from '@cacic-fct/shared-data-types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

import { PublicSportsTeam } from './sports-read-public-match.models';

@ObjectType()
export class RepresentativeSportsIdentityHint {
  @Field(() => String)
  clientKey!: string;

  @Field(() => SportsIdentityType)
  type!: SportsIdentityType;

  @Field(() => String)
  displayHint!: string;
}

@ObjectType()
export class RepresentativeSportsTeamChange {
  @Field(() => String)
  id!: string;

  @Field(() => SportsTeamChangeRequestType)
  type!: SportsTeamChangeRequestType;

  @Field(() => SportsTeamChangeRequestStatus)
  status!: SportsTeamChangeRequestStatus;

  @Field(() => Int)
  requestRevision!: number;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => String)
  deltaJson!: string;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => [RepresentativeSportsIdentityHint])
  identityHints!: RepresentativeSportsIdentityHint[];

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class RepresentativeSportsCategoryRoleRead {
  @Field(() => String)
  registrationId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsEligibilityStatus)
  eligibility!: SportsEligibilityStatus;
}

@ObjectType()
export class RepresentativeSportsTeamMemberRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsTeamMemberStatus)
  status!: SportsTeamMemberStatus;

  @Field(() => Int)
  revision!: number;

  @Field(() => [RepresentativeSportsCategoryRoleRead])
  categoryRoles!: RepresentativeSportsCategoryRoleRead[];
}

@ObjectType()
export class RepresentativeSportsRegistrationRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String)
  categoryEmoji!: string;

  @Field(() => SportsRegistrationStatus)
  status!: SportsRegistrationStatus;
}

@ObjectType()
export class RepresentativeSportsMatchRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String)
  categoryEmoji!: string;

  @Field(() => PublicSportsTeam, { nullable: true })
  homeTeam?: PublicSportsTeam | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  awayTeam?: PublicSportsTeam | null;
}

@ObjectType()
export class RepresentativeSportsTeamWorkspace {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  teamRevision!: number;

  @Field(() => [RepresentativeSportsTeamChange])
  queuedChanges!: RepresentativeSportsTeamChange[];

  @Field(() => [RepresentativeSportsTeamMemberRead])
  members!: RepresentativeSportsTeamMemberRead[];

  @Field(() => [RepresentativeSportsRegistrationRead])
  registrations!: RepresentativeSportsRegistrationRead[];

  @Field(() => [RepresentativeSportsMatchRead])
  matches!: RepresentativeSportsMatchRead[];

  @Field(() => Int)
  joinQueueCount!: number;
}
