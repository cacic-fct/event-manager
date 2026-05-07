import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export const DashboardInsightSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type DashboardInsightSeverity =
  (typeof DashboardInsightSeverity)[keyof typeof DashboardInsightSeverity];
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
} as const;
export type DashboardInsightAction =
  (typeof DashboardInsightAction)[keyof typeof DashboardInsightAction];
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
  EVENT_WITHOUT_LECTURER: 'EVENT_WITHOUT_LECTURER',
  LECTURER_DOUBLE_BOOKED: 'LECTURER_DOUBLE_BOOKED',
  LECTURER_SELF_SUBSCRIBED: 'LECTURER_SELF_SUBSCRIBED',
  LECTURER_SELF_ATTENDED: 'LECTURER_SELF_ATTENDED',
  SUSPICIOUS_DURATION: 'SUSPICIOUS_DURATION',
  SUSPICIOUS_DATE: 'SUSPICIOUS_DATE',
  PLACEHOLDER_EMOJI: 'PLACEHOLDER_EMOJI',
} as const;
export type DashboardInconsistencyType =
  (typeof DashboardInconsistencyType)[keyof typeof DashboardInconsistencyType];
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
export class DashboardInconsistency {
  @Field(() => DashboardInconsistencyType)
  type!: DashboardInconsistencyType;

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

  @Field(() => [DashboardInconsistency])
  inconsistencies!: DashboardInconsistency[];

  @Field(() => Int)
  duplicatePeopleCount!: number;

  @Field(() => [DashboardPermissionGroup])
  permissions!: DashboardPermissionGroup[];
}
