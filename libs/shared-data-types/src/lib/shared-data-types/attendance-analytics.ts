import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AttendanceTimeBucket {
  @Field(() => Date)
  start!: Date;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AttendanceMethodCount {
  @Field(() => String)
  method!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AttendanceCollectorProductivity {
  @Field(() => String)
  actorId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => Date)
  firstScanAt!: Date;

  @Field(() => Date)
  lastScanAt!: Date;

  @Field(() => [AttendanceMethodCount])
  methods!: AttendanceMethodCount[];

  @Field(() => Int)
  onlineCount!: number;

  @Field(() => Int)
  offlineCount!: number;
}

@ObjectType()
export class AttendanceHeatmapPoint {
  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Int)
  count!: number;

  @Field(() => Float, { nullable: true })
  averageAccuracyMeters?: number;
}

@ObjectType()
export class AttendanceReviewItem {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  kind!: string;

  @Field(() => String)
  severity!: string;

  @Field(() => String)
  status!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  summary!: string;

  @Field(() => Date)
  detectedAt!: Date;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => String, { nullable: true })
  actorId?: string;

  @Field(() => String, { nullable: true })
  actorName?: string;

  @Field(() => String, { nullable: true })
  deepLink?: string;
}

@ObjectType()
export class AttendanceReviewEventSummary {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Int)
  pendingCount!: number;

  @Field(() => Date)
  startDate!: Date;
}

@ObjectType()
export class EventAttendanceAnalyticsSnapshot {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  generatedAt!: Date;

  @Field(() => Int)
  windowMinutes!: number;

  @Field(() => Int)
  presentCount!: number;

  @Field(() => Int)
  noShowCount!: number;

  @Field(() => Int)
  pendingReviewCount!: number;

  @Field(() => Int)
  pendingOfflineCount!: number;

  @Field(() => Float, { nullable: true })
  eventLatitude?: number;

  @Field(() => Float, { nullable: true })
  eventLongitude?: number;

  @Field(() => [AttendanceTimeBucket])
  scansPerMinute!: AttendanceTimeBucket[];

  @Field(() => [AttendanceTimeBucket])
  scansByHour!: AttendanceTimeBucket[];

  @Field(() => [AttendanceCollectorProductivity])
  collectors!: AttendanceCollectorProductivity[];

  @Field(() => [AttendanceMethodCount])
  methods!: AttendanceMethodCount[];

  @Field(() => [AttendanceHeatmapPoint])
  heatmapPoints!: AttendanceHeatmapPoint[];

  @Field(() => [AttendanceReviewItem])
  reviewItems!: AttendanceReviewItem[];
}
