import {
  SportsMatchState,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
} from '@cacic-fct/shared-data-types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

import { PublicSportsMatch, PublicSportsTeam } from './sports-read-public-match.models';
import { PublicSportsTournamentDetail } from './sports-read-public-tournament.models';

@ObjectType()
export class CurrentUserSportsRosterEntryRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsRosterEntryStatus)
  status!: SportsRosterEntryStatus;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date | null;

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;

  @Field(() => String, { nullable: true })
  roleMetadataJson?: string | null;
}

@ObjectType()
export class CurrentUserSportsOperationsRosterRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => Int)
  revision!: number;

  @Field(() => SportsRosterStatus)
  status!: SportsRosterStatus;

  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => [CurrentUserSportsRosterEntryRead])
  entries!: CurrentUserSportsRosterEntryRead[];
}

@ObjectType()
export class CurrentUserSportsMatchOperationsRead {
  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  revision!: number;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => [CurrentUserSportsOperationsRosterRead])
  rosters!: CurrentUserSportsOperationsRosterRead[];

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String)
  occurrencesJson!: string;
}

@ObjectType()
export class CurrentUserSportsEligibleLineupMemberRead {
  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;
}

@ObjectType()
export class CurrentUserSportsLineupRosterEntryRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsRosterEntryStatus)
  status!: SportsRosterEntryStatus;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date | null;

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;

  @Field(() => String, { nullable: true })
  roleMetadataJson?: string | null;
}

@ObjectType()
export class CurrentUserSportsLineupRosterRead {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  revision!: number;

  @Field(() => SportsRosterStatus)
  status!: SportsRosterStatus;

  @Field(() => [CurrentUserSportsLineupRosterEntryRead])
  entries!: CurrentUserSportsLineupRosterEntryRead[];
}

@ObjectType()
export class CurrentUserSportsLineupRead {
  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  matchRevision!: number;

  @Field(() => String)
  registrationId!: string;

  @Field(() => String, { nullable: true })
  homeRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  awayRegistrationId?: string | null;

  @Field(() => [CurrentUserSportsEligibleLineupMemberRead])
  eligibleMembers!: CurrentUserSportsEligibleLineupMemberRead[];

  @Field(() => CurrentUserSportsLineupRosterRead, { nullable: true })
  roster?: CurrentUserSportsLineupRosterRead | null;
}

@ObjectType()
export class CurrentUserSportsTournamentDetail {
  @Field(() => PublicSportsTournamentDetail)
  tournament!: PublicSportsTournamentDetail;

  @Field(() => Boolean)
  imageLicenseAgreementAccepted!: boolean;

  @Field(() => [PublicSportsMatch])
  orderedMatches!: PublicSportsMatch[];
}
