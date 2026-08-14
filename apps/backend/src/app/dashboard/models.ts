import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { SportsMatchState, SportsTournamentStatus } from '@cacic-fct/shared-data-types';

export const DashboardInsightSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type DashboardInsightSeverity = (typeof DashboardInsightSeverity)[keyof typeof DashboardInsightSeverity];
registerEnumType(DashboardInsightSeverity, {
  name: 'DashboardInsightSeverity',
});

export const DashboardInsightAction = {
  CREATE_EVENT: 'CREATE_EVENT',
  CREATE_EVENT_GROUP: 'CREATE_EVENT_GROUP',
  CREATE_MAJOR_EVENT: 'CREATE_MAJOR_EVENT',
  OPEN_EVENT: 'OPEN_EVENT',
  OPEN_EVENT_GROUP: 'OPEN_EVENT_GROUP',
  OPEN_MAJOR_EVENT: 'OPEN_MAJOR_EVENT',
  OPEN_ATTENDANCE: 'OPEN_ATTENDANCE',
  OPEN_CERTIFICATES: 'OPEN_CERTIFICATES',
  OPEN_MERGE_CANDIDATES: 'OPEN_MERGE_CANDIDATES',
  OPEN_PUBLICATION: 'OPEN_PUBLICATION',
  OPEN_SPORTS: 'OPEN_SPORTS',
} as const;
export type DashboardInsightAction = (typeof DashboardInsightAction)[keyof typeof DashboardInsightAction];
registerEnumType(DashboardInsightAction, {
  name: 'DashboardInsightAction',
});

export const DashboardCertificateTargetType = {
  EVENT: 'EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  MAJOR_EVENT: 'MAJOR_EVENT',
  MAJOR_EVENT_LECTURERS: 'MAJOR_EVENT_LECTURERS',
} as const;
export type DashboardCertificateTargetType =
  (typeof DashboardCertificateTargetType)[keyof typeof DashboardCertificateTargetType];
registerEnumType(DashboardCertificateTargetType, {
  name: 'DashboardCertificateTargetType',
});

export const DashboardInconsistencyType = {
  EVENT_GROUP_WITH_SINGLE_EVENT: 'EVENT_GROUP_WITH_SINGLE_EVENT',
  EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH: 'EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH',
  PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE: 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
  PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION: 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION',
  EVENT_WITHOUT_LECTURER: 'EVENT_WITHOUT_LECTURER',
  EVENT_WITHOUT_PLACE: 'EVENT_WITHOUT_PLACE',
  WEAK_EVENT_DESCRIPTION: 'WEAK_EVENT_DESCRIPTION',
  EVENT_SUBSCRIPTION_DATE_MISMATCH: 'EVENT_SUBSCRIPTION_DATE_MISMATCH',
  MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH: 'MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH',
  PLACE_DOUBLE_BOOKED: 'PLACE_DOUBLE_BOOKED',
  SPORTS_PLACE_DOUBLE_BOOKED: 'SPORTS_PLACE_DOUBLE_BOOKED',
  LECTURER_DOUBLE_BOOKED: 'LECTURER_DOUBLE_BOOKED',
  LECTURER_SELF_SUBSCRIBED: 'LECTURER_SELF_SUBSCRIBED',
  LECTURER_SELF_ATTENDED: 'LECTURER_SELF_ATTENDED',
  SUSPICIOUS_DURATION: 'SUSPICIOUS_DURATION',
  SUSPICIOUS_DATE: 'SUSPICIOUS_DATE',
  PLACEHOLDER_EMOJI: 'PLACEHOLDER_EMOJI',
  SPORTS_MATCH_WITHOUT_PLACE: 'SPORTS_MATCH_WITHOUT_PLACE',
  SPORTS_MATCH_PLACEHOLDER_EMOJI: 'SPORTS_MATCH_PLACEHOLDER_EMOJI',
  PUBLISHED_EVENT_HIDDEN_FROM_USERS: 'PUBLISHED_EVENT_HIDDEN_FROM_USERS',
  DRAFT_EVENT_VISIBLE_TO_ADMINS: 'DRAFT_EVENT_VISIBLE_TO_ADMINS',
  PUBLISHED_SPORTS_MATCH_HIDDEN_FROM_USERS: 'PUBLISHED_SPORTS_MATCH_HIDDEN_FROM_USERS',
  DRAFT_SPORTS_MATCH_VISIBLE_TO_ADMINS: 'DRAFT_SPORTS_MATCH_VISIBLE_TO_ADMINS',
  SPORTS_MATCH_PUBLIC_VISIBILITY_MISMATCH: 'SPORTS_MATCH_PUBLIC_VISIBILITY_MISMATCH',
  PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT: 'PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT',
  OVERDUE_SCHEDULED_PUBLICATION: 'OVERDUE_SCHEDULED_PUBLICATION',
  OVERDUE_SCHEDULED_SPORTS_MATCH_PUBLICATION: 'OVERDUE_SCHEDULED_SPORTS_MATCH_PUBLICATION',
  PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN: 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN',
  SPORTS_TOURNAMENT_WITHOUT_PUBLIC_CONTENT: 'SPORTS_TOURNAMENT_WITHOUT_PUBLIC_CONTENT',
} as const;
export type DashboardInconsistencyType = (typeof DashboardInconsistencyType)[keyof typeof DashboardInconsistencyType];
registerEnumType(DashboardInconsistencyType, {
  name: 'DashboardInconsistencyType',
});

