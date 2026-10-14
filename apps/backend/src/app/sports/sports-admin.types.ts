import {
  Prisma,
  SportsAthleteIdentifierMode,
  AttendanceEligibility,
  EventAudience,
  SportsCategoryStatus,
  SportsBracketSide,
  SportsFormat,
  SportsLivestreamProvider,
  SportsPreset,
  SportsScoringMode,
  SportsTournamentStatus,
} from '@prisma/client';

export interface CreateSportsTournamentInput {
  name: string;
  emoji?: string;
  startDate: Date;
  endDate: Date;
  description?: string | null;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  selfSubscriptionEnabled?: boolean;
  selfSubscriptionAllowNoTeam?: boolean;
  selfSubscriptionAllowNoCategory?: boolean;
  allowPlayerMultipleTeams?: boolean;
  shouldIssueCertificate?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface UpdateSportsTournamentInput {
  expectedRevision: number;
  status?: SportsTournamentStatus;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  finishedAt?: Date | null;
  selfSubscriptionEnabled?: boolean;
  selfSubscriptionAllowNoTeam?: boolean;
  selfSubscriptionAllowNoCategory?: boolean;
  allowPlayerMultipleTeams?: boolean;
  shouldIssueCertificate?: boolean;
  scoringMode?: SportsScoringMode;
}

export interface CreateSportsCategoryInput {
  /** Internal transfer-only stable ID; the GraphQL create input does not expose it. */
  id?: string;
  /** Avoid creating person-linked registration rows during configuration imports. */
  initializeTeamRegistrations?: boolean;
  /** Non-personal settings carried by the category's backing EventGroup. */
  backingEventGroup?: SportsCategoryBackingGroupSettings;
  tournamentId: string;
  eventGroupId?: string;
  name: string;
  emoji?: string;
  sport: SportsPreset;
  customSportName?: string | null;
  division?: string | null;
  format: SportsFormat;
  status?: SportsCategoryStatus;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  minimumRosterSize?: number | null;
  maximumRosterSize?: number | null;
  maximumCaptains?: number | null;
  maximumCoaches?: number | null;
  allowPlayerMultipleTeams?: boolean | null;
  shouldIssueCertificate?: boolean | null;
  athleteIdentifierMode?: SportsAthleteIdentifierMode;
  joiningInstructions?: string | null;
  periodsEnabled?: boolean;
  maximumPeriods?: number | null;
  periodLabel?: string | null;
  timerRules?: Prisma.InputJsonValue;
  scoreRules: Prisma.InputJsonValue;
  overallScoringRules?: Prisma.InputJsonValue;
  rosterRules: Prisma.InputJsonValue;
  bracketRules: Prisma.InputJsonValue;
  standingsRules: Prisma.InputJsonValue;
  rulesText?: string | null;
  registrationFormId?: string | null;
}

export interface SportsCategoryBackingGroupSettings {
  audience?: EventAudience;
  audienceCourseCodes?: string[];
  interestEnabled?: boolean;
  requiresImageLicenseAgreement?: boolean;
  attendanceEligibility?: AttendanceEligibility | null;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  shouldIssueCertificateForEachEvent?: boolean;
  shouldIssuePartialCertificate?: boolean;
}

export interface CreateSportsMatchInput {
  /** Internal transfer-only stable ID; the GraphQL create input does not expose it. */
  id?: string;
  /** Stable ID for the backing Event when the importer creates it with the match. */
  backingEventId?: string;
  /** Internal transfer-only guard that prevents new backing Events from being published. */
  forceBackingEventDraft?: boolean;
  categoryId: string;
  eventId?: string;
  name?: string;
  stageId?: string | null;
  venueId?: string | null;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  startDate?: Date;
  endDate?: Date;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  notes?: string | null;
  livestreamProvider?: SportsLivestreamProvider | null;
  livestreamUrl?: string | null;
  publishImmediately?: boolean;
  winnerAdvancesToId?: string | null;
  winnerAdvancesToSide?: SportsBracketSide | null;
  loserAdvancesToId?: string | null;
  loserAdvancesToSide?: SportsBracketSide | null;
}
