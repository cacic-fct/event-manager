import {
  SportsCategory,
  SportsCategoryPlacement,
  SportsMatch,
  SportsMatchAction,
  SportsMatchRoster,
  SportsOfficialAssignment,
  SportsRegistration,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsEligibilityStatus,
  SportsTeamMemberStatus,
  SportsStage,
  SportsStanding,
  SportsTeam,
  SportsTeamChangeRequest,
  SportsTournament,
  SportsTournamentScoreEntry,
  SportsVenue,
} from '@cacic-fct/shared-data-types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminSportsTournamentTeamRegistrationSummary {
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
export class AdminSportsTournamentTeamSummary {
  @Field(() => SportsTeam)
  team!: SportsTeam;

  @Field(() => [AdminSportsTournamentTeamRegistrationSummary])
  registrations!: AdminSportsTournamentTeamRegistrationSummary[];
}

@ObjectType()
export class AdminSportsTournamentRead {
  @Field(() => SportsTournament)
  tournament!: SportsTournament;

  @Field(() => [SportsCategory])
  categories!: SportsCategory[];

  @Field(() => [SportsTeam])
  teams!: SportsTeam[];

  @Field(() => [SportsTournamentScoreEntry])
  scoreEntries!: SportsTournamentScoreEntry[];

  @Field(() => [SportsVenue])
  venues!: SportsVenue[];

  @Field(() => [SportsOfficialAssignment])
  officials!: SportsOfficialAssignment[];

  @Field(() => [AdminSportsTournamentTeamSummary])
  teamSummaries!: AdminSportsTournamentTeamSummary[];
}

@ObjectType()
export class AdminSportsTournamentMajorEventSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Boolean)
  isPaymentRequired!: boolean;
}

@ObjectType()
export class AdminSportsTournamentListItem {
  @Field(() => SportsTournament)
  tournament!: SportsTournament;

  @Field(() => AdminSportsTournamentMajorEventSummary)
  majorEvent!: AdminSportsTournamentMajorEventSummary;

  @Field(() => Int)
  categoryCount!: number;

  @Field(() => Int)
  teamCount!: number;

  @Field(() => Int)
  pendingApplicationCount!: number;

  @Field(() => Int)
  pendingReviewCount!: number;
}

@ObjectType()
export class AdminSportsCategoryRead {
  @Field(() => SportsCategory)
  category!: SportsCategory;

  @Field(() => [SportsRegistration])
  registrations!: SportsRegistration[];

  @Field(() => [SportsStage])
  stages!: SportsStage[];

  @Field(() => [SportsMatch])
  matches!: SportsMatch[];

  @Field(() => [SportsStanding])
  standings!: SportsStanding[];

  @Field(() => [SportsCategoryPlacement])
  placements!: SportsCategoryPlacement[];

  @Field(() => [SportsOfficialAssignment])
  officials!: SportsOfficialAssignment[];
}

@ObjectType()
export class SportsLimitedPerson {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class AdminSportsTeamCategoryAssignmentSummary {
  @Field(() => String)
  registrationId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String)
  categoryEmoji!: string;
}

@ObjectType()
export class AdminSportsTeamMemberSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  participantId!: string;

  @Field(() => SportsTeamMemberStatus)
  status!: SportsTeamMemberStatus;

  @Field(() => Int)
  revision!: number;

  @Field(() => SportsLimitedPerson)
  person!: SportsLimitedPerson;

  @Field(() => [AdminSportsTeamCategoryAssignmentSummary])
  categoryAssignments!: AdminSportsTeamCategoryAssignmentSummary[];
}

@ObjectType()
export class AdminSportsTeamRepresentativeSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  teamId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => SportsLimitedPerson)
  person!: SportsLimitedPerson;

  @Field(() => Boolean)
  active!: boolean;

  @Field(() => Date)
  assignedAt!: Date;

  @Field(() => Date, { nullable: true })
  revokedAt?: Date | null;
}

@ObjectType()
export class AdminSportsRegistrationMemberSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  teamMemberId!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;

  @Field(() => SportsEligibilityStatus)
  eligibility!: SportsEligibilityStatus;

  @Field(() => SportsLimitedPerson)
  person!: SportsLimitedPerson;
}

@ObjectType()
export class AdminSportsTeamRead {
  @Field(() => SportsTeam)
  team!: SportsTeam;

  @Field(() => [AdminSportsTeamMemberSummary])
  members!: AdminSportsTeamMemberSummary[];

  @Field(() => [AdminSportsTeamRepresentativeSummary])
  representatives!: AdminSportsTeamRepresentativeSummary[];

  @Field(() => [SportsRegistration])
  registrations!: SportsRegistration[];

  @Field(() => [SportsTeamChangeRequest])
  changeRequests!: SportsTeamChangeRequest[];
}

@ObjectType()
export class AdminSportsRegistrationRead {
  @Field(() => SportsRegistration)
  registration!: SportsRegistration;

  @Field(() => [AdminSportsRegistrationMemberSummary])
  members!: AdminSportsRegistrationMemberSummary[];

  @Field(() => [SportsMatchRoster])
  rosters!: SportsMatchRoster[];
}

@ObjectType()
export class AdminSportsMatchReviewRead {
  @Field(() => SportsMatch)
  match!: SportsMatch;

  @Field(() => [SportsMatchAction])
  actions!: SportsMatchAction[];

  @Field(() => [SportsMatchRoster])
  rosters!: SportsMatchRoster[];

  @Field(() => [SportsOfficialAssignment])
  officials!: SportsOfficialAssignment[];
}

@ObjectType()
export class AdminSportsMatchActionReview {
  @Field(() => SportsMatchAction)
  action!: SportsMatchAction;

  @Field(() => SportsMatch)
  match!: SportsMatch;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String, { nullable: true })
  homeTeamName?: string | null;

  @Field(() => String, { nullable: true })
  awayTeamName?: string | null;
}