@ObjectType()
export class DashboardActionLink {
  @Field(() => DashboardInsightAction)
  action!: DashboardInsightAction;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true })
  targetId?: string | null;
}

@ObjectType()
export class DashboardSummary {
  @Field(() => Int)
  eventsCount!: number;

  @Field(() => Int)
  eventGroupsCount!: number;

  @Field(() => Int)
  majorEventsCount!: number;
}

@ObjectType()
export class DashboardCalendarEvent {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => String)
  type!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => String, { nullable: true })
  majorEventName?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupName?: string | null;

  @Field(() => Int)
  attendancesCount!: number;

  @Field(() => Int)
  subscriptionsCount!: number;

  @Field(() => Boolean)
  allowSubscription!: boolean;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

  @Field(() => Boolean)
  shouldCollectAttendance!: boolean;

  @Field(() => Boolean)
  canCollectAttendanceNow!: boolean;
}

@ObjectType()
export class DashboardWeatherAlert {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => String)
  summary!: string;

  @Field(() => String)
  materialIcon!: string;

  @Field(() => Date)
  forecastTime!: Date;

  @Field(() => Int)
  temperature!: number;
}

@ObjectType()
export class DashboardCertificatePendingItem {
  @Field(() => DashboardCertificateTargetType)
  targetType!: DashboardCertificateTargetType;

  @Field(() => String)
  targetId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  subtitle!: string;

  @Field(() => Date)
  finishedAt!: Date;
}

@ObjectType()
export class DashboardPendingReceiptMajorEvent {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Int)
  pendingCount!: number;
}

@ObjectType()
export class DashboardPendingOfflineAttendanceEvent {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Int)
  pendingCount!: number;
}

@ObjectType()
export class DashboardSportsTournament {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => SportsTournamentStatus)
  status!: SportsTournamentStatus;

  @Field(() => Int)
  categoryCount!: number;

  @Field(() => Int)
  teamCount!: number;

  @Field(() => Int)
  pendingApplicationCount!: number;

  @Field(() => Int)
  pendingReviewCount!: number;

  @Field(() => Int)
  activeMatchCount!: number;
}

@ObjectType()
export class DashboardSportsMatch {
  @Field(() => String)
  matchId!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => String)
  categoryName!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => String, { nullable: true })
  homeTeamName?: string | null;

  @Field(() => String, { nullable: true })
  awayTeamName?: string | null;

  @Field(() => Float)
  homeScore!: number;

  @Field(() => Float)
  awayScore!: number;
}

@ObjectType()
export class DashboardInconsistency {
  @Field(() => DashboardInconsistencyType)
  type!: DashboardInconsistencyType;

  @Field(() => DashboardInsightAction, { nullable: true })
  action?: DashboardInsightAction | null;

  @Field(() => String, { nullable: true })
  targetId?: string | null;

  @Field(() => DashboardInsightSeverity)
  severity!: DashboardInsightSeverity;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  relatedEventId?: string | null;

  @Field(() => String, { nullable: true })
  personId?: string | null;
}

@ObjectType()
export class DashboardPermissionAction {
  @Field(() => String)
  scope!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  icon!: string;
}

@ObjectType()
export class DashboardPermissionGroup {
  @Field(() => String)
  type!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  resourceIcon!: string;

  @Field(() => [DashboardPermissionAction])
  actions!: DashboardPermissionAction[];
}

@ObjectType()
export class WorkspaceDashboardInsights {
  @Field(() => Date)
  generatedAt!: Date;

  @Field(() => DashboardSummary)
  summary!: DashboardSummary;

  @Field(() => [DashboardActionLink])
  suggestions!: DashboardActionLink[];

  @Field(() => [DashboardCalendarEvent])
  calendarEvents!: DashboardCalendarEvent[];

  @Field(() => [DashboardWeatherAlert])
  weatherAlerts!: DashboardWeatherAlert[];

  @Field(() => [DashboardCertificatePendingItem])
  pendingCertificates!: DashboardCertificatePendingItem[];

  @Field(() => Int)
  pendingReceiptValidationsCount!: number;

  @Field(() => [DashboardPendingReceiptMajorEvent])
  pendingReceiptMajorEvents!: DashboardPendingReceiptMajorEvent[];

  @Field(() => Int)
  pendingOfflineAttendancesCount!: number;

  @Field(() => [DashboardPendingOfflineAttendanceEvent])
  pendingOfflineAttendanceEvents!: DashboardPendingOfflineAttendanceEvent[];

  @Field(() => [DashboardSportsTournament])
  sportsTournaments!: DashboardSportsTournament[];

  @Field(() => [DashboardSportsMatch])
  sportsMatches!: DashboardSportsMatch[];

  @Field(() => [DashboardInconsistency])
  inconsistencies!: DashboardInconsistency[];

  @Field(() => Int)
  duplicatePeopleCount!: number;

  @Field(() => [DashboardPermissionGroup])
  permissions!: DashboardPermissionGroup[];
}
