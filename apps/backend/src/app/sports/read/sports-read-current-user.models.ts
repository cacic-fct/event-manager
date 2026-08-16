import {
  SportsAthleteIdentifierMode,
  SportsMatchState,
  SportsOfficialRole,
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

  @Field(() => String, { description: 'Opaque key used to synchronize check-in categories for the same person.' })
  attendanceSyncKey!: string;

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
export class CurrentUserSportsOfficialRead {
  @Field(() => String)
  id!: string;

  @Field(() => String, { description: 'Opaque key used to synchronize check-in categories for the same person.' })
  attendanceSyncKey!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date | null;
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

  @Field(() => [CurrentUserSportsOfficialRead])
  officials!: CurrentUserSportsOfficialRead[];

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

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;
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

  @Field(() => [CurrentUserSportsAthleteProfile])
  athleteProfiles!: CurrentUserSportsAthleteProfile[];
}

@ObjectType()
export class CurrentUserSportsAthleteProfile {
  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String)
  categoryEmoji!: string;

  @Field(() => SportsAthleteIdentifierMode)
  athleteIdentifierMode!: SportsAthleteIdentifierMode;

  @Field(() => String, { nullable: true })
  joiningInstructions?: string | null;

  @Field(() => String, { nullable: true })
  gameNickname?: string | null;

  @Field(() => String, { nullable: true })
  gameAccountName?: string | null;

  @Field(() => String, { nullable: true })
  gameAccountUrl?: string | null;
}
