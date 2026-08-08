import {
  SportsApplicationStatus,
  SportsCategory,
  SportsCategoryPlacement,
  SportsFormat,
  SportsIdentityType,
  SportsLossReason,
  SportsMatch,
  SportsMatchPeriodTimer,
  SportsMatchAction,
  SportsMatchState,
  SportsMatchRoster,
  SportsOfficialRole,
  SportsOfficialAssignment,
  SportsPreset,
  SportsRegistration,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsEligibilityStatus,
  SportsTeamMemberStatus,
  SportsStage,
  SportsStageType,
  SportsStanding,
  SportsTeam,
  SportsTeamChangeRequest,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTournament,
  SportsTournamentScoreEntry,
  SportsVenue,
} from '@cacic-fct/shared-data-types';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

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
export class PublicSportsTeam {
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
export class RepresentativeSportsJoinQueueRead {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  applicantName!: string;

  @Field(() => String, { nullable: true })
  identityDocumentHint?: string | null;

  @Field(() => [String])
  categoryNames!: string[];

  @Field(() => SportsApplicationStatus)
  status!: SportsApplicationStatus;
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

  @Field(() => [RepresentativeSportsJoinQueueRead])
  joinQueue!: RepresentativeSportsJoinQueueRead[];
}

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
export class PublicSportsScorePeriod {
  @Field(() => Int)
  number!: number;

  @Field(() => String)
  label!: string;

  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => Boolean)
  completed!: boolean;
}

@ObjectType()
export class PublicSportsScoreboard {
  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => [PublicSportsScorePeriod])
  periods!: PublicSportsScorePeriod[];

  @Field(() => Int, { nullable: true })
  activePeriod?: number | null;
}

@ObjectType()
export class PublicSportsMatchSchedule {
  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  venueName?: string | null;

  @Field(() => String, { nullable: true })
  courtLabel?: string | null;
}

@ObjectType()
export class PublicSportsRosterEntry {
  @Field(() => String)
  name!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;
}

@ObjectType()
export class PublicSportsRoster {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => [PublicSportsRosterEntry])
  entries!: PublicSportsRosterEntry[];
}

@ObjectType()
export class PublicSportsOfficial {
  @Field(() => String)
  name!: string;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;
}

@ObjectType()
export class PublicSportsMatch {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  homeTeam?: PublicSportsTeam | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  awayTeam?: PublicSportsTeam | null;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => PublicSportsScoreboard)
  scoreboard!: PublicSportsScoreboard;

  @Field(() => PublicSportsTeam, { nullable: true })
  winner?: PublicSportsTeam | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  loser?: PublicSportsTeam | null;

  @Field(() => SportsLossReason, { nullable: true })
  lossReason?: SportsLossReason | null;

  @Field(() => String, { nullable: true })
  lossReasonDetail?: string | null;

  @Field(() => Boolean, { nullable: true })
  drawWillReschedule?: boolean | null;

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

  @Field(() => Float, { nullable: true })
  timerPeriodDurationMs?: number | null;

  @Field(() => [Float])
  timerPeriodStartOffsetsMs!: number[];

  @Field(() => Boolean)
  timerAllowOvertime!: boolean;

  @Field(() => Int, { nullable: true })
  roundNumber?: number | null;

  @Field(() => Int, { nullable: true })
  bracketPosition?: number | null;

  @Field(() => String, { nullable: true })
  groupKey?: string | null;

  @Field(() => PublicSportsMatchSchedule)
  schedule!: PublicSportsMatchSchedule;

  @Field(() => [PublicSportsRoster])
  rosters!: PublicSportsRoster[];

  @Field(() => [PublicSportsOfficial])
  officials!: PublicSportsOfficial[];

  @Field(() => String, { nullable: true })
  livestreamProvider?: string | null;

  @Field(() => String, { nullable: true })
  livestreamUrl?: string | null;
}

@ObjectType()
export class PublicSportsStanding {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

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
}

@ObjectType()
export class PublicSportsPlacement {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  placement!: number;

  @Field(() => Int, { nullable: true })
  pointsAwarded?: number | null;
}

@ObjectType()
export class PublicSportsBracket {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsStageType)
  type!: SportsStageType;

  @Field(() => Int)
  displayOrder!: number;

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];
}

@ObjectType()
export class PublicSportsCategory {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => SportsPreset)
  sport!: SportsPreset;

  @Field(() => String, { nullable: true })
  customSportName?: string | null;

  @Field(() => String, { nullable: true })
  division?: string | null;

  @Field(() => SportsFormat)
  format!: SportsFormat;

  @Field(() => String, { nullable: true })
  rulesText?: string | null;

  @Field(() => [PublicSportsStanding])
  standings!: PublicSportsStanding[];

  @Field(() => [PublicSportsPlacement])
  placements!: PublicSportsPlacement[];

  @Field(() => [PublicSportsBracket])
  brackets!: PublicSportsBracket[];

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];
}

@ObjectType()
export class PublicSportsOverallScore {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  points!: number;
}

@ObjectType()
export class PublicSportsPaymentTier {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int)
  value!: number;
}

@ObjectType()
export class PublicSportsTournamentDetail {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Boolean)
  selfSubscriptionEnabled!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoTeam!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoCategory!: boolean;

  @Field(() => Boolean)
  isPaymentRequired!: boolean;

  @Field(() => [PublicSportsPaymentTier])
  paymentTiers!: PublicSportsPaymentTier[];

  @Field(() => [PublicSportsTeam])
  teams!: PublicSportsTeam[];

  @Field(() => [PublicSportsCategory])
  categories!: PublicSportsCategory[];

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];

  @Field(() => [PublicSportsOverallScore])
  overallScores!: PublicSportsOverallScore[];
}

@ObjectType()
export class CurrentUserSportsTournamentDetail {
  @Field(() => PublicSportsTournamentDetail)
  tournament!: PublicSportsTournamentDetail;

  @Field(() => [PublicSportsMatch])
  orderedMatches!: PublicSportsMatch[];
}
